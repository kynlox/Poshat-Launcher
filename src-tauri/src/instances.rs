// Инстансы: каждый = папка <root>/instances/<id>/ + JSON-метадата,
// внутри `minecraft/` — game_dir для Lyceris (install + launch).
//
// Каждый инстанс автономен (свой полный Minecraft-набор): Lyceris выводит
// ВСЕ пути от одного game_dir, расшаривание versions/libraries/assets
// потребовало бы junction-фабрику — пока не делаем.
// id = slug имени с транслитом + дедуп-суффикс. Контракт совпадает с
// Electron-сборкой (старый instances/ читается без миграции).

use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

use crate::paths::{ensure_dir, get_roots};

/// Метадата инстанса (поля совпадают с Electron-сборкой, включая casing).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceMeta {
    pub name: String,
    #[serde(rename = "mcVersion")]
    pub mc_version: String,
    #[serde(default = "default_loader")]
    pub loader: String,
    #[serde(default, rename = "loaderVersion")]
    pub loader_version: Option<String>,
    #[serde(default, rename = "memoryGb")]
    pub memory_gb: Option<u16>,
    #[serde(default, rename = "createdAt")]
    pub created_at: Option<String>,
    #[serde(default, rename = "lastPlayed")]
    pub last_played: Option<String>,
    #[serde(default, rename = "iconPath")]
    pub icon_path: Option<String>,
    #[serde(default, rename = "coverPath")]
    pub cover_path: Option<String>,
    #[serde(default, rename = "videoCoverPath")]
    pub video_cover_path: Option<String>,
    #[serde(default, rename = "javaArgs")]
    pub java_args: Option<String>,
}

fn default_loader() -> String { "vanilla".to_string() }

/// Что UI получает из list/get/create/.... Это InstanceMeta + id.
#[derive(Debug, Clone, Serialize)]
pub struct InstanceView {
    pub id: String,
    pub name: String,
    #[serde(rename = "mcVersion")]
    pub mc_version: String,
    pub loader: String,
    #[serde(rename = "loaderVersion")]
    pub loader_version: Option<String>,
    #[serde(rename = "memoryGb")]
    pub memory_gb: Option<u16>,
    #[serde(rename = "createdAt")]
    pub created_at: Option<String>,
    #[serde(rename = "lastPlayed")]
    pub last_played: Option<String>,
    #[serde(rename = "iconPath")]
    pub icon_path: Option<String>,
    #[serde(rename = "iconData")]
    pub icon_data: Option<String>,
    #[serde(rename = "coverData")]
    pub cover_data: Option<String>,
    #[serde(rename = "videoCoverPath")]
    pub video_cover_path: Option<String>,
    #[serde(rename = "javaArgs")]
    pub java_args: Option<String>,
}

fn view_from(id: String, m: InstanceMeta) -> InstanceView {
    let (icon_path, icon_data) = if let Some(ref ip) = m.icon_path {
        let full = instance_dir(&id).join(ip);
        if full.exists() {
            use base64::Engine;
            if let Ok(bytes) = std::fs::read(&full) {
                (Some(ip.clone()), Some(base64::engine::general_purpose::STANDARD.encode(&bytes)))
            } else {
                (Some(ip.clone()), None)
            }
        } else {
            (Some(ip.clone()), None)
        }
    } else {
        (None, None)
    };
    let cover_data = if let Some(ref cp) = m.cover_path {
        let full = instance_dir(&id).join(cp);
        if full.exists() {
            use base64::Engine;
            if let Ok(bytes) = std::fs::read(&full) {
                Some(base64::engine::general_purpose::STANDARD.encode(&bytes))
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };
    let video_cover_path = m.video_cover_path.and_then(|vcp| {
        let full = instance_dir(&id).join(&vcp);
        if full.exists() {
            Some(full.to_string_lossy().into_owned())
        } else {
            None
        }
    });
    InstanceView {
        icon_path,
        icon_data,
        cover_data,
        video_cover_path,
        id,
        name: m.name,
        mc_version: m.mc_version,
        loader: m.loader,
        loader_version: m.loader_version,
        memory_gb: m.memory_gb,
        created_at: m.created_at,
        last_played: m.last_played,
        java_args: m.java_args,
    }
}

// ----------------------- slug / id -----------------------

/// Транслит русских букв в латиницу (как в JS-версии).
fn translit_char(c: char) -> &'static str {
    match c {
        'а' => "a", 'б' => "b", 'в' => "v", 'г' => "g", 'д' => "d",
        'е' => "e", 'ё' => "yo", 'ж' => "zh", 'з' => "z", 'и' => "i",
        'й' => "y", 'к' => "k", 'л' => "l", 'м' => "m", 'н' => "n",
        'о' => "o", 'п' => "p", 'р' => "r", 'с' => "s", 'т' => "t",
        'у' => "u", 'ф' => "f", 'х' => "h", 'ц' => "ts", 'ч' => "ch",
        'ш' => "sh", 'щ' => "sch", 'ъ' => "", 'ы' => "y", 'ь' => "",
        'э' => "e", 'ю' => "yu", 'я' => "ya",
        _ => "",
    }
}

fn slugify(name: &str) -> String {
    let mut buf = String::new();
    for c in name.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
            buf.push(c);
        } else if c.is_ascii_whitespace() {
            buf.push('-');
        } else {
            let tr = translit_char(c);
            if tr.is_empty() {
            // Неподдерживаемый символ → разделитель. Не оставляем оригинальный
            // байт в id, чтобы избежать экзотики в путях Windows.
                buf.push('-');
            } else {
                buf.push_str(tr);
            }
        }
    }
    // Сжать подряд идущие '-' и обрезать с краёв.
    let collapsed: String = {
        let mut out = String::with_capacity(buf.len());
        let mut prev_dash = false;
        for c in buf.chars() {
            if c == '-' {
                if !prev_dash { out.push('-'); }
                prev_dash = true;
            } else {
                out.push(c);
                prev_dash = false;
            }
        }
        out.trim_matches('-').to_string()
    };

    let truncated: String = collapsed.chars().take(48).collect();
    let trimmed = truncated.trim_matches('-').to_string();
    if trimmed.is_empty() || trimmed == "-" {
        // Запасной id: «instance-<ts36>». Совпадает с JS-веткой.
        let ts = chrono::Utc::now().timestamp_millis();
        format!("instance-{}", radix36(ts.unsigned_abs()))
    } else {
        trimmed
    }
}

fn radix36(mut n: u64) -> String {
    if n == 0 { return "0".to_string(); }
    let chars = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut out = Vec::new();
    while n > 0 {
        out.push(chars[(n % 36) as usize]);
        n /= 36;
    }
    out.reverse();
    String::from_utf8(out).unwrap_or_else(|_| "0".to_string())
}

