// Запуск Minecraft — тонкая обёртка над `lyceris::minecraft::launch::launch`.
// Команда возвращается СРАЗУ после spawn: UI получает pid, а процесс живёт в фоне.

use std::collections::HashMap;
use std::sync::Arc;

use once_cell::sync::Lazy;
use serde::Serialize;
use tauri::{AppHandle, Emitter as _};
use tokio::process::Child;
use tokio::sync::Mutex as AsyncMutex;

use lyceris::auth::AuthMethod;
use lyceris::minecraft::config::{Config, ConfigBuilder, Memory};
use lyceris::minecraft::emitter::{Emitter, Event};
use lyceris::minecraft::launch::launch as lyc_launch;
use lyceris::minecraft::loader::fabric::Fabric;
use lyceris::minecraft::loader::forge::Forge;
use lyceris::minecraft::loader::neoforge::NeoForge;
use lyceris::minecraft::loader::quilt::Quilt;
use lyceris::minecraft::loader::Loader;

use crate::paths::get_roots;

// ----------------------- результаты / события -----------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pub pid: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LogPayload<'a> {
    pid: u32,
    /// "stdout" | "stderr" | "system". В lyceris сейчас Console — это
    /// весь stdout (stderr не разделён); helle: stream всегда "stdout".
    /// Если в будущем lyceris разделит — поменяем.
    stream: &'a str,
    line: String,
    ts: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExitPayload {
    pid: u32,
    /// Код выхода. None если процесс был убит сигналом (Windows этого
    /// почти не делает, но на всякий случай).
    code: Option<i32>,
}

// ----------------------- реестр процессов -----------------------

/// Реестр запущенных Child. Используется и для kill, и для авточистки
/// в watcher'е. Лочим под асинхронным mutex'ом, потому что child.wait()
/// держит mut self долго — нельзя занимать parking_lot::Mutex.
static RUNNING: Lazy<AsyncMutex<HashMap<u32, Arc<AsyncMutex<Child>>>>> =
    Lazy::new(|| AsyncMutex::new(HashMap::new()));

// ----------------------- helpers (повторяют mc_install) -----------------------

fn offline_auth(nickname: &str) -> AuthMethod {
    AuthMethod::Offline {
        username: nickname.to_string(),
        // Mojang-совместимый MD5("OfflinePlayer:<name>"). Реализация
        // одна на весь крейт — в accounts.rs.
        uuid: Some(crate::accounts::offline_uuid(nickname)),
    }
}

