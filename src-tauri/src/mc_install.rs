// Установщик Minecraft + лоадеров. Тонкая обёртка над `lyceris`.
// Добавили: проксирование событий lyceris → Tauri-эвенты, механизм отмены
// через `tokio::sync::Notify` (lyceris его не предоставляет).
//
// Архитектура: ConfigBuilder дженерик по типу лоадера (`Config<T: Loader>`),
// поэтому ванила и лоадер возвращают РАЗНЫЕ типы — общую функцию build_config
// сделать нельзя, есть две параллельные ветки в `install_run`.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter as _};
use tokio::sync::Notify;

use lyceris::auth::AuthMethod;
use lyceris::minecraft::config::{Config, ConfigBuilder};
use lyceris::minecraft::emitter::{Emitter, Event};
use lyceris::minecraft::install::install as lyc_install;
use lyceris::minecraft::loader::fabric::Fabric;
use lyceris::minecraft::loader::forge::Forge;
use lyceris::minecraft::loader::neoforge::NeoForge;
use lyceris::minecraft::loader::quilt::Quilt;
use lyceris::minecraft::loader::Loader;

use crate::paths::get_roots;

// ----------------------- результат / события -----------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub task_id: String,
    /// id профиля в `<shared>/versions/`, под которым лежат файлы. Для
    /// ванилы это «1.21.4», для лоадера — что-то вроде
    /// «1.21.4-0.16.0» (формат задаёт lyceris через get_version_name).
    pub resolved_version_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload<'a> {
    task_id: &'a str,
    label: String,
    /// 0..100. UI читает именно это поле (Electron-контракт). Если
    /// прогресс неизвестен (total == 0) — шлём 0, чтобы UI плавно
    /// отрисовал «прогресс начался» вместо «прогресс пропал».
    percent: f64,
    current: u64,
    total: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DonePayload<'a> {
    task_id: &'a str,
    resolved_version_id: &'a str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload<'a> {
    task_id: &'a str,
    message: String,
}

// ----------------------- реестр отмены -----------------------

struct TaskHandle {
    cancel: Arc<Notify>,
}

static TASKS: Lazy<Mutex<HashMap<String, TaskHandle>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static TASK_COUNTER: AtomicU64 = AtomicU64::new(1);

fn new_task() -> (String, Arc<Notify>) {
    let id = format!("inst-{}", TASK_COUNTER.fetch_add(1, Ordering::Relaxed));
    let cancel = Arc::new(Notify::new());
    TASKS.lock().insert(
        id.clone(),
        TaskHandle {
            cancel: cancel.clone(),
        },
    );
    (id, cancel)
}

fn drop_task(id: &str) {
    TASKS.lock().remove(id);
}

pub fn cancel_task(task_id: &str) -> bool {
    if let Some(h) = TASKS.lock().get(task_id) {
        h.cancel.notify_waiters();
        true
    } else {
        false
    }
}

// ----------------------- helpers -----------------------

/// Преобразовать ник в стабильный Mojang-совместимый UUID — `MD5("OfflinePlayer:<name>")`
/// плюс v3-битовая маска. Отдаём прокси в accounts::offline_uuid, чтобы алгоритм
/// был ровно один — иначе при запуске и установке UUID разъезжаются, и
/// сервер с track-by-UUID видит «двух игроков».
fn offline_uuid(name: &str) -> String {
    crate::accounts::offline_uuid(name)
}

fn short_name(path: &str) -> String {
    path.rsplit(['/', '\\'])
        .next()
        .unwrap_or(path)
        .to_string()
}

/// Имя профиля, которое lyceris соберёт для пары (mc, loader, version).
/// Должно совпадать с `Config::get_version_name()` (см. config.rs:210 в lyceris).
fn version_name_for(mc_version: &str, loader_pair: Option<(&str, &str)>) -> String {
    match loader_pair {
        None => mc_version.to_string(),
        Some((_, loader_ver)) => format!("{}-{}", mc_version, loader_ver),
    }
}

