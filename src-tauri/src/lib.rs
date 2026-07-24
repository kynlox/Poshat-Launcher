// Точка входа в Rust-бэк. Тонкая обёртка: подключаем модули и регистрируем
// команды, которые фронт зовёт через `invoke(name, args)`.

mod accounts;
mod catalog;
mod elyby;
mod http;
mod instances;
mod java;
mod launch;
mod loaders;
mod mc_install;
mod paths;
mod security;
mod store;
mod versions;

use serde::Serialize;
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use tauri::Manager as _;

static STARTUP_INSTANCE_ID: OnceLock<Option<String>> = OnceLock::new();

/// Timestamp (millis) последнего сохранения размера окна.
/// Используется для дебаунса: Resized-события летят десятки раз в секунду
/// при тяге за рамку, и каждый flush на диск — дорого.
static LAST_RESIZE_SAVE_MS: AtomicU64 = AtomicU64::new(0);
const RESIZE_DEBOUNCE_MS: u64 = 400;

fn startup_instance_from_args() -> Option<String> {
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if let Some(id) = arg.strip_prefix("--instance=") {
            return Some(id.to_string());
        }
        if arg == "--instance" {
            return args.next();
        }
    }
    None
}

#[tauri::command]
fn get_startup_instance_id() -> Option<String> {
    STARTUP_INSTANCE_ID.get().cloned().flatten()
}

#[tauri::command]
fn hide_main_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Главное окно не найдено".to_string())?;
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Главное окно не найдено".to_string())?;
    let settings = store::get_settings();
    window.set_always_on_top(false).map_err(|e| e.to_string())?;
    window.set_resizable(true).map_err(|e| e.to_string())?;
    window
        .set_min_size(Some(tauri::LogicalSize::new(820, 560)))
        .map_err(|e| e.to_string())?;
    window
        .set_size(tauri::LogicalSize::new(
            settings.launcher_window_width,
            settings.launcher_window_height,
        ))
        .map_err(|e| e.to_string())?;
    window.set_title("Poshat Launcher").map_err(|e| e.to_string())?;
    if let Ok(img) = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png")) {
        let _ = window.set_icon(img);
    }
    window.center().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

fn save_window_size(window: &tauri::Window) {
    let Ok(size) = window.inner_size() else { return; };
    let scale = window.scale_factor().unwrap_or_else(|_| {
        // На высоком DPI (>1.0) fallback 1.0 сохранит слишком маленький
        // размер, и при следующем открытии окно будет крошечным. Пытаемся
        // узнать DPI через монитор — если и там неудача, fallback 1.0.
        if let Some(m) = window.current_monitor().ok().flatten() {
            m.scale_factor()
        } else {
            1.0
        }
    });
    let logical = size.to_logical::<u32>(scale);
    store::set_launcher_window_size(logical.width, logical.height);
}

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn maybe_save_window_size(window: &tauri::Window) {
    let now = now_millis();
    let last = LAST_RESIZE_SAVE_MS.load(Ordering::Relaxed);
    if now.saturating_sub(last) < RESIZE_DEBOUNCE_MS {
        return;
    }
    LAST_RESIZE_SAVE_MS.store(now, Ordering::Relaxed);
    save_window_size(window);
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Привет из Rust, {}!", name)
}

/// Зеркало `getRoots()` из Electron — фронту иногда нужно знать пути
/// (например, чтобы открыть папку инстансов в проводнике).
#[derive(Serialize)]
struct RootsView {
    root: String,
    instances: String,
    shared: String,
    runtime: String,
    java: String,
    #[serde(rename = "storeFile")]
    store_file: String,
}

#[tauri::command]
fn get_roots() -> RootsView {
    let r = paths::get_roots();
    RootsView {
        root: r.root.to_string_lossy().into_owned(),
        instances: r.instances.to_string_lossy().into_owned(),
        shared: r.shared.to_string_lossy().into_owned(),
        runtime: r.runtime.to_string_lossy().into_owned(),
        java: r.java.to_string_lossy().into_owned(),
        store_file: r.store_file.to_string_lossy().into_owned(),
    }
}