/// Auth + доп. JVM-args под активный аккаунт. Для ely.by — Microsoft-вариант
/// + authlib-injector (без агента Mojang authserver вернёт 403).
async fn build_auth_and_args(nickname: &str) -> Result<(AuthMethod, Vec<String>), String> {
    // Если фронт передал ник — это «быстрый» offline-запуск с этим ником.
    // Если нет — берём активный аккаунт, иначе fallback на store-ник,
    // иначе "Player" (lyceris упадёт на пустом username).
    if !nickname.trim().is_empty() {
        return Ok((offline_auth(nickname), Vec::new()));
    }

    let Some(acc) = crate::accounts::get_active_account_full() else {
        let stored = crate::store::get_offline_nickname();
        let fallback = if stored.trim().is_empty() { "Player".to_string() } else { stored };
        return Ok((offline_auth(&fallback), Vec::new()));
    };

    match acc.r#type.as_str() {
        "elyby" => {
            // ely.by: Microsoft-вариант + authlib-injector. Если accessToken
            // отсутствует (например, юзер только что добавил аккаунт без
            // логина — гипотетически), валимся внятным сообщением.
            let mut access_token = acc.access_token.clone()
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    "У ely.by-аккаунта нет accessToken — войди заново на странице «Профили»".to_string()
                })?;

            // Если токен протух (expires_at < now), обновляем через ely.by refresh
            // ДО запуска — иначе Minecraft упадёт с auth-ошибкой на стороне сервера.
            let expired = acc.expires_at.map(|e| e < crate::elyby::now_ms()).unwrap_or(false);
            if expired {
                match crate::elyby::refresh(acc.id.clone()).await {
                    Ok(_updated) => {
                        // Обновлённый аккаунт уже сохранён в store через update_account_tokens.
                        // Перечитываем полную запись чтобы забрать свежие токены.
                        if let Some(fresh) = crate::accounts::get_active_account_full()
                            .filter(|a| a.id == acc.id)
                            .or_else(|| {
                                crate::store::list_account_records().into_iter()
                                    .find(|a| a.id == acc.id)
                            })
                        {
                            access_token = fresh.access_token.unwrap_or_default();
                        }
                    }
                    Err(e) => {
                        // Если refresh не удался — продолжаем со старым токеном.
                        // Возможно, он ещё жив (clock skew, неточный expires_at).
                        // Но предупреждаем в лог.
                        tracing::warn!(
                            "Не удалось обновить токен ely.by перед запуском: {}. \
                             Пробуем со старым токеном.",
                            e
                        );
                    }
                }
            }

            let agent_arg = crate::elyby::authlib_injector_jvm_arg().await
                .map_err(|e| format!("authlib-injector: {}", e))?;
            let auth = AuthMethod::Microsoft {
                username: acc.name.clone(),
                xuid: acc.uuid.clone(),
                uuid: acc.uuid.clone(),
                access_token,
                refresh_token: acc.refresh_token.clone().unwrap_or_default(),
            };
            Ok((auth, vec![agent_arg]))
        }
        _ => {
            // offline-аккаунт (или неизвестный тип): берём имя и uuid из
            // карточки. UUID уже посчитан через MD5 при создании аккаунта.
            Ok((
                AuthMethod::Offline {
                    username: acc.name.clone(),
                    uuid: Some(acc.uuid.clone()),
                },
                Vec::new(),
            ))
        }
    }
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Ядро запуска (параметризовано по лоадеру, для ванилы T = ()).
async fn do_launch<T: Loader + Send + 'static>(
    app: AppHandle,
    config: Config<T>,
) -> Result<u32, String> {
    let emitter = Emitter::default();

    // Подписываемся на Console заранее — иначе пропустим самые ранние
    // строки лога (когда Minecraft печатает classpath и пр.).
    {
        let app = app.clone();
        emitter
            .on(Event::Console, move |line: String| {
                let _ = app.emit(
                    "launch:log",
                    LogPayload {
                        // pid в Console-эвенте у lyceris не доступен —
                        // фронт связывает строки с pid через текущий
                        // runningPid в page.jsx, так что 0 здесь ОК.
                        pid: 0,
                        stream: "stdout",
                        line,
                        ts: now_ms(),
                    },
                );
            })
            .await;
    }

    let child = lyc_launch(&config, Some(&emitter))
        .await
        .map_err(|e| format!("Не удалось запустить Minecraft: {}", e))?;

    let pid = match child.id() {
        Some(p) => p,
        None => {
            drop(child);
            return Err("Не удалось получить PID процесса".to_string());
        }
    };

    // Stdout-стрим уже вычерпывается внутри lyceris (см. launch.rs:218
    // в исходнике lyceris). Stderr lyceris не трогает — теряется, но
    // основной канал логов открыт.
    let child_arc = Arc::new(AsyncMutex::new(child));
    RUNNING.lock().await.insert(pid, child_arc.clone());

    // Watcher: ждём завершения процесса, дёргаем launch:exit, чистим реестр.
    {
        let app_clone = app.clone();
        let child_arc_clone = child_arc.clone();
        tauri::async_runtime::spawn(async move {
            // child.wait() требует &mut Child; держим mutex всё время ожидания.
            let status_res = {
                let mut guard = child_arc_clone.lock().await;
                guard.wait().await
            };

            let code = status_res.ok().and_then(|s| s.code());

            RUNNING.lock().await.remove(&pid);

            let _ = app_clone.emit("launch:exit", ExitPayload { pid, code });
        });
    }

    // Watcher: определяем момент, когда окно Minecraft реально появилось на
    // экране. Опрос каждые 500 мс через WinAPI (EnumWindows + GetWindowThreadProcessId).
    // Когда окно найдено — шлём launch:minecraft_ready. Фронт в shortcut-режиме
    // закроет лаунчер только после этого события.
    {
        let app_clone = app.clone();
        tauri::async_runtime::spawn(async move {
            let pid = pid;
            #[cfg(target_os = "windows")]
            {
                use std::ffi::c_void;
                use std::sync::atomic::{AtomicBool, Ordering};
                use std::sync::Arc;

                #[allow(clippy::upper_case_acronyms)]
                type HWND = *mut c_void;

                extern "system" {
                    fn EnumWindows(lpEnumFunc: *mut c_void, lParam: isize) -> i32;
                    fn IsWindowVisible(hwnd: HWND) -> i32;
                    fn GetWindowThreadProcessId(hwnd: HWND, lpdwProcessId: *mut u32) -> u32;
                    fn GetWindowTextLengthW(hwnd: HWND) -> i32;
                }

                #[repr(C)]
                struct EnumCtx {
                    target_pid: u32,
                    found: Arc<AtomicBool>,
                }

                unsafe extern "system" fn enum_callback(hwnd: HWND, l_param: isize) -> i32 {
                    let ctx = &mut *(l_param as *mut EnumCtx);
                    let mut win_pid: u32 = 0;
                    GetWindowThreadProcessId(hwnd, &mut win_pid);
                    if win_pid == ctx.target_pid && IsWindowVisible(hwnd) != 0 {
                        let title_len = GetWindowTextLengthW(hwnd);
                        if title_len > 0 {
                            ctx.found.store(true, Ordering::Release);
                            return 0; // stop enumeration
                        }
                    }
                    1 // continue
                }

                let found = Arc::new(AtomicBool::new(false));
                for _ in 0..120 {
                    // макс 60 сек (120 * 500мс)
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    let mut ctx = EnumCtx {
                        target_pid: pid,
                        found: found.clone(),
                    };
                    unsafe {
                        EnumWindows(
                            enum_callback as *mut c_void,
                            &mut ctx as *mut EnumCtx as isize,
                        );
                    }
                    if found.load(Ordering::Acquire) {
                        let _ = app_clone.emit("launch:minecraft_ready",());
                        return;
                    }
                }
                // Не дождались — всё равно шлём, чтобы лаунчер не завис навечно.
                let _ = app_clone.emit("launch:minecraft_ready", ());
            }
            #[cfg(not(target_os = "windows"))]
            {
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                let _ = app_clone.emit("launch:minecraft_ready", ());
            }
        });
    }

    Ok(pid)
}