fn unique_id(existing: &std::collections::HashSet<String>, base: &str) -> String {
    if !existing.contains(base) {
        return base.to_string();
    }
    let mut i: u32 = 2;
    loop {
        let candidate = format!("{}-{}", base, i);
        if !existing.contains(&candidate) {
            return candidate;
        }
        i += 1;
        if i > 10_000 {
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            return format!("{}-{}", base, ts);
        }
    }
}

// ----------------------- paths / IO -----------------------

/// `id` инстанса приходит из фронта в КАЖДЫЙ Tauri-команд. Без валидации
/// `instance_dir(id).join("minecraft")` соберёт что-то вроде
/// `<instances>/../../Desktop/minecraft/` для `id == "../../Desktop"`,
/// а `delete_instance` снесёт это рекурсивно. Требуем, чтобы id был basename'ом:
/// не пустое, без NUL, и `Path::file_name()` == исходной строке (отсекает
/// `/`, `\`, `..`, `.`, абсолютные пути).
/// Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9).
/// Использование этих имён в качестве `id` приведёт к тому, что файловые
/// операции будут обращаться к системным устройствам вместо реальных папок.
const WINDOWS_DEVICE_NAMES: &[&str] = &[
    "con", "prn", "aux", "nul",
    "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
    "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// Проверяет, что `version` не содержит path-спецсимволов (защита от path
/// traversal через mc_version / loader_version в install/launch командах).
pub fn validate_version(version: &str) -> Result<(), String> {
    if version.is_empty() {
        return Err("Версия не может быть пустой".to_string());
    }
    if version.contains('\0') {
        return Err("Версия содержит NUL-символ".to_string());
    }
    // Разрешены только буквы, цифры, точки, дефисы, подчёркивания, плюсы.
    if !version.chars().all(|c| c.is_alphanumeric() || c == '.' || c == '-' || c == '_' || c == '+') {
        return Err(format!("Версия {:?} содержит недопустимые символы", version));
    }
    Ok(())
}

pub fn validate_id(id: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    let ok = !id.is_empty()
        && !id.contains('\0')
        && Path::new(id).file_name() == Some(OsStr::new(id));
    if !ok {
        return Err(format!("Подозрительный id инстанса: {:?}", id));
    }
    if cfg!(target_os = "windows") && WINDOWS_DEVICE_NAMES.contains(&id.to_lowercase().as_str()) {
        return Err(format!("Зарезервированное имя устройства: {:?}", id));
    }
    Ok(())
}

pub fn instance_dir(id: &str) -> PathBuf {
    get_roots().instances.join(id)
}

/// game_dir, который Lyceris будет использовать и для install, и для
/// launch (cwd процесса Minecraft). Это `<instances>/<id>/minecraft/`.
pub fn game_dir_of(id: &str) -> PathBuf {
    ensure_dir(instance_dir(id).join("minecraft"))
}

fn meta_path(id: &str) -> PathBuf {
    instance_dir(id).join("instance.json")
}

fn read_meta(id: &str) -> Option<InstanceMeta> {
    let path = meta_path(id);
    let raw = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_meta(id: &str, m: &InstanceMeta) -> Result<(), String> {
    let dir = instance_dir(id);
    ensure_dir(&dir);
    let body = serde_json::to_string_pretty(m)
        .map_err(|e| format!("Не удалось сериализовать инстанс: {}", e))?;
    let path = meta_path(id);
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, body)
        .map_err(|e| format!("Не удалось записать {}: {}", tmp.display(), e))?;
    std::fs::rename(&tmp, &path)
        .map_err(|e| format!("Не удалось переименовать {}: {}", tmp.display(), e))
}

// ----------------------- public API -----------------------

/// Список всех инстансов. Отсортирован по lastPlayed → createdAt → name,
/// чтобы UI получал готовый порядок «недавние сверху».
pub fn list_instances() -> Vec<InstanceView> {
    let dir = &get_roots().instances;
    let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new(); };
    let mut items: Vec<InstanceView> = entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|e| {
            let id = e.file_name().to_string_lossy().into_owned();
            read_meta(&id).map(|m| view_from(id, m))
        })
        .collect();

    items.sort_by(|a, b| {
        let parse = |s: &Option<String>| -> i64 {
            s.as_deref()
                .and_then(|x| chrono::DateTime::parse_from_rfc3339(x).ok())
                .map(|d| d.timestamp_millis())
                .unwrap_or(0)
        };
        let pb = parse(&b.last_played);
        let pa = parse(&a.last_played);
        if pb != pa { return pb.cmp(&pa); }
        let cb = parse(&b.created_at);
        let ca = parse(&a.created_at);
        if cb != ca { return cb.cmp(&ca); }
        a.name.to_lowercase().cmp(&b.name.to_lowercase())
    });
    items
}

pub fn get_instance(id: &str) -> Option<InstanceView> {
    if validate_id(id).is_err() { return None; }
    read_meta(id).map(|m| view_from(id.to_string(), m))
}

fn normalized_instance_name(name: &str) -> String {
    name.trim().to_lowercase()
}

fn validated_unique_name(name: &str, excluded_id: Option<&str>) -> Result<String, String> {
    let clean = name.trim();
    if clean.is_empty() {
        return Err("Имя обязательно".to_string());
    }
    let normalized = normalized_instance_name(clean);
    if list_instances().iter().any(|item| {
        Some(item.id.as_str()) != excluded_id
            && normalized_instance_name(&item.name) == normalized
    }) {
        return Err("Сборка с таким названием уже существует".to_string());
    }
    Ok(clean.to_string())
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreatePayload {
    pub name: String,
    #[serde(rename = "mcVersion")]
    pub mc_version: String,
    #[serde(default = "default_loader")]
    pub loader: String,
    #[serde(default, rename = "loaderVersion")]
    pub loader_version: Option<String>,
    #[serde(default, rename = "memoryGb")]
    pub memory_gb: Option<u16>,
}

pub fn create_instance(payload: CreatePayload) -> Result<InstanceView, String> {
    let clean_name = validated_unique_name(&payload.name, None)?;
    if payload.mc_version.trim().is_empty() {
        return Err("Версия Minecraft обязательна".to_string());
    }

    let existing: std::collections::HashSet<String> =
        list_instances().into_iter().map(|i| i.id).collect();
    let base = slugify(&clean_name);
    let id = unique_id(&existing, &base);

    ensure_dir(instance_dir(&id));
    ensure_dir(game_dir_of(&id));

    let meta = InstanceMeta {
        name: clean_name,
        mc_version: payload.mc_version,
        loader: payload.loader,
        loader_version: payload.loader_version,
        memory_gb: payload.memory_gb,
        created_at: Some(Utc::now().to_rfc3339()),
        last_played: None,
        icon_path: None,
        cover_path: None,
        video_cover_path: None,
        java_args: None,
    };
    write_meta(&id, &meta)?;
    crate::store::set_last_instance_id(Some(id.clone()));

    Ok(view_from(id, meta))
}

/// Патч-апдейт: совпадает с Electron `updateInstance(id, patch)`.
/// Любое поле опционально, остальные сохраняются.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct UpdatePayload {
    pub name: Option<String>,
    #[serde(rename = "mcVersion")]
    pub mc_version: Option<String>,
    pub loader: Option<String>,
    #[serde(rename = "loaderVersion")]
    pub loader_version: Option<Option<String>>,
    #[serde(rename = "memoryGb")]
    pub memory_gb: Option<Option<u16>>,
    #[serde(rename = "lastPlayed")]
    pub last_played: Option<Option<String>>,
    #[serde(rename = "javaArgs")]
    pub java_args: Option<Option<String>>,
}