#[tauri::command]
fn get_settings() -> store::Settings { store::get_settings() }

#[tauri::command]
fn set_settings(patch: Value) -> store::Settings { store::set_settings(patch) }

#[tauri::command]
fn get_last_selection() -> store::LastSelection { store::get_last_selection() }

#[tauri::command]
fn set_last_selection(patch: Value) -> store::LastSelection { store::set_last_selection(patch) }

#[tauri::command]
fn get_offline_nickname() -> String { store::get_offline_nickname() }

#[tauri::command]
fn set_offline_nickname(name: String) -> String { store::set_offline_nickname(name) }

#[tauri::command]
fn get_last_instance_id() -> Option<String> { store::get_last_instance_id() }

#[tauri::command]
fn set_last_instance_id(id: Option<String>) -> Option<String> {
    // Если frontend пришлёт `id = "../etc"`, оно осядет в store.json и
    // следующая сессия попробует `instance_dir("../etc")`. Глушим тихо
    // (а не возвращаем Err) — это всего лишь сохранение последнего
    // выбора, ошибка не нужна; просто не сохраняем подозрительное.
    //
    // ВАЖНО: если id — Some(invalid), НЕ затираем существующий валидный
    // lastInstanceId (это был бы регресс UX — после случайного клика на
    // ярлык со сломанным id вся история выделения сбрасывается). Только
    // None явно сбрасывает.
    match id {
        None => store::set_last_instance_id(None),
        Some(s) => {
            if instances::validate_id(&s).is_ok() {
                store::set_last_instance_id(Some(s))
            } else {
                store::get_last_instance_id()
            }
        }
    }
}

// ----------------- versions -----------------

#[tauri::command]
async fn versions_list(
    types: Option<Vec<String>>,
    order: Option<String>,
    force: Option<bool>,
) -> Result<Vec<versions::VersionEntry>, String> {
    versions::list_versions(types, order, force.unwrap_or(false)).await
}

#[tauri::command]
async fn versions_latest() -> Result<Option<versions::VersionEntry>, String> {
    versions::get_latest().await
}

#[tauri::command]
async fn versions_refresh() -> Result<Vec<versions::VersionEntry>, String> {
    let m = versions::refresh().await?;
    Ok(m.versions.clone())
}

#[tauri::command]
fn versions_installed() -> Vec<String> {
    // Строгая проверка: и manifest, и client.jar должны лежать на диске.
    // Старый list_installed_versions смотрел только на json — давал ложно-
    // зелёную галочку, если клиент так и не докачался.
    mc_install::list_fully_installed_versions()
}

// ----------------- install / loaders -----------------

#[tauri::command]
async fn install_run(
    app: tauri::AppHandle,
    mc_version: String,
    loader: String,
    loader_version: Option<String>,
    nickname: String,
    instance_id: Option<String>,
) -> Result<mc_install::InstallResult, String> {
    mc_install::install_run(app, mc_version, loader, loader_version, nickname, instance_id).await
}

#[tauri::command]
fn install_cancel(task_id: String) -> bool {
    mc_install::cancel_task(&task_id)
}

#[tauri::command]
async fn loaders_list(
    loader: String,
    mc_version: String,
) -> Result<Vec<loaders::LoaderVersion>, String> {
    loaders::list_loader_versions(&loader, &mc_version).await
}

// ----------------- launch -----------------

#[tauri::command]
async fn launch_run(
    app: tauri::AppHandle,
    mc_version: String,
    loader: String,
    loader_version: Option<String>,
    memory_gb: Option<u16>,
    nickname: String,
    instance_id: Option<String>,
) -> Result<launch::LaunchResult, String> {
    launch::launch_run(app, mc_version, loader, loader_version, memory_gb, nickname, instance_id).await
}