// ----------------------- публичная команда -----------------------

pub async fn launch_run(
    app: AppHandle,
    mc_version: String,
    loader: String,
    loader_version: Option<String>,
    memory_gb: Option<u16>,
    nickname: String,
    instance_id: Option<String>,
) -> Result<LaunchResult, String> {
    crate::instances::validate_version(&mc_version)?;
    if let Some(ref lv) = loader_version {
        if !lv.is_empty() {
            crate::instances::validate_version(lv)?;
        }
    }

    let loader_lc = loader.to_lowercase();
    let loader_pair: Option<(&str, &str)> = match loader_lc.as_str() {
        "vanilla" | "" => None,
        name @ ("fabric" | "quilt" | "forge" | "neoforge") => match loader_version.as_deref() {
            Some(v) if !v.is_empty() => Some((name, v)),
            _ => return Err(format!("Для лоадера {} нужна версия", name)),
        },
        other => return Err(format!("Неизвестный лоадер: {}", other)),
    };

    // То же правило что в install: instance_id → его minecraft/, иначе shared.
    // Критически важно — иначе lyceris запустит клиент из shared, а UI
    // показывает «играет в инстанс».
    let game_dir = match instance_id.as_deref() {
        Some(id) if !id.is_empty() => {
            crate::instances::validate_id(id)?;
            crate::instances::game_dir_of(id)
        }
        _ => get_roots().shared.clone(),
    };

    // Если фронт не прислал ник — auth построится по активному аккаунту
    // (offline или ely.by). Если прислал — обычный offline с этим ником
    // (для тестового запуска без выбранного профиля).
    let (auth, mut extra_jvm) = build_auth_and_args(&nickname).await?;
    // Зажимаем память в осмысленный диапазон. 0 GB лоадит -Xmx0G и JVM
    // мгновенно валится с «too small initial heap»; верх — 32 GB, чтобы
    // случайная ошибка ввода (320 вместо 32) не пыталась поднять heap
    // больше доступной физпамяти и не получала OOM от ОС.
    let mem_gb = memory_gb.unwrap_or(4).clamp(1, 32);
    let memory = Memory::Gigabyte(mem_gb);

    // Дотягиваем настройки игры/JVM из стора. Не падаем, если стор пуст —
    // используем default из Settings::default().
    let settings = crate::store::get_settings();

    // 1) GC-тип. "default" — ничего не добавляем, иначе соответствующий флаг.
    //    Эти флаги обратно-совместимы для Java 17/21 — наших целевых JDK.
    match settings.gc_type.as_str() {
        "g1"          => extra_jvm.push("-XX:+UseG1GC".to_string()),
        "zgc"         => extra_jvm.push("-XX:+UseZGC".to_string()),
        "shenandoah"  => extra_jvm.push("-XX:+UseShenandoahGC".to_string()),
        _ => {} // default: не трогаем
    }
    // 2) Пользовательские JVM-аргументы. Разделяем по whitespace (новые
    //    строки и пробелы — оба разделители). Пустые токены отсекаем.
    for tok in settings.extra_jvm_args.split_whitespace() {
        if !tok.is_empty() {
            extra_jvm.push(tok.to_string());
        }
    }

    // 3) --width/--height для окна Minecraft. lyceris доставит их в конец
    //    игровой строки (после --), Minecraft их уважает.
    let custom_game_args: Vec<String> = vec![
        "--width".to_string(),
        settings.mc_window_width.to_string(),
        "--height".to_string(),
        settings.mc_window_height.to_string(),
    ];

    // Ветки строго аналогичны install_run — генерик T меняется.
    let pid = match loader_pair {
        None => {
            let config: Config<()> = ConfigBuilder::new(game_dir, mc_version.clone(), auth)
                .memory(memory)
                .custom_java_args(extra_jvm)
                .custom_args(custom_game_args)
                .build();
            do_launch(app, config).await?
        }
        Some(("fabric", v)) => {
            let config: Config<Box<dyn Loader>> =
                ConfigBuilder::new(game_dir, mc_version.clone(), auth)
                    .memory(memory)
                    .custom_java_args(extra_jvm)
                    .custom_args(custom_game_args)
                    .loader(Box::new(Fabric(v.to_string())))
                    .build();
            do_launch(app, config).await?
        }
        Some(("quilt", v)) => {
            let config: Config<Box<dyn Loader>> =
                ConfigBuilder::new(game_dir, mc_version.clone(), auth)
                    .memory(memory)
                    .custom_java_args(extra_jvm)
                    .custom_args(custom_game_args)
                    .loader(Box::new(Quilt(v.to_string())))
                    .build();
            do_launch(app, config).await?
        }
        Some(("forge", v)) => {
            let config: Config<Box<dyn Loader>> =
                ConfigBuilder::new(game_dir, mc_version.clone(), auth)
                    .memory(memory)
                    .custom_java_args(extra_jvm)
                    .custom_args(custom_game_args)
                    .loader(Box::new(Forge(v.to_string())))
                    .build();
            do_launch(app, config).await?
        }
        Some(("neoforge", v)) => {
            let config: Config<Box<dyn Loader>> =
                ConfigBuilder::new(game_dir, mc_version.clone(), auth)
                    .memory(memory)
                    .custom_java_args(extra_jvm)
                    .custom_args(custom_game_args)
                    .loader(Box::new(NeoForge(v.to_string())))
                    .build();
            do_launch(app, config).await?
        }
        Some((other, _)) => return Err(format!("Неизвестный лоадер: {}", other)),
    };

    // Зафиксировать «играли сейчас» — UI после этого сортирует инстансы
    // по lastPlayed и показывает наш инстанс наверху списка.
    if let Some(id) = instance_id.as_deref() {
        if !id.is_empty() {
            let _ = crate::instances::record_play(id);
        }
    }

    Ok(LaunchResult { pid })
}