pub fn update_instance(id: &str, patch: UpdatePayload) -> Result<InstanceView, String> {
    validate_id(id)?;
    let Some(mut meta) = read_meta(id) else {
        return Err(format!("Инстанс {} не найден", id));
    };
    if let Some(name) = patch.name {
        meta.name = validated_unique_name(&name, Some(id))?;
    }
    if let Some(v) = patch.mc_version { meta.mc_version = v; }
    if let Some(v) = patch.loader { meta.loader = v; }
    if let Some(v) = patch.loader_version { meta.loader_version = v; }
    if let Some(v) = patch.memory_gb { meta.memory_gb = v; }
    if let Some(v) = patch.last_played { meta.last_played = v; }
    if let Some(v) = patch.java_args { meta.java_args = v; }
    write_meta(id, &meta)?;
    Ok(view_from(id.to_string(), meta))
}

pub fn rename_instance(id: &str, name: String) -> Result<InstanceView, String> {
    update_instance(id, UpdatePayload { name: Some(name), ..Default::default() })
}

pub fn delete_instance(id: &str) -> Result<bool, String> {
    validate_id(id)?;
    let dir = instance_dir(id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir)
            .map_err(|e| format!("Не удалось удалить {}: {}", dir.display(), e))?;
    }
    if crate::store::get_last_instance_id().as_deref() == Some(id) {
        crate::store::set_last_instance_id(None);
    }
    Ok(true)
}

pub fn duplicate_instance(id: &str) -> Result<InstanceView, String> {
    validate_id(id)?;
    let Some(src) = read_meta(id) else {
        return Err(format!("Инстанс {} не найден", id));
    };

    let existing_names: std::collections::HashSet<String> = list_instances()
        .into_iter()
        .map(|item| normalized_instance_name(&item.name))
        .collect();
    let base_name = format!("{} (копия)", src.name);
    let mut copy_name = base_name.clone();
    let mut suffix = 2;
    while existing_names.contains(&normalized_instance_name(&copy_name)) {
        copy_name = format!("{} {})", base_name.trim_end_matches(')'), suffix);
        suffix += 1;
    }

    let created = create_instance(CreatePayload {
        name: copy_name,
        mc_version: src.mc_version.clone(),
        loader: src.loader.clone(),
        loader_version: src.loader_version.clone(),
        memory_gb: src.memory_gb,
    })?;

    // Копируем minecraft/ → копия получит mods/saves/config и versions/libraries/assets
    // без повторной закачки. Дороговато по диску, но честно.
    let src_mc = instance_dir(id).join("minecraft");
    let dst_mc = instance_dir(&created.id).join("minecraft");
    if src_mc.exists() {
        if let Err(e) = copy_dir_recursive(&src_mc, &dst_mc) {
            // Чистим сломанный инстанс
            let _ = std::fs::remove_dir_all(instance_dir(&created.id));
            return Err(format!("Не удалось скопировать данные: {}", e));
        }
    }

    // Копируем иконку, если есть.
    if let Some(ref ip) = src.icon_path {
        let src_icon = instance_dir(id).join(ip);
        if src_icon.exists() {
            let dst_icon = instance_dir(&created.id).join(ip);
            let _ = std::fs::copy(&src_icon, &dst_icon);
            if let Some(mut copy_meta) = read_meta(&created.id) {
                copy_meta.icon_path = Some(ip.clone());
                let _ = write_meta(&created.id, &copy_meta);
            }
        }
    }
    // Копируем обложку, если есть.
    if let Some(ref cp) = src.cover_path {
        let src_cover = instance_dir(id).join(cp);
        if src_cover.exists() {
            let dst_cover = instance_dir(&created.id).join(cp);
            let _ = std::fs::copy(&src_cover, &dst_cover);
            if let Some(mut copy_meta) = read_meta(&created.id) {
                copy_meta.cover_path = Some(cp.clone());
                let _ = write_meta(&created.id, &copy_meta);
            }
        }
    }
    Ok(created)
}

#[derive(Debug, Clone, Serialize)]
pub struct PackResult {
    pub path: String,
    #[serde(rename = "fileName")]
    pub file_name: String,
}

#[derive(Debug, Serialize)]
#[allow(non_snake_case)]
struct MrpackIndex<'a> {
    formatVersion: u8,
    game: &'a str,
    versionId: &'a str,
    name: &'a str,
    summary: &'a str,
    files: Vec<serde_json::Value>,
    dependencies: std::collections::BTreeMap<String, String>,
}