#[tauri::command]
async fn launch_kill(pid: u32) -> Result<(), String> {
    launch::launch_kill(pid).await
}

// ----------------- instances -----------------

#[tauri::command]
fn instances_list() -> Vec<instances::InstanceView> {
    instances::list_instances()
}

#[tauri::command]
fn instances_get(id: String) -> Option<instances::InstanceView> {
    instances::get_instance(&id)
}

#[tauri::command]
fn instances_create(payload: instances::CreatePayload) -> Result<instances::InstanceView, String> {
    instances::create_instance(payload)
}

#[tauri::command]
fn instances_update(
    id: String,
    patch: instances::UpdatePayload,
) -> Result<instances::InstanceView, String> {
    instances::update_instance(&id, patch)
}

#[tauri::command]
fn instances_rename(id: String, name: String) -> Result<instances::InstanceView, String> {
    instances::rename_instance(&id, name)
}

#[tauri::command]
fn instances_delete(id: String) -> Result<bool, String> {
    instances::delete_instance(&id)
}

#[tauri::command]
fn instances_duplicate(id: String) -> Result<instances::InstanceView, String> {
    instances::duplicate_instance(&id)
}

#[tauri::command]
async fn instances_export_pack(
    app: tauri::AppHandle,
    id: String,
    out_path: Option<String>,
) -> Result<instances::PackResult, String> {
    tokio::task::spawn_blocking(move || instances::export_instance_pack(&id, out_path, Some(&app)))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn instances_import_pack(
    app: tauri::AppHandle,
    path: String,
) -> Result<instances::InstanceView, String> {
    tokio::task::spawn_blocking(move || instances::import_instance_pack(path, Some(&app)))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
fn instances_open_folder(id: String) -> Result<(), String> {
    instances::open_folder(&id)
}

#[tauri::command]
fn instances_create_shortcut(
    id: String,
    shortcut_name: Option<String>,
    icon_base64: Option<String>,
) -> Result<instances::ShortcutResult, String> {
    instances::create_desktop_shortcut(&id, shortcut_name, icon_base64)
}

#[tauri::command]
fn instances_disk_size(id: String) -> Result<u64, String> {
    instances::instance_disk_size(&id)
}

#[tauri::command]
fn instances_set_icon(id: String, icon: String) -> Result<String, String> {
    instances::set_instance_icon(&id, &icon)
}

#[tauri::command]
fn instances_get_icon(id: String) -> Option<String> {
    instances::get_instance_icon_path(&id)
}

#[tauri::command]
fn instances_set_cover(id: String, cover: String) -> Result<String, String> {
    instances::set_instance_cover(&id, &cover)
}

#[tauri::command]
fn instances_get_cover(id: String) -> Option<String> {
    instances::get_instance_cover(&id)
}

#[tauri::command]
fn instances_set_video_cover(id: String, file_name: String, cover: String) -> Result<String, String> {
    instances::set_instance_video_cover(&id, &file_name, &cover)
}

#[tauri::command]
fn instances_get_video_cover(id: String) -> Option<String> {
    instances::get_instance_video_cover_data(&id)
}

#[tauri::command]
fn instances_is_video_file(name: String) -> bool {
    instances::is_video_file(&name)
}

#[tauri::command]
fn instances_toggle_pin(id: String) -> Result<Vec<String>, String> {
    crate::instances::validate_id(&id)?;
    Ok(store::toggle_pinned_instance(&id))
}

#[tauri::command]
fn instances_get_pinned() -> Vec<String> {
    store::get_pinned_instances()
}

// ----------------- accounts -----------------

#[tauri::command]
fn accounts_list() -> Vec<accounts::PublicAccount> {
    accounts::list_accounts()
}

#[tauri::command]
fn accounts_active() -> Option<accounts::PublicAccount> {
    accounts::get_active_account_public()
}

#[tauri::command]
fn accounts_set_active(id: Option<String>) -> Result<Option<accounts::PublicAccount>, String> {
    accounts::set_active_account(id)
}

#[tauri::command]
fn accounts_remove(id: String) -> bool {
    accounts::remove_account(&id)
}

#[tauri::command]
fn accounts_add_offline(name: String) -> Result<accounts::PublicAccount, String> {
    accounts::add_offline_account(name)
}

#[tauri::command]
async fn accounts_elyby_login(
    username: String,
    password: String,
) -> Result<accounts::PublicAccount, String> {
    let r = elyby::login(username, password).await?;
    Ok(r.account)
}

#[tauri::command]
async fn accounts_elyby_refresh(id: String) -> Result<accounts::PublicAccount, String> {
    elyby::refresh(id).await
}

// ----------------- catalog -----------------

#[tauri::command]
async fn catalog_search(payload: catalog::SearchPayload) -> Result<Vec<Value>, String> {
    catalog::search(payload).await
}

#[tauri::command]
async fn catalog_install(payload: catalog::InstallPayload) -> Result<catalog::InstallResult, String> {
    catalog::install(payload).await
}

#[tauri::command]
async fn catalog_install_version(
    payload: catalog::InstallVersionPayload,
) -> Result<catalog::InstallResult, String> {
    catalog::install_version(payload).await
}

#[tauri::command]
async fn catalog_project(payload: catalog::ProjectPayload) -> Result<Value, String> {
    catalog::project(payload).await
}

#[tauri::command]
async fn catalog_versions(payload: catalog::VersionsPayload) -> Result<Vec<Value>, String> {
    catalog::versions(payload).await
}

#[tauri::command]
fn catalog_installed(payload: catalog::InstalledPayload) -> Vec<String> {
    catalog::installed(payload)
}

#[tauri::command]
fn catalog_remove(payload: catalog::RemoveInstalledPayload) -> Result<bool, String> {
    catalog::remove_installed(payload)
}

#[tauri::command]
async fn catalog_check_updates(
    payload: catalog::CheckUpdatesPayload,
) -> Result<Vec<catalog::UpdateInfo>, String> {
    catalog::check_updates(payload).await
}

#[tauri::command]
fn catalog_verify_files(
    payload: catalog::VerifyFilesPayload,
) -> Result<Vec<catalog::VerifyResult>, String> {
    catalog::verify_files(payload)
}

#[tauri::command]
async fn catalog_update_mod(
    payload: catalog::UpdateModPayload,
) -> Result<catalog::InstallResult, String> {
    catalog::update_mod(payload).await
}

// ----------------- settings: папки/кэш -----------------
//
// «Открыть папку игры» → проводник на корне `<APPDATA>/.poshatlauncher/`.
// «Очистить кэш» → удаляет `<root>/shared/` (вспомогательная общая папка,
//    куда раньше падали версии/библиотеки до того, как мы перешли на
//    автономные инстансы). Инстансы НЕ трогаем — там пользовательские саве.
// «Проверить файлы» оставляем UI-стороне как «перезапусти Play» — lyceris
//    при следующем install сам сверит sha и докачает недостающее.

#[tauri::command]
fn open_root_folder() -> Result<(), String> {
    let path = paths::get_roots().root.clone();
    let path_str = path.to_string_lossy().into_owned();
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("Не удалось открыть проводник: {}", e))?;
        Ok(())
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("Не удалось открыть папку: {}", e))?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("Не удалось открыть папку: {}", e))?;
        Ok(())
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        let _ = path_str;
        Err("Открытие папки не поддерживается на этой платформе".to_string())
    }
}