/// Принудительно завершить запущенный Minecraft по pid.
/// Watcher сам пошлёт launch:exit и почистит RUNNING.
///
/// ВНИМАНИЕ: НЕ берём `Arc<Mutex<Child>>` из RUNNING — её AsyncMutex
/// уже захвачен watcher'ом (`guard.wait().await` лочит его на всё время
/// жизни процесса), и любой `lock().await` здесь подвиснет навсегда.
/// Поэтому убиваем по pid через `taskkill /F /T /PID` — Windows-only,
/// но проект и так собирается под Windows (`windows_subsystem = "windows"`).
/// `/T` валит и дочерние процессы (на случай если javaw породил кого-то).
pub async fn launch_kill(pid: u32) -> Result<(), String> {
    // Сначала убедимся, что pid действительно наш — иначе фронт со
    // стейл-стейтом мог бы случайно прибить чужой процесс с тем же id.
    // Если pid уже ушёл из реестра (процесс завершился сам, либо это
    // повторный клик «Стоп»), считаем операцию выполненной: для UI это
    // то же самое — «больше не запущен».
    {
        let registry = RUNNING.lock().await;
        if !registry.contains_key(&pid) {
            return Ok(());
        }
    }

    #[cfg(target_os = "windows")]
    let mut kill_command = tokio::process::Command::new("taskkill");
    #[cfg(not(target_os = "windows"))]
    let mut kill_command = tokio::process::Command::new("kill");

    #[cfg(target_os = "windows")]
    let status = kill_command
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .map_err(|e| format!("Не удалось завершить процесс: {}", e))?;
    #[cfg(not(target_os = "windows"))]
    let status = kill_command
        .args(["-TERM", &pid.to_string()])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .map_err(|e| format!("Не удалось завершить процесс: {}", e))?;

    if !status.success() {
        // Между проверкой реестра и вызовом taskkill процесс мог уйти —
        // тогда taskkill вернёт ненулевой код, но это не «настоящая»
        // ошибка. Если pid пропал из реестра — считаем убитым.
        if !RUNNING.lock().await.contains_key(&pid) {
            return Ok(());
        }
        return Err(format!(
            "taskkill вернул код {} для процесса {}",
            status.code().unwrap_or(-1),
            pid
        ));
    }
    Ok(())
}