pub fn export_instance_pack(
    id: &str,
    out_path: Option<String>,
    app: Option<&tauri::AppHandle>,
) -> Result<PackResult, String> {
    validate_id(id)?;
    let Some(meta) = read_meta(id) else {
        return Err(format!("Инстанс {} не найден", id));
    };

    if let Some(a) = app {
        let _ = a.emit("export:progress", serde_json::json!({
            "phase": "preparing",
            "percent": 0,
            "label": "Подготовка архива…",
        }));
    }

    let file_name = format!("{}.mrpack", sanitize_file_name(&meta.name));
    let out_path = if let Some(p) = out_path {
        std::path::PathBuf::from(p)
    } else {
        let roots = get_roots();
        let exports = ensure_dir(roots.root.join("exports"));
        exports.join(&file_name)
    };
    let file = std::fs::File::create(&out_path)
        .map_err(|e| format!("Не удалось создать архив: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored);

    if let Some(a) = app {
        let _ = a.emit("export:progress", serde_json::json!({
            "phase": "metadata",
            "percent": 5,
            "label": "Запись метаданных…",
        }));
    }

    let mut deps = std::collections::BTreeMap::new();
    deps.insert("minecraft".to_string(), meta.mc_version.clone());
    match meta.loader.as_str() {
        "fabric" => { if let Some(v) = &meta.loader_version { deps.insert("fabric-loader".to_string(), v.clone()); } }
        "quilt" => { if let Some(v) = &meta.loader_version { deps.insert("quilt-loader".to_string(), v.clone()); } }
        "forge" => { if let Some(v) = &meta.loader_version { deps.insert("forge".to_string(), v.clone()); } }
        "neoforge" => { if let Some(v) = &meta.loader_version { deps.insert("neoforge".to_string(), v.clone()); } }
        _ => {}
    }
    let index = MrpackIndex {
        formatVersion: 1,
        game: "minecraft",
        versionId: "1.0.0",
        name: &meta.name,
        summary: "Exported locally by Poshat Launcher",
        files: Vec::new(),
        dependencies: deps,
    };
    zip.start_file("modrinth.index.json", opts).map_err(|e| e.to_string())?;
    serde_json::to_writer_pretty(&mut zip, &index).map_err(|e| e.to_string())?;

    zip.start_file("poshat.instance.json", opts).map_err(|e| e.to_string())?;
    serde_json::to_writer_pretty(&mut zip, &meta).map_err(|e| e.to_string())?;

    let mc_dir = game_dir_of(id);
    let mut progress = ZipProgress { app, processed: 0, total: 0, skipped_large: 0 };
    if mc_dir.exists() {
        progress.total = count_dir_files(&mc_dir);
        add_dir_to_zip(&mut zip, &mc_dir, &mc_dir, "overrides", opts, &mut progress)?;
    }
    zip.finish().map_err(|e| format!("Не удалось закрыть архив: {}", e))?;

    if let Some(a) = app {
        let skipped = progress.skipped_large;
        let mut payload = serde_json::json!({
            "phase": "done",
            "percent": 100,
            "label": "Готово!",
        });
        if skipped > 0 {
            payload["warning"] = serde_json::json!(format!("Пропущено файлов >100 МБ: {}", skipped));
        }
        let _ = a.emit("export:progress", payload);
    }
    Ok(PackResult { path: out_path.to_string_lossy().into_owned(), file_name })
}

pub fn import_instance_pack(path: String, app: Option<&tauri::AppHandle>) -> Result<InstanceView, String> {
    if let Some(a) = app {
        let _ = a.emit("import:progress", serde_json::json!({
            "phase": "reading",
            "percent": 5,
            "label": "Чтение архива…",
        }));
    }

    let file = std::fs::File::open(&path)
        .map_err(|e| format!("Не удалось открыть архив: {}", e))?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|e| format!("Это не mrpack/zip архив: {}", e))?;

    let mut meta: Option<InstanceMeta> = None;
    if let Ok(mut f) = zip.by_name("poshat.instance.json") {
        meta = serde_json::from_reader(&mut f).ok();
    }
    if meta.is_none() {
        let mut f = zip.by_name("modrinth.index.json")
            .map_err(|_| "В архиве нет modrinth.index.json".to_string())?;
        let v: serde_json::Value = serde_json::from_reader(&mut f)
            .map_err(|e| format!("Не удалось прочитать modrinth.index.json: {}", e))?;
        let deps = v.get("dependencies").and_then(|d| d.as_object()).cloned().unwrap_or_default();
        let loader = if deps.contains_key("fabric-loader") { "fabric" }
            else if deps.contains_key("quilt-loader") { "quilt" }
            else if deps.contains_key("forge") { "forge" }
            else if deps.contains_key("neoforge") { "neoforge" }
            else { "vanilla" };
        let loader_version = match loader {
            "fabric" => deps.get("fabric-loader"),
            "quilt" => deps.get("quilt-loader"),
            "forge" => deps.get("forge"),
            "neoforge" => deps.get("neoforge"),
            _ => None,
        }.and_then(|x| x.as_str()).map(|s| s.to_string());
        meta = Some(InstanceMeta {
            name: v.get("name").and_then(|x| x.as_str()).unwrap_or("Imported pack").to_string(),
            mc_version: deps.get("minecraft").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            loader: loader.to_string(),
            loader_version,
            memory_gb: None,
            created_at: Some(Utc::now().to_rfc3339()),
            last_played: None,
            icon_path: None,
            cover_path: None,
            video_cover_path: None,
            java_args: None,
        });
    }
    let meta = meta.ok_or_else(|| "Не удалось определить параметры сборки".to_string())?;
    let created = create_instance(CreatePayload {
        name: meta.name,
        mc_version: meta.mc_version,
        loader: meta.loader,
        loader_version: meta.loader_version,
        memory_gb: meta.memory_gb,
    })?;

    let dst_mc = game_dir_of(&created.id);
    let total_files = zip.len() as u64;
    if let Some(a) = app {
        let _ = a.emit("import:progress", serde_json::json!({
            "phase": "extracting",
            "percent": 20,
            "label": format!("Распаковка файлов… 0/{}", total_files),
        }));
    }
    let mut extracted = 0u64;
    for i in 0..zip.len() {
        let mut f = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = f.name().replace('\\', "/");
        let Some(rel) = name.strip_prefix("overrides/") else { continue; };
        if rel.is_empty() || rel.contains("..") { continue; }
        let out = dst_mc.join(rel);
        if f.is_dir() {
            let _ = std::fs::create_dir_all(&out);
        } else {
            if let Some(parent) = out.parent() { let _ = std::fs::create_dir_all(parent); }
            let mut dst = std::fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut dst).map_err(|e| e.to_string())?;
        }
        extracted += 1;
        if extracted.is_multiple_of(3) || extracted == total_files {
            let pct = (20.0 + (extracted as f64 / total_files.max(1) as f64) * 75.0).min(95.0) as u32;
            if let Some(a) = app {
                let _ = a.emit("import:progress", serde_json::json!({
                    "phase": "extracting",
                    "percent": pct,
                    "label": format!("Распаковка файлов… {}/{}", extracted, total_files),
                }));
            }
        }
    }

    if let Some(a) = app {
        let _ = a.emit("import:progress", serde_json::json!({
            "phase": "done",
            "percent": 100,
            "label": "Готово!",
        }));
    }
    Ok(get_instance(&created.id).unwrap_or(created))
}

/// Папки, которые НЕ попадают в .mrpack (можно перекачать / пересобрать).
const SKIP_DIRS: &[&str] = &[
    "versions", "libraries", "assets", "logs",
    "fabric-api", "net", "org",
];

fn should_skip_dir(name: &str) -> bool {
    SKIP_DIRS.contains(&name)
}