/// Лечит сломанные артефакты предыдущей установки. lyceris в install.rs:90
/// делает `if !json.exists() fetch+write else read_json`. Если прошлый
/// запуск умер между созданием файла и записью содержимого (отмена,
/// краш, сеть упала) — на диске остаётся 0-байтовый `<id>.json`. На
/// следующем запуске lyceris читает его и падает с «EOF while parsing
/// a value at line 1 column 0».
///
/// Решение — перед install проверить и удалить очевидно битые файлы:
///   * .json пустой или не парсится как JSON → удалить
///   * .jar нулевого размера → удалить (lyceris сам перекачает по SHA)
///
/// .jar с непустым содержимым НЕ трогаем: даже если он чуть-чуть кривой,
/// lyceris сверит SHA из манифеста и перекачает при несовпадении.
fn sanitize_version_dir(game_dir: &std::path::Path, version_name: &str) {
    let dir = game_dir.join("versions").join(version_name);
    let json_path = dir.join(format!("{}.json", version_name));
    let jar_path = dir.join(format!("{}.jar", version_name));

    if json_path.exists() {
        let bad = match std::fs::read_to_string(&json_path) {
            Err(_) => true,
            Ok(s) => {
                s.trim().is_empty()
                    || serde_json::from_str::<serde_json::Value>(&s).is_err()
            }
        };
        if bad {
            tracing::warn!("чищу битый {}", json_path.display());
            let _ = std::fs::remove_file(&json_path);
        }
    }

    if jar_path.exists() {
        if let Ok(meta) = std::fs::metadata(&jar_path) {
            if meta.len() == 0 {
                tracing::warn!("чищу пустой {}", jar_path.display());
                let _ = std::fs::remove_file(&jar_path);
            }
        }
    }
}