#[tauri::command]
fn clear_shared_cache() -> Result<u64, String> {
    let shared = paths::get_roots().shared.clone();
    if !shared.exists() {
        return Ok(0);
    }
    // Считаем размер до удаления — UI покажет «освобождено N МБ».
    let size = dir_size(&shared);
    std::fs::remove_dir_all(&shared)
        .map_err(|e| format!("Не удалось очистить {}: {}", shared.display(), e))?;
    // Сразу пересоздаём пустую папку — следующая операция, что захочет
    // shared/, иначе упадёт с «no such file or directory».
    let _ = std::fs::create_dir_all(&shared);
    Ok(size)
}

fn dir_size(path: &std::path::Path) -> u64 {
    let mut total: u64 = 0;
    let Ok(entries) = std::fs::read_dir(path) else { return 0; };
    for e in entries.flatten() {
        let Ok(ft) = e.file_type() else { continue; };
        if ft.is_symlink() { continue; }
        if ft.is_file() {
            if let Ok(m) = e.metadata() { total += m.len(); }
        } else if ft.is_dir() {
            total += dir_size(&e.path());
        }
    }
    total
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Anti-debug проверка ДО tauri::Builder. В debug-сборке no-op,
    // в release — exit(0xDEAD), если подцепили дебаггер.
    security::init();
    let startup_instance = startup_instance_from_args()
        .filter(|id| instances::validate_id(id).is_ok() && instances::get_instance(id).is_some());
    let _ = STARTUP_INSTANCE_ID.set(startup_instance);
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let settings = store::get_settings();
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(img) = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png")) {
                    let _ = window.set_icon(img);
                }
                if get_startup_instance_id().is_some() {
                    let _ = window.set_min_size(Some(tauri::LogicalSize::new(480, 260)));
                    let _ = window.set_size(tauri::LogicalSize::new(480, 260));
                    let _ = window.set_resizable(false);
                    let _ = window.set_always_on_top(true);
                    let _ = window.set_title("Запуск игры - Poshat Launcher");
                } else {
                    let _ = window.set_size(tauri::LogicalSize::new(
                        settings.launcher_window_width,
                        settings.launcher_window_height,
                    ));
                }
                let _ = window.center();
            }
            // Фоновый рефреш манифеста — заводим один раз внутри tauri runtime,
            // чтобы tokio-spawn попал в правильную async-ранатйм.
            versions::start_background_refresh();
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                match event {
                    tauri::WindowEvent::CloseRequested { .. } => {
                        // При закрытии — без дебаунса, гарантированно пишем.
                        save_window_size(window);
                    }
                    tauri::WindowEvent::Resized(_) => {
                        // При ресайзе — с дебаунсом: Resized летят десятки
                        // раз в секунду при тяге за рамку.
                        maybe_save_window_size(window);
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_startup_instance_id,
            hide_main_window,
            show_main_window,
            exit_app,
            get_roots,
            get_settings,
            set_settings,
            get_last_selection,
            set_last_selection,
            get_offline_nickname,
            set_offline_nickname,
            get_last_instance_id,
            set_last_instance_id,
            versions_list,
            versions_latest,
            versions_refresh,
            versions_installed,
            install_run,
            install_cancel,
            loaders_list,
            launch_run,
            launch_kill,
            instances_list,
            instances_get,
            instances_create,
            instances_update,
            instances_rename,
            instances_delete,
            instances_duplicate,
            instances_export_pack,
            instances_import_pack,
            instances_open_folder,
            instances_create_shortcut,
            instances_disk_size,
            instances_set_icon,
            instances_get_icon,
            instances_set_cover,
            instances_get_cover,
            instances_set_video_cover,
            instances_get_video_cover,
            instances_is_video_file,
            instances_toggle_pin,
            instances_get_pinned,
            accounts_list,
            accounts_active,
            accounts_set_active,
            accounts_remove,
            accounts_add_offline,
            accounts_elyby_login,
            accounts_elyby_refresh,
            open_root_folder,
            clear_shared_cache,
            catalog_search,
            catalog_install,
            catalog_install_version,
            catalog_project,
            catalog_versions,
            catalog_installed,
            catalog_remove,
            catalog_check_updates,
            catalog_verify_files,
            catalog_update_mod,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