fn count_dir_files(dir: &Path) -> u64 {
    let mut count = 0u64;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
            if is_dir {
                let name = entry.file_name().to_string_lossy().to_string();
                if !should_skip_dir(&name) {
                    count += count_dir_files(&entry.path());
                }
            } else {
                count += 1;
            }
        }
    }
    count
}

struct ZipProgress<'a> {
    app: Option<&'a tauri::AppHandle>,
    processed: u64,
    total: u64,
    skipped_large: u64,
}

fn add_dir_to_zip(
    zip: &mut zip::ZipWriter<std::fs::File>,
    root: &Path,
    dir: &Path,
    prefix: &str,
    opts: zip::write::SimpleFileOptions,
    progress: &mut ZipProgress<'_>,
) -> Result<(), String> {
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if entry.file_type().map_err(|e| e.to_string())?.is_dir()
            && should_skip_dir(&file_name)
        {
            continue;
        }

        let rel = path.strip_prefix(root).map_err(|e| e.to_string())?;
        let rel_name = rel.to_string_lossy().replace('\\', "/");
        let zip_name = format!("{}/{}", prefix, rel_name);
        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            add_dir_to_zip(zip, root, &path, prefix, opts, progress)?;
        } else {
            let meta = entry.metadata().map_err(|e| e.to_string())?;
            if meta.len() > 100 * 1024 * 1024 {
                progress.skipped_large += 1;
                tracing::warn!("пропущен файл >100 МБ: {}", rel_name);
                continue;
            }
            zip.start_file(zip_name, opts).map_err(|e| e.to_string())?;
            let mut src = std::fs::File::open(&path).map_err(|e| e.to_string())?;
            std::io::copy(&mut src, zip).map_err(|e| e.to_string())?;
            progress.processed += 1;
            if progress.total > 0 && progress.processed.is_multiple_of(5) {
                let pct = ((progress.processed as f64 / progress.total as f64) * 90.0 + 10.0).min(99.0) as u32;
                if let Some(a) = progress.app {
                    let _ = a.emit("export:progress", serde_json::json!({
                        "phase": "archiving",
                        "percent": pct,
                        "label": format!("Упаковка файлов… {}/{}", progress.processed, progress.total),
                    }));
                }
            }
        }
    }
    Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        // Пропускаем симлинки — они могут указывать за пределы песочницы.
        if entry.file_type()?.is_symlink() {
            continue;
        }
        let p = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&p, &to)?;
        } else {
            std::fs::copy(&p, &to)?;
        }
    }
    Ok(())
}

/// Помечаем «последний играли сейчас» — вызывается из launch.rs после
/// успешного спавна.
pub fn record_play(id: &str) -> Result<(), String> {
    validate_id(id)?;
    let _ = update_instance(
        id,
        UpdatePayload {
            last_played: Some(Some(Utc::now().to_rfc3339())),
            ..Default::default()
        },
    )?;
    Ok(())
}

// ----------------------- иконка инстанса -----------------------

/// Сохранить иконку инстанса (PNG/JPEG/base64-данные) в `<instance>/icon.png`.
/// Принимает base64-строку (без префикса data:image/...) и записывает как файл.
pub fn set_instance_icon(id: &str, base64_data: &str) -> Result<String, String> {
    validate_id(id)?;
    let Some(mut meta) = read_meta(id) else {
        return Err(format!("Инстанс {} не найден", id));
    };

    use base64::Engine;

    // Пустой base64 — удаляем иконку.
    let trimmed = base64_data.trim();
    if trimmed.is_empty() {
        let icon_path = instance_dir(id).join("icon.png");
        let _ = std::fs::remove_file(&icon_path);
        meta.icon_path = None;
        write_meta(id, &meta)?;
        return Ok(String::new());
    }

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(trimmed)
        .map_err(|e| format!("Невалидный base64: {}", e))?;

    // Ограничение 5 МБ — иконка не должна быть огромной.
    if bytes.len() > 5 * 1024 * 1024 {
        return Err("Иконка слишком большая (макс 5 МБ)".to_string());
    }

    let icon_path = instance_dir(id).join("icon.png");
    std::fs::write(&icon_path, &bytes)
        .map_err(|e| format!("Не удалось записать иконку: {}", e))?;

    meta.icon_path = Some("icon.png".to_string());
    write_meta(id, &meta)?;

    Ok(icon_path.to_string_lossy().into_owned())
}

/// Вернуть полный путь к иконке инстанса (если есть).
pub fn get_instance_icon_path(id: &str) -> Option<String> {
    let meta = read_meta(id)?;
    let file = meta.icon_path?;
    let full = instance_dir(id).join(&file);
    if full.exists() {
        Some(full.to_string_lossy().into_owned())
    } else {
        None
    }
}

// ----------------------- обложка инстанса -----------------------

/// Сохранить обложку инстанса (PNG/base64-данные) в `<instance>/cover.png`.
pub fn set_instance_cover(id: &str, base64_data: &str) -> Result<String, String> {
    validate_id(id)?;
    let Some(mut meta) = read_meta(id) else {
        return Err(format!("Инстанс {} не найден", id));
    };

    use base64::Engine;

    let trimmed = base64_data.trim();
    if trimmed.is_empty() {
        let cover_path = instance_dir(id).join("cover.png");
        let _ = std::fs::remove_file(&cover_path);
        meta.cover_path = None;
        meta.video_cover_path = None;
        let _ = remove_video_cover_files(id);
        write_meta(id, &meta)?;
        return Ok(String::new());
    }

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(trimmed)
        .map_err(|e| format!("Невалидный base64: {}", e))?;

    if bytes.len() > 5 * 1024 * 1024 {
        return Err("Обложка слишком большая (макс 5 МБ)".to_string());
    }

    let cover_path = instance_dir(id).join("cover.png");
    std::fs::write(&cover_path, &bytes)
        .map_err(|e| format!("Не удалось записать обложку: {}", e))?;

    meta.cover_path = Some("cover.png".to_string());
    meta.video_cover_path = None;
    let _ = remove_video_cover_files(id);
    write_meta(id, &meta)?;

    Ok(cover_path.to_string_lossy().into_owned())
}

/// Вернуть полный путь к обложке инстанса (если есть).
pub fn get_instance_cover(id: &str) -> Option<String> {
    let meta = read_meta(id)?;
    let file = meta.cover_path?;
    let full = instance_dir(id).join(&file);
    if full.exists() {
        Some(full.to_string_lossy().into_owned())
    } else {
        None
    }
}

// ----------------------- видео-обложка инстанса -----------------------

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "mkv", "avi", "mov", "ogg", "ogv"];

fn video_ext_for(name: &str) -> Option<&'static str> {
    let lower = name.to_lowercase();
    for ext in VIDEO_EXTENSIONS {
        if lower.ends_with(&format!(".{}", ext)) {
            return Some(ext);
        }
    }
    None
}