fn is_fully_installed(game_dir: &std::path::Path, version_name: &str) -> bool {
    let dir = game_dir.join("versions").join(version_name);
    let json_path = dir.join(format!("{}.json", version_name));
    let jar_path = dir.join(format!("{}.jar", version_name));
    let json_ok = std::fs::read_to_string(json_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .is_some();
    let jar_ok = std::fs::metadata(jar_path).map(|m| m.len() > 0).unwrap_or(false);
    json_ok && jar_ok
}

/// Подписать lyceris-эмиттер на наши Tauri-эвенты. Сигнатуры listener'ов
/// — те, что lyceris ровно посылает в `emit(...)`. Параметр FileType
/// (см. downloader.rs) приходит к нам уже преобразованным в строку через
/// .to_string() — поэтому листенер ожидает 4-й аргумент типа String.
async fn wire_emitter(app: AppHandle, task_id: String, em: &Emitter) {
    // SingleDownloadProgress: один большой файл (например, скачивание
    // дистрибутива Java или manifest). Кортеж — (path, current_bytes, total_bytes).
    {
        let app = app.clone();
        let task_id = task_id.clone();
        em.on(
            Event::SingleDownloadProgress,
            move |(path, current, total): (String, u64, u64)| {
                let percent = if total > 0 {
                    (current as f64 / total as f64) * 100.0
                } else {
                    0.0
                };
                let _ = app.emit(
                    "install:progress",
                    ProgressPayload {
                        task_id: &task_id,
                        label: format!("Скачиваю {}", short_name(&path)),
                        percent,
                        current,
                        total,
                    },
                );
            },
        )
        .await;
    }

    // MultipleDownloadProgress: пакетная закачка. current/total — счёт
    // ФАЙЛОВ, не байтов. Четвёртый аргумент — строковое имя категории
    // ("Library" / "Asset" / "Java" / "Custom").
    {
        let app = app.clone();
        let task_id = task_id.clone();
        em.on(
            Event::MultipleDownloadProgress,
            move |(path, current, total, kind): (String, u64, u64, String)| {
                let percent = if total > 0 {
                    (current as f64 / total as f64) * 100.0
                } else {
                    0.0
                };
                let prefix = match kind.as_str() {
                    "Library" => "Библиотеки",
                    "Asset" => "Ассеты",
                    "Java" => "Java",
                    "Custom" => "Файлы",
                    _ => "Файлы",
                };
                let _ = app.emit(
                    "install:progress",
                    ProgressPayload {
                        task_id: &task_id,
                        label: format!("{}: {}", prefix, short_name(&path)),
                        percent,
                        current,
                        total,
                    },
                );
            },
        )
        .await;
    }
}

/// Сборка AuthMethod для офлайн-режима. Lyceris требует это даже для
/// одной только установки (Config обязательно содержит authentication).
fn offline_auth(nickname: &str) -> AuthMethod {
    AuthMethod::Offline {
        username: nickname.to_string(),
        uuid: Some(offline_uuid(nickname)),
    }
}

/// Дженерик-«ядро» установки. Принимает уже собранный Config<T> с
/// нужным лоадером (для ванилы T = ()), эмиттер уже подписан на наши
/// Tauri-эвенты, реестр отмены — снаружи. Возвращает строку с id
/// профиля (через get_version_name — у lyceris это «<mc>-<loaderVer>»).
async fn do_install<T: Loader>(
    config: Config<T>,
    emitter: &Emitter,
    cancel: Arc<Notify>,
) -> Result<String, String> {
    let resolved = config.get_version_name();
    let install_future = lyc_install(&config, Some(emitter));
    let cancel_future = async move { cancel.notified().await };

    let outcome = tokio::select! {
        res = install_future => res.map_err(|e| {
            // reqwest::Error::Display показывает только верхушку («error
            // sending request for url (...)»), но настоящая причина (DNS,
            // TLS handshake, connection refused, timeout) лежит во вложенных
            // source(). Развернём всю цепочку — без неё диагностировать
            // сетевые сбои у пользователей бесполезно.
            let mut chain: Vec<String> = vec![e.to_string()];
            let mut src: Option<&(dyn std::error::Error + 'static)> = std::error::Error::source(&e);
            while let Some(s) = src {
                chain.push(s.to_string());
                src = s.source();
            }
            format!("Установка не удалась: {}", chain.join(" → "))
        }),
        _ = cancel_future => Err("Установка отменена пользователем".to_string()),
    };
    outcome.map(|_| resolved)
}

// ----------------------- публичные команды -----------------------

pub async fn install_run(
    app: AppHandle,
    mc_version: String,
    loader: String,
    loader_version: Option<String>,
    nickname: String,
    instance_id: Option<String>,
) -> Result<InstallResult, String> {
    let (task_id, cancel) = new_task();

    crate::instances::validate_version(&mc_version).inspect_err(|e| {
        let _ = app.emit("install:error", ErrorPayload { task_id: &task_id, message: e.clone() });
        drop_task(&task_id);
    })?;
    if let Some(ref lv) = loader_version {
        if !lv.is_empty() {
            crate::instances::validate_version(lv).inspect_err(|e| {
                let _ = app.emit("install:error", ErrorPayload { task_id: &task_id, message: e.clone() });
                drop_task(&task_id);
            })?;
        }
    }

    let loader_lc = loader.to_lowercase();
    let loader_pair: Option<(&str, &str)> = match loader_lc.as_str() {
        "vanilla" | "" => None,
        name @ ("fabric" | "quilt" | "forge" | "neoforge") => match loader_version.as_deref() {
            Some(v) if !v.is_empty() => Some((name, v)),
            _ => {
                let msg = format!("Для лоадера {} нужна версия", name);
                let _ = app.emit("install:error", ErrorPayload { task_id: &task_id, message: msg.clone() });
                drop_task(&task_id);
                return Err(msg);
            }
        },
        other => {
            let msg = format!("Неизвестный лоадер: {}", other);
            let _ = app.emit("install:error", ErrorPayload { task_id: &task_id, message: msg.clone() });
            drop_task(&task_id);
            return Err(msg);
        }
    };

    // Ник: пришёл от фронта — берём; пустой — берём ник активного аккаунта;
    // нет аккаунтов — `get_offline_nickname` из стора; пустой и там — Player.
    // Lyceris требует Config.authentication даже на install, иначе падает на
    // пустом username.
    let effective_nick = if nickname.trim().is_empty() {
        crate::accounts::active_display_name()
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| {
                let n = crate::store::get_offline_nickname();
                if n.trim().is_empty() { "Player".to_string() } else { n }
            })
    } else {
        nickname
    };

    // Если передан instance_id — устанавливаем В папку инстанса
    // (`<instances>/<id>/minecraft/`). lyceris положит туда versions,
    // libraries, assets и весь рантайм. Без instance_id — shared,
    // как было раньше (быстрая установка без инстанса).
    let game_dir = match instance_id.as_deref() {
        Some(id) if !id.is_empty() => {
            if let Err(e) = crate::instances::validate_id(id) {
                drop_task(&task_id);
                return Err(e);
            }
            crate::instances::game_dir_of(id)
        }
        _ => get_roots().shared.clone(),
    };
    let resolved_version_id = version_name_for(&mc_version, loader_pair);
    if is_fully_installed(&game_dir, &resolved_version_id) {
        drop_task(&task_id);
        let _ = app.emit(
            "install:done",
            DonePayload {
                task_id: &task_id,
                resolved_version_id: &resolved_version_id,
            },
        );
        return Ok(InstallResult {
            task_id,
            resolved_version_id,
        });
    }
    let auth = offline_auth(&effective_nick);

    // Лечим артефакты прошлой неуспешной попытки (см. sanitize_version_dir).
    // Имя профиля = ровно то, что построит lyceris внутри. Если бы мы
    // считали имя «на глаз», легко разъехались бы и чистили не ту папку.
    sanitize_version_dir(&game_dir, &resolved_version_id);

    // Эмиттер подписываем до запуска install, чтобы не пропустить
    // первые события (lyceris шлёт их синхронно по мере хода).
    let emitter = Emitter::default();
    wire_emitter(app.clone(), task_id.clone(), &emitter).await;
    let _ = app.emit(
        "install:progress",
        ProgressPayload {
            task_id: &task_id,
            label: "Подготовка манифеста…".to_string(),
            percent: 0.0,
            current: 0,
            total: 0,
        },
    );

    // Здесь раскрытие генериков: каждая ветка строит Config<T> с
    // конкретным T (или с unit-типом ()), и зовёт обобщённый do_install.
    let result = match loader_pair {
        None => {
            let config: Config<()> =
                ConfigBuilder::new(game_dir, mc_version.clone(), auth).build();
            do_install(config, &emitter, cancel.clone()).await
        }
        Some(("fabric", v)) => {
            let config: Config<Box<dyn Loader>> =
                ConfigBuilder::new(game_dir, mc_version.clone(), auth)
                    .loader(Box::new(Fabric(v.to_string())))
                    .build();
            do_install(config, &emitter, cancel.clone()).await
        }
        Some(("quilt", v)) => {
            let config: Config<Box<dyn Loader>> =
                ConfigBuilder::new(game_dir, mc_version.clone(), auth)
                    .loader(Box::new(Quilt(v.to_string())))
                    .build();
            do_install(config, &emitter, cancel.clone()).await
        }
        Some(("forge", v)) => {
            let config: Config<Box<dyn Loader>> =
                ConfigBuilder::new(game_dir, mc_version.clone(), auth)
                    .loader(Box::new(Forge(v.to_string())))
                    .build();
            do_install(config, &emitter, cancel.clone()).await
        }
        Some(("neoforge", v)) => {
            let config: Config<Box<dyn Loader>> =
                ConfigBuilder::new(game_dir, mc_version.clone(), auth)
                    .loader(Box::new(NeoForge(v.to_string())))
                    .build();
            do_install(config, &emitter, cancel.clone()).await
        }
        Some((other, _)) => Err(format!("Неизвестный лоадер: {}", other)),
    };

    drop_task(&task_id);

    match result {
        Ok(resolved) => {
            let _ = app.emit(
                "install:done",
                DonePayload {
                    task_id: &task_id,
                    resolved_version_id: &resolved,
                },
            );
            Ok(InstallResult {
                task_id: task_id.clone(),
                resolved_version_id: resolved,
            })
        }
        Err(msg) => {
            let _ = app.emit(
                "install:error",
                ErrorPayload {
                    task_id: &task_id,
                    message: msg.clone(),
                },
            );
            Err(msg)
        }
    }
}

/// Строгая проверка установленности: на диске должны быть и `<id>.json`,
/// и `<id>.jar`. Старая `versions::list_installed_versions` проверяла
/// только json — зажигала зелёную галочку, даже если клиент так и не
/// докачался.
///
/// Сканируем как `<shared>/versions/` (старый «общий» режим установки
/// с Home-таба без выбора инстанса), так и `<instances>/*/minecraft/versions/`
/// (новый режим с автономными инстансами). Иначе UI «забывал» все версии,
/// которые юзер ставил внутрь инстансов, и в пикере версий ни у одной
/// карточки не было зелёного бейджа «скачано».
pub fn list_fully_installed_versions() -> Vec<String> {
    use std::collections::BTreeSet;
    let mut set: BTreeSet<String> = BTreeSet::new();

    let roots = get_roots();
    scan_versions_dir(&roots.shared.join("versions"), &mut set);

    if let Ok(entries) = std::fs::read_dir(&roots.instances) {
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let dir = entry.path().join("minecraft").join("versions");
                scan_versions_dir(&dir, &mut set);
            }
        }
    }

    set.into_iter().collect()
}

fn scan_versions_dir(dir: &std::path::Path, out: &mut std::collections::BTreeSet<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let id = entry.file_name().to_string_lossy().into_owned();
        let p = entry.path();
        let json_ok = p.join(format!("{}.json", id)).exists();
        let jar_ok = p.join(format!("{}.jar", id)).exists();
        if json_ok && jar_ok {
            out.insert(id);
        }
    }
}