pub fn is_video_file(name: &str) -> bool {
    video_ext_for(name).is_some()
}

/// Сохранить видео-обложку инстанса. `file_name` — оригинальное имя файла,
/// `base64_data` — содержимое в base64. Сохраняет в `<instance>/cover_video.<ext>.
pub fn set_instance_video_cover(id: &str, file_name: &str, base64_data: &str) -> Result<String, String> {
    validate_id(id)?;
    let Some(mut meta) = read_meta(id) else {
        return Err(format!("Инстанс {} не найден", id));
    };

    use base64::Engine;

    let trimmed = base64_data.trim();
    if trimmed.is_empty() {
        let _ = remove_video_cover_files(id);
        meta.video_cover_path = None;
        write_meta(id, &meta)?;
        return Ok(String::new());
    }

    let ext = video_ext_for(file_name)
        .unwrap_or("mp4")
        .to_string();

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(trimmed)
        .map_err(|e| format!("Невалидный base64: {}", e))?;

    if bytes.len() > 50 * 1024 * 1024 {
        return Err("Видео слишком большое (макс 50 МБ)".to_string());
    }

    let _ = remove_video_cover_files(id);

    let file_name = format!("cover_video.{}", ext);
    let cover_path = instance_dir(id).join(&file_name);
    std::fs::write(&cover_path, &bytes)
        .map_err(|e| format!("Не удалось записать видео-обложку: {}", e))?;

    meta.video_cover_path = Some(file_name);
    meta.cover_path = None;
    let _ = std::fs::remove_file(instance_dir(id).join("cover.png"));
    write_meta(id, &meta)?;

    Ok(cover_path.to_string_lossy().into_owned())
}

fn remove_video_cover_files(id: &str) -> std::io::Result<()> {
    let dir = instance_dir(id);
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("cover_video.") {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    Ok(())
}

/// Вернуть base64-данные видео-обложки инстанса (если есть).
pub fn get_instance_video_cover_data(id: &str) -> Option<String> {
    validate_id(id).ok()?;
    let meta = read_meta(id)?;
    let file = meta.video_cover_path?;
    let full = instance_dir(id).join(&file);
    if full.exists() {
        use base64::Engine;
        let bytes = std::fs::read(&full).ok()?;
        Some(base64::engine::general_purpose::STANDARD.encode(&bytes))
    } else {
        None
    }
}

// ----------------------- открыть папку / ярлык -----------------------

/// Открыть папку инстанса в проводнике Windows. На macOS/Linux откроется
/// через системный обработчик. Берём `<instances>/<id>/minecraft/` —
/// именно там лежит mods, saves, config.
pub fn open_folder(id: &str) -> Result<(), String> {
    validate_id(id)?;
    if read_meta(id).is_none() {
        return Err(format!("Инстанс {} не найден", id));
    }
    let path = game_dir_of(id);
    let path_str = path.to_string_lossy().into_owned();
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path_str)
        // explorer ВСЕГДА возвращает не-ноль выходной код даже при успехе —
        // не проверяем статус, просто спавним и забываем.
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

// ----------------------- shortcut (.lnk) -----------------------

#[derive(Debug, Clone, Serialize)]
pub struct ShortcutResult {
    pub path: String,
    pub name: String,
}

/// Оборачивает PNG-байты в ICO-контейнер (одна иконка).
/// ICO с встроенным PNG поддерживается с Windows Vista.
fn png_to_ico(png: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::Write;
    const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
    if png.len() < 24 || &png[..8] != PNG_SIGNATURE || &png[12..16] != b"IHDR" {
        return Err("Выбранное изображение не удалось преобразовать в PNG".to_string());
    }

    let width = u32::from_be_bytes(png[16..20].try_into().unwrap());
    let height = u32::from_be_bytes(png[20..24].try_into().unwrap());
    if !(1..=256).contains(&width) || !(1..=256).contains(&height) {
        return Err("Размер иконки должен быть от 1 до 256 пикселей".to_string());
    }

    let size = u32::try_from(png.len())
        .map_err(|_| "Файл иконки слишком большой".to_string())?;
    // ICO header: 6 bytes
    let header_len = 6u32;
    // Directory entry: 16 bytes
    let entry_len = 16u32;
    let data_offset = header_len + entry_len;
    let total = data_offset + size;

    let mut buf = Vec::with_capacity(total as usize);
    // Header
    buf.write_all(&0u16.to_le_bytes()).map_err(|e| e.to_string())?; // reserved
    buf.write_all(&1u16.to_le_bytes()).map_err(|e| e.to_string())?; // type = icon
    buf.write_all(&1u16.to_le_bytes()).map_err(|e| e.to_string())?; // count = 1
    // Directory entry
    buf.write_all(&[if width == 256 { 0 } else { width as u8 }]).map_err(|e| e.to_string())?;
    buf.write_all(&[if height == 256 { 0 } else { height as u8 }]).map_err(|e| e.to_string())?;
    buf.write_all(&[0u8]).map_err(|e| e.to_string())?; // color count
    buf.write_all(&[0u8]).map_err(|e| e.to_string())?; // reserved
    buf.write_all(&1u16.to_le_bytes()).map_err(|e| e.to_string())?; // color planes
    buf.write_all(&32u16.to_le_bytes()).map_err(|e| e.to_string())?; // bits per pixel
    buf.write_all(&size.to_le_bytes()).map_err(|e| e.to_string())?; // image data size
    buf.write_all(&data_offset.to_le_bytes()).map_err(|e| e.to_string())?; // offset
    // Image data (raw PNG)
    buf.write_all(png).map_err(|e| e.to_string())?;
    Ok(buf)
}

fn sanitize_file_name(name: &str) -> String {
    // Запрещённые на Windows: <>:"/\|?* и control chars
    let cleaned: String = name
        .chars()
        .filter(|c| !"<>:\"/\\|?*".contains(*c) && !c.is_control())
        .collect();
    let trimmed = cleaned.trim().to_string();
    let truncated: String = trimmed.chars().take(100).collect();
    if truncated.is_empty() {
        return "shortcut".to_string();
    }
    // Windows зарезервированные имена устройств (CON, NUL, COM1…)
    if WINDOWS_DEVICE_NAMES.contains(&truncated.to_lowercase().as_str()) {
        return format!("{}_", truncated);
    }
    truncated
}

#[cfg(target_os = "linux")]
fn desktop_exec_quote(value: &str) -> String {
    format!(
        "\"{}\"",
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('`', "\\`")
            .replace('$', "\\$")
    )
}

/// Создать ярлык на Рабочем столе, запускающий `launcher.exe --instance=<id>`.
/// Внутри Tauri-runtime `std::env::current_exe()` — это путь до нашего
/// собственного .exe, что нам и нужно. PowerShell тут — самый дешёвый
/// способ создать .lnk без дополнительной зависимости.
///
/// `shortcut_icon_base64` — опциональная иконка ярлыка (raw PNG base64).
/// Если передана, сохраняется как уникальный `shortcut_icon_<hash>.ico` в папке инстанса
/// и используется для .lnk. НЕ затрагивает основную иконку инстанса (`icon.png`).
pub fn create_desktop_shortcut(
    id: &str,
    shortcut_name: Option<String>,
    shortcut_icon_base64: Option<String>,
) -> Result<ShortcutResult, String> {
    validate_id(id)?;
    let Some(meta) = read_meta(id) else {
        return Err(format!("Инстанс {} не найден", id));
    };

    // Если передана иконка для ярлыка — конвертируем PNG→ICO и сохраняем отдельным файлом.
    let _shortcut_icon_path = match shortcut_icon_base64.as_deref().map(str::trim) {
        Some(trimmed) if !trimmed.is_empty() => {
            use base64::Engine;
            let png_bytes = base64::engine::general_purpose::STANDARD
                .decode(trimmed)
                .map_err(|e| format!("Не удалось прочитать иконку: {}", e))?;
            let ico_bytes = png_to_ico(&png_bytes)?;
            let icon_hash = ico_bytes.iter().fold(0xcbf29ce484222325u64, |hash, byte| {
                (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
            });
            let ico_path = instance_dir(id).join(format!("shortcut_icon_{icon_hash:016x}.ico"));
            std::fs::write(&ico_path, &ico_bytes)
                .map_err(|e| format!("Не удалось сохранить иконку ярлыка: {}", e))?;
            Some(ico_path)
        }
        _ => None,
    };

    #[cfg(target_os = "windows")]
    {
        let name = shortcut_name.unwrap_or_default();
        let display_name = if name.trim().is_empty() { meta.name.clone() } else { name };
        let file_name = sanitize_file_name(&display_name);

        // %USERPROFILE%\Desktop. Стандартное место.
        let desktop = directories::UserDirs::new()
            .and_then(|u| u.desktop_dir().map(|d| d.to_path_buf()))
            .ok_or_else(|| "Не найдена папка Рабочего стола".to_string())?;
        let target = desktop.join(format!("{}.lnk", file_name));

        let exe = std::env::current_exe()
            .map_err(|e| format!("Не удалось определить путь к лаунчеру: {}", e))?;
        let exe_str = exe.to_string_lossy().to_string();
        let cwd = exe.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();

        // PowerShell: все строки экранируем через single-quote (внутри ' ' одинарная
        // кавычка пишется как ''). Иначе имена с кавычками ломают команду.
        let ps_escape = |s: &str| s.replace('\'', "''");
        // Иконка ярлыка: сначала новый ICO, потом иконка инстанса, иначе .exe.
        let icon_arg = if let Some(ref shortcut_icon) = _shortcut_icon_path {
            format!("{},0", shortcut_icon.to_string_lossy())
        } else if let Some(ref ip) = meta.icon_path {
            let full_icon = instance_dir(id).join(ip);
            if full_icon.exists() {
                full_icon.to_string_lossy().to_string()
            } else {
                format!("{},0", exe_str)
            }
        } else {
            format!("{},0", exe_str)
        };

        let script = format!(
            "$ws = New-Object -ComObject WScript.Shell; \
             $s = $ws.CreateShortcut('{lnk}'); \
             $s.TargetPath = '{exe}'; \
             $s.Arguments = '--instance={id}'; \
             $s.WorkingDirectory = '{cwd}'; \
             $s.IconLocation = '{icon}'; \
             $s.Description = '{desc}'; \
             $s.Save()",
            lnk = ps_escape(&target.to_string_lossy()),
            exe = ps_escape(&exe_str),
            id = ps_escape(id),
            cwd = ps_escape(&cwd),
            icon = ps_escape(&icon_arg),
            desc = ps_escape(&format!("Запуск инстанса «{}» в Poshat Launcher", meta.name)),
        );

        #[cfg(target_os = "windows")]
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        let mut cmd = std::process::Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let output = cmd
            .output()
            .map_err(|e| format!("Не удалось запустить PowerShell: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("PowerShell отказался создавать ярлык: {}", stderr.trim()));
        }

        Ok(ShortcutResult {
            path: target.to_string_lossy().into_owned(),
            name: file_name,
        })
    }
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;

        let name = shortcut_name.unwrap_or_default();
        let display_name = if name.trim().is_empty() { meta.name.clone() } else { name };
        let file_name = sanitize_file_name(&display_name);
        let desktop = directories::UserDirs::new()
            .and_then(|u| u.desktop_dir().map(|d| d.to_path_buf()))
            .ok_or_else(|| "Не найдена папка рабочего стола".to_string())?;
        let target = desktop.join(format!("{}.desktop", file_name));
        let exe = std::env::current_exe()
            .map_err(|e| format!("Не удалось определить путь к лаунчеру: {}", e))?;
        let cwd = exe.parent().unwrap_or_else(|| std::path::Path::new("/"));
        let argument = format!("--instance={}", id);
        let body = format!(
            "[Desktop Entry]\nVersion=1.0\nType=Application\nName={}\nComment=Запуск инстанса {} в Poshat Launcher\nExec={} {}\nPath={}\nTerminal=false\nCategories=Game;\n",
            file_name,
            meta.name,
            desktop_exec_quote(&exe.to_string_lossy()),
            desktop_exec_quote(&argument),
            cwd.to_string_lossy(),
        );
        std::fs::write(&target, body)
            .map_err(|e| format!("Не удалось создать ярлык {}: {}", target.display(), e))?;
        let mut permissions = std::fs::metadata(&target)
            .map_err(|e| format!("Не удалось прочитать права ярлыка: {}", e))?
            .permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&target, permissions)
            .map_err(|e| format!("Не удалось сделать ярлык исполняемым: {}", e))?;

        Ok(ShortcutResult {
            path: target.to_string_lossy().into_owned(),
            name: file_name,
        })
    }
    #[cfg(target_os = "macos")]
    {
        let _ = (shortcut_name, meta);
        Err("Создание ярлыков для macOS пока не поддерживается".to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        let _ = (shortcut_name, meta);
        Err("Создание ярлыков не поддерживается на этой платформе".to_string())
    }
}

// ----------------------- размер инстанса на диске -----------------------

/// Рекурсивно посчитать размер директории (в байтах). Публичный — для UI.
pub fn instance_disk_size(id: &str) -> Result<u64, String> {
    validate_id(id)?;
    let dir = instance_dir(id);
    if !dir.exists() {
        return Err(format!("Инстанс {} не найден", id));
    }
    Ok(dir_size_recursive(&dir))
}

fn dir_size_recursive(path: &std::path::Path) -> u64 {
    let mut total: u64 = 0;
    let Ok(entries) = std::fs::read_dir(path) else { return 0; };
    for e in entries.flatten() {
        let Ok(ft) = e.file_type() else { continue; };
        // Пропускаем симлинки — избегаем бесконечной рекурсии.
        if ft.is_symlink() {
            continue;
        }
        if ft.is_file() {
            if let Ok(m) = e.metadata() { total += m.len(); }
        } else if ft.is_dir() {
            total += dir_size_recursive(&e.path());
        }
    }
    total
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- png_to_ico ---

    fn png_header(width: u32, height: u32) -> Vec<u8> {
        let mut png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        png.extend_from_slice(&width.to_be_bytes());
        png.extend_from_slice(&height.to_be_bytes());
        png
    }

    #[test]
    fn png_to_ico_uses_png_dimensions() {
        let png = png_header(128, 64);
        let ico = png_to_ico(&png).unwrap();

        assert_eq!(&ico[..6], &[0, 0, 1, 0, 1, 0]);
        assert_eq!(&ico[6..8], &[128, 64]);
        assert_eq!(&ico[22..], png);
    }

    #[test]
    fn png_to_ico_encodes_256_as_zero() {
        let ico = png_to_ico(&png_header(256, 256)).unwrap();
        assert_eq!(&ico[6..8], &[0, 0]);
    }

    #[test]
    fn png_to_ico_rejects_wrong_format_and_oversized_images() {
        assert!(png_to_ico(b"not a png").is_err());
        assert!(png_to_ico(&png_header(257, 256)).is_err());
    }

    // --- validate_id ---

    #[test]
    fn validate_id_rejects_empty() {
        assert!(validate_id("").is_err());
    }

    #[test]
    fn validate_id_rejects_null() {
        assert!(validate_id("foo\0bar").is_err());
    }

    #[test]
    fn validate_id_rejects_path_traversal() {
        assert!(validate_id("../../etc/passwd").is_err());
        assert!(validate_id("..\\Windows\\System32").is_err());
        assert!(validate_id("/etc/passwd").is_err());
    }

    #[test]
    fn validate_id_rejects_dots() {
        assert!(validate_id(".").is_err());
        assert!(validate_id("..").is_err());
    }

    #[test]
    fn validate_id_accepts_simple_slug() {
        assert!(validate_id("my-instance").is_ok());
        assert!(validate_id("test123").is_ok());
        assert!(validate_id("instance_1").is_ok());
    }

    #[test]
    fn validate_id_rejects_windows_device_names() {
        assert!(validate_id("con").is_err());
        assert!(validate_id("CON").is_err());
        assert!(validate_id("nul").is_err());
        assert!(validate_id("com1").is_err());
        assert!(validate_id("lpt1").is_err());
    }

    // --- validate_version ---

    #[test]
    fn validate_version_rejects_empty() {
        assert!(validate_version("").is_err());
    }

    #[test]
    fn validate_version_rejects_null() {
        assert!(validate_version("1.20\0bad").is_err());
    }

    #[test]
    fn validate_version_rejects_special_chars() {
        assert!(validate_version("1.20/../../../etc").is_err());
        assert!(validate_version("1.20; rm -rf /").is_err());
        assert!(validate_version("1.20<script>").is_err());
    }

    #[test]
    fn validate_version_accepts_valid() {
        assert!(validate_version("1.20.1").is_ok());
        assert!(validate_version("1.21-rc1").is_ok());
        assert!(validate_version("1.20.1_fabric-0.15.0").is_ok());
        assert!(validate_version("24w14a").is_ok());
        assert!(validate_version("1.20.1+forge").is_ok());
    }

    // --- slugify ---

    #[test]
    fn slugify_ascii_lowercase() {
        assert_eq!(slugify("My Instance"), "my-instance");
    }

    #[test]
    fn slugify_collapses_dashes() {
        assert_eq!(slugify("a   b"), "a-b");
        assert_eq!(slugify("--a--"), "a");
    }

    #[test]
    fn slugify_truncates_long_names() {
        let long = "a".repeat(100);
        let s = slugify(&long);
        assert!(s.len() <= 48);
    }

    #[test]
    fn slugify_transliterates_russian() {
        assert_eq!(slugify("Привет"), "privet");
        assert_eq!(slugify("Тест 123"), "test-123");
    }

    #[test]
    fn slugify_fallback_for_symbols_only() {
        let s = slugify("!!!");
        assert!(s.starts_with("instance-"));
        assert!(s.len() > 9);
    }

    // --- radix36 ---

    #[test]
    fn radix36_zero() {
        assert_eq!(radix36(0), "0");
    }

    #[test]
    fn radix36_basic() {
        assert_eq!(radix36(10), "a");
        assert_eq!(radix36(35), "z");
        assert_eq!(radix36(36), "10");
    }

    // --- unique_id ---

    #[test]
    fn unique_id_returns_base_if_free() {
        let set = std::collections::HashSet::new();
        assert_eq!(unique_id(&set, "test"), "test");
    }

    #[test]
    fn unique_id_appends_suffix() {
        let set: std::collections::HashSet<String> =
            ["test", "test-2"].into_iter().map(String::from).collect();
        assert_eq!(unique_id(&set, "test"), "test-3");
    }

    // --- is_video_file ---

    #[test]
    fn is_video_file_positive() {
        assert!(is_video_file("clip.mp4"));
        assert!(is_video_file("intro.webm"));
        assert!(is_video_file("VIDEO.MKV"));
    }

    #[test]
    fn is_video_file_negative() {
        assert!(!is_video_file("screenshot.png"));
        assert!(!is_video_file("mod.jar"));
        assert!(!is_video_file("readme.txt"));
    }

    // --- sanitize_file_name ---

    #[test]
    fn sanitize_file_name_strips_forbidden() {
        let s = sanitize_file_name("my<>:\"file|name?.txt");
        assert!(!s.contains('<'));
        assert!(!s.contains('>'));
        assert!(!s.contains(':'));
        assert!(!s.contains('"'));
    }

    #[test]
    fn sanitize_file_name_device_names() {
        let s = sanitize_file_name("CON");
        assert_ne!(s, "CON");
    }

    #[test]
    fn sanitize_file_name_empty_fallback() {
        assert_eq!(sanitize_file_name(""), "shortcut");
        assert_eq!(sanitize_file_name("   "), "shortcut");
    }

    // --- normalize_instance_name ---

    #[test]
    fn normalize_trims_and_lowercases() {
        assert_eq!(normalized_instance_name("  My Instance  "), "my instance");
    }

}
