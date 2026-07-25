// Каталог модов/шейдеров/ресурспаков/датапаков из Modrinth (api.modrinth.com/v2, без ключа).
// Структуры один-в-один с catalogService.js и poshatAPI.ts, чтобы перетягивание было drop-in.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::http::{fetch_json_resilient, download_to_file, FetchOpts};
use crate::instances;
use crate::paths::ensure_dir;

const PROJECT_TYPES: &[&str] = &["mod", "shader", "resourcepack", "datapack"];

// Куда складывать файл внутри game_dir конкретного инстанса.
fn folder_by_type(project_type: &str) -> &'static str {
    match project_type {
        "shader" => "shaderpacks",
        "resourcepack" => "resourcepacks",
        "datapack" => "datapacks",
        _ => "mods",
    }
}

fn is_valid_type(project_type: &str) -> bool {
    PROJECT_TYPES.contains(&project_type)
}

// ----------------------------------------------------- структуры под payload

#[derive(Debug, Clone, Deserialize)]
pub struct SearchPayload {
    pub source: String,
    #[serde(default)]
    pub query: Option<String>,
    #[serde(rename = "projectType")]
    pub project_type: String,
    #[serde(default, rename = "mcVersion")]
    pub mc_version: Option<String>,
    #[serde(default)]
    pub loader: Option<String>,
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub sort: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InstallPayload {
    pub source: String,
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "instanceId")]
    pub instance_id: String,
    #[serde(rename = "projectType")]
    pub project_type: String,
    #[serde(default, rename = "mcVersion")]
    pub mc_version: Option<String>,
    #[serde(default)]
    pub loader: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InstallVersionPayload {
    pub source: String,
    // Modrinth-ветка тянет файл по version_id напрямую и project_id не нужен.
    // Поле оставлено в payload, чтобы фронт продолжал слать стабильную форму
    // запроса и чтобы будущий источник мог его взять.
    #[serde(rename = "projectId", default)]
    #[allow(dead_code)]
    pub project_id: String,
    #[serde(rename = "versionId")]
    pub version_id: String,
    #[serde(rename = "instanceId")]
    pub instance_id: String,
    #[serde(rename = "projectType")]
    pub project_type: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProjectPayload {
    pub source: String,
    #[serde(rename = "projectId")]
    pub project_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VersionsPayload {
    pub source: String,
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "projectType")]
    pub project_type: String,
    #[serde(default, rename = "mcVersion")]
    pub mc_version: Option<String>,
    #[serde(default)]
    pub loader: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InstalledPayload {
    #[serde(rename = "instanceId")]
    pub instance_id: String,
    #[serde(rename = "projectType")]
    pub project_type: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RemoveInstalledPayload {
    #[serde(rename = "instanceId")]
    pub instance_id: String,
    #[serde(rename = "projectType")]
    pub project_type: String,
    #[serde(rename = "fileName")]
    pub file_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallResult {
    pub path: String,
    #[serde(rename = "fileName")]
    pub file_name: String,
    #[serde(rename = "versionName")]
    pub version_name: Option<String>,
    pub size: u64,
}

#[derive(Debug, Clone)]
struct ResolvedFile {
    file_name: String,
    download_url: String,
    version_id: Option<String>,
    version_name: Option<String>,
    size: u64,
}

// ----------------------------------------------------------- helpers (URL)

fn url_encode(s: &str) -> String {
    // Очень лёгкий percent-encoder для path-segment. Кодируем всё, что не
    // unreserved по RFC 3986. Не тянем urlencoding-crate ради одной функции.
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        let c = *b;
        let unreserved = c.is_ascii_alphanumeric()
            || c == b'-'
            || c == b'_'
            || c == b'.'
            || c == b'~';
        if unreserved {
            out.push(c as char);
        } else {
            out.push_str(&format!("%{:02X}", c));
        }
    }
    out
}

fn query_encode(s: &str) -> String {
    // Для значений query-параметров: пробел → %20 (а не +), всё остальное
    // как в url_encode. Modrinth ничего против %20 не имеет.
    url_encode(s)
}

fn build_url(base: &str, params: &[(&str, String)]) -> String {
    if params.is_empty() { return base.to_string(); }
    let qs: Vec<String> = params
        .iter()
        .map(|(k, v)| format!("{}={}", query_encode(k), query_encode(v)))
        .collect();
    format!("{}?{}", base, qs.join("&"))
}

fn json_array_one(s: &str) -> String {
    // JSON-кодируем массив из одной строки: ["abc"]
    format!("[{}]", serde_json::Value::String(s.to_string()))
}

// -------------------------------------------------------------- Modrinth

async fn search_modrinth(payload: &SearchPayload) -> Result<Vec<Value>, String> {
    let project_type = &payload.project_type;
    let mut facets: Vec<Vec<String>> = vec![vec![format!("project_type:{}", project_type)]];
    if let Some(mv) = payload.mc_version.as_deref().filter(|s| !s.is_empty()) {
        facets.push(vec![format!("versions:{}", mv)]);
    }
    if project_type == "mod" {
        if let Some(loader) = payload.loader.as_deref() {
            if !loader.is_empty() && loader != "vanilla" {
                facets.push(vec![format!("categories:{}", loader)]);
            }
        }
    }
    let facets_json = serde_json::to_string(&facets).unwrap_or_else(|_| "[]".to_string());
    let limit = payload.limit.unwrap_or(30);

    let mut params: Vec<(&str, String)> = Vec::new();
    if let Some(q) = payload.query.as_deref().filter(|s| !s.is_empty()) {
        params.push(("query", q.to_string()));
    }
    params.push(("facets", facets_json));
    params.push(("limit", limit.to_string()));

    let sort_value = match payload.sort.as_deref().filter(|s| !s.is_empty()) {
        Some("downloads") => "downloads",
        Some("follows") => "follows",
        Some("newest") => "newest",
        Some("updated") => "updated",
        _ => "relevance",
    };
    params.push(("index", sort_value.to_string()));

    let url = build_url(obfstr::obfstr!("https://api.modrinth.com/v2/search"), &params);
    let data = fetch_json_resilient(&[&url], &FetchOpts::default())
        .await
        .map_err(|e| format!("Не удалось найти моды: {}", e))?;

    let Some(hits) = data.get("hits").and_then(|v| v.as_array()) else {
        return Ok(Vec::new());
    };

    let out: Vec<Value> = hits.iter().map(|hit| {
        let slug = hit.get("slug").and_then(|v| v.as_str()).unwrap_or("");
        let id = hit
            .get("project_id").and_then(|v| v.as_str())
            .unwrap_or(slug);
        json!({
            "source": "modrinth",
            "id": id,
            "slug": slug,
            "name": hit.get("title").cloned().unwrap_or(Value::Null),
            "summary": hit.get("description").cloned().unwrap_or(Value::Null),
            "author": hit.get("author").cloned().unwrap_or(Value::Null),
            "iconUrl": hit.get("icon_url").cloned().unwrap_or(Value::Null),
            "downloads": hit.get("downloads").cloned().unwrap_or(json!(0)),
            "follows": hit.get("follows").cloned().unwrap_or(json!(0)),
            "categories": hit.get("categories").cloned().unwrap_or(json!([])),
            "projectType": project_type,
            "pageUrl": format!("https://modrinth.com/{}/{}", project_type, slug),
        })
    }).collect();

    Ok(out)
}

async fn resolve_modrinth_file(
    project_id: &str,
    mc_version: Option<&str>,
    loader: Option<&str>,
    project_type: &str,
) -> Result<ResolvedFile, String> {
    // Стратегия как в plauncher.py и Node-версии: сначала точная серверная
    // фильтрация, потом клиентский фильтр по полному списку. Не ослабляем
    // дальше — если loader+version реально нет, ошибка.
    let base = format!(
        "{}/v2/project/{}/version",
        obfstr::obfstr!("https://api.modrinth.com"),
        url_encode(project_id),
    );

    async fn fetch_arr(base: &str, params: &[(&str, String)]) -> Vec<Value> {
        let url = build_url(base, params);
        let v = fetch_json_resilient(&[&url], &FetchOpts::default())
            .await
            .unwrap_or(Value::Null);
        match v {
            Value::Array(a) => a,
            _ => Vec::new(),
        }
    }

    let want_loader: Option<&str> = if project_type == "mod" {
        loader.filter(|l| !l.is_empty() && *l != "vanilla")
    } else {
        None
    };

    let mut versions: Vec<Value> = match (want_loader, mc_version) {
        (Some(l), Some(mv)) => {
            fetch_arr(&base, &[
                ("game_versions", json_array_one(mv)),
                ("loaders", json_array_one(l)),
            ]).await
        }
        (None, Some(mv)) => fetch_arr(&base, &[("game_versions", json_array_one(mv))]).await,
        _ => fetch_arr(&base, &[]).await,
    };

    // Fallback — взять весь список, отфильтровать руками.
    if versions.is_empty() {
        let all = fetch_arr(&base, &[]).await;
        versions = all.into_iter().filter(|v| {
            let mv_ok = mc_version.map(|mv| {
                v.get("game_versions")
                    .and_then(|x| x.as_array())
                    .map(|arr| arr.iter().any(|s| s.as_str() == Some(mv)))
                    .unwrap_or(false)
            }).unwrap_or(true);
            let ld_ok = want_loader.map(|l| {
                v.get("loaders")
                    .and_then(|x| x.as_array())
                    .map(|arr| arr.iter().any(|s| s.as_str() == Some(l)))
                    .unwrap_or(false)
            }).unwrap_or(true);
            mv_ok && ld_ok
        }).collect();
    }

    if versions.is_empty() {
        return Err(match (want_loader, mc_version) {
            (Some(l), Some(mv)) => format!(
                "Нет версии этого мода под {} {}. Открой страницу мода и выбери версию вручную.",
                l, mv,
            ),
            (_, Some(mv)) => format!("Нет версии для Minecraft {}", mv),
            _ => "Нет совместимых версий".to_string(),
        });
    }

    // Modrinth отдаёт от новых к старым — берём первую.
    let v = &versions[0];
    let files = v.get("files").and_then(|f| f.as_array()).cloned().unwrap_or_default();
    let file = files.iter().find(|f| f.get("primary").and_then(|x| x.as_bool()).unwrap_or(false))
        .or_else(|| files.first())
        .ok_or_else(|| "У версии нет файлов для скачивания".to_string())?;

    let url = file.get("url").and_then(|v| v.as_str())
        .ok_or_else(|| "У версии нет файлов для скачивания".to_string())?;
    let file_name = file.get("filename").and_then(|v| v.as_str()).unwrap_or("file").to_string();
    let size = file.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
    let version_id = v.get("id").and_then(|x| x.as_str()).map(|s| s.to_string());
    let version_name = v.get("version_number").and_then(|x| x.as_str())
        .or_else(|| v.get("name").and_then(|x| x.as_str()))
        .map(|s| s.to_string());

    Ok(ResolvedFile {
        file_name,
        download_url: url.to_string(),
        version_id,
        version_name,
        size,
    })
}

// --------------------------------------------------------------- Project

async fn get_modrinth_project(project_id: &str) -> Result<Value, String> {
    let url = format!("{}/v2/project/{}", obfstr::obfstr!("https://api.modrinth.com"), url_encode(project_id));
    let p = fetch_json_resilient(&[&url], &FetchOpts::default()).await?;
    if p.get("id").is_none() {
        return Err("Modrinth: проект не найден".to_string());
    }
    let slug = p.get("slug").and_then(|v| v.as_str()).unwrap_or("");
    let pt = p.get("project_type").and_then(|v| v.as_str()).unwrap_or("mod");
    let gallery = p.get("gallery").and_then(|g| g.as_array())
        .map(|arr| arr.iter().map(|g| {
            json!({
                "url": g.get("url").cloned().unwrap_or(Value::Null),
                "title": g.get("title").cloned().unwrap_or(json!("")),
                "description": g.get("description").cloned().unwrap_or(json!("")),
            })
        }).collect::<Vec<_>>())
        .unwrap_or_default();
    let license = p.get("license").and_then(|l| l.get("id")).cloned().unwrap_or(Value::Null);

    let author = {
        let members_url = format!(
            "{}/v2/project/{}/members",
            obfstr::obfstr!("https://api.modrinth.com"),
            url_encode(project_id),
        );
        fetch_json_resilient(&[&members_url], &FetchOpts::default())
            .await
            .ok()
            .and_then(|m| m.as_array().cloned())
            .and_then(|arr| arr.into_iter().next())
            .and_then(|member| {
                member.get("user")
                    .and_then(|u| u.get("username"))
                    .and_then(|u| u.as_str())
                    .map(|s| s.to_string())
            })
            .map(Value::String)
            .unwrap_or(Value::Null)
    };

    Ok(json!({
        "source": "modrinth",
        "id": p.get("id").cloned().unwrap_or(Value::Null),
        "slug": slug,
        "name": p.get("title").cloned().unwrap_or(Value::Null),
        "summary": p.get("description").cloned().unwrap_or(Value::Null),
        "descriptionHtml": Value::Null,
        "descriptionMd": p.get("body").cloned().unwrap_or(json!("")),
        "iconUrl": p.get("icon_url").cloned().unwrap_or(Value::Null),
        "gallery": gallery,
        "categories": p.get("categories").cloned().unwrap_or(json!([])),
        "loaders": p.get("loaders").cloned().unwrap_or(json!([])),
        "gameVersions": p.get("game_versions").cloned().unwrap_or(json!([])),
        "downloads": p.get("downloads").cloned().unwrap_or(json!(0)),
        "follows": p.get("followers").cloned().unwrap_or(json!(0)),
        "license": license,
        "pageUrl": format!("https://modrinth.com/{}/{}", pt, slug),
        "projectType": pt,
        "author": author,
    }))
}

// --------------------------------------------------------------- Versions

fn normalize_modrinth_version(v: &Value) -> Value {
    let files = v.get("files").and_then(|x| x.as_array()).cloned().unwrap_or_default();
    let file = files.iter().find(|f| f.get("primary").and_then(|x| x.as_bool()).unwrap_or(false))
        .cloned()
        .or_else(|| files.first().cloned())
        .unwrap_or(Value::Null);
    let url = file.get("url").cloned().unwrap_or(Value::Null);
    let can_dl = url.as_str().map(|s| !s.is_empty()).unwrap_or(false);

    json!({
        "source": "modrinth",
        "id": v.get("id").cloned().unwrap_or(Value::Null),
        "name": v.get("name").cloned().unwrap_or(Value::Null),
        "versionNumber": v.get("version_number").cloned().unwrap_or_else(|| v.get("name").cloned().unwrap_or(Value::Null)),
        "gameVersions": v.get("game_versions").cloned().unwrap_or(json!([])),
        "loaders": v.get("loaders").cloned().unwrap_or(json!([])),
        "releaseType": v.get("version_type").cloned().unwrap_or(json!("release")),
        "publishedAt": v.get("date_published").cloned().unwrap_or(Value::Null),
        "downloads": v.get("downloads").cloned().unwrap_or(json!(0)),
        "fileName": file.get("filename").cloned().unwrap_or(Value::Null),
        "downloadUrl": url,
        "size": file.get("size").cloned().unwrap_or(json!(0)),
        "canAutoDownload": can_dl,
    })
}

// --------------------------------------------------------------- IO

/// Проверка имени файла перед `target_dir.join(...)`.
///
/// Modrinth (или любой внешний источник) теоретически может вернуть
/// `"../../mods/evil.jar"` или `"C:\Windows\system32\evil.dll"` — и
/// `join` спокойно сменит каталог, переписав что угодно в game_dir
/// инстанса. Поэтому требуем, чтобы имя было именно basename'ом:
///   * не пустое, без NUL,
///   * `Path::file_name()` совпадает с исходной строкой —
///     это автоматически отсекает `/`, `\`, `..`, `.`, и абсолютные пути.
fn ensure_safe_basename(name: &str) -> Result<(), String> {
    use std::ffi::OsStr;
    let ok = !name.is_empty()
        && !name.contains('\0')
        && Path::new(name).file_name() == Some(OsStr::new(name));
    if !ok {
        return Err(format!("Подозрительное имя файла: {:?}", name));
    }
    // Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9).
    // Запись в эти имена обращается к системным устройствам вместо файлов.
    let stem = Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    const RESERVED: &[&str] = &[
        "con", "prn", "aux", "nul",
        "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
        "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
    ];
    if RESERVED.contains(&stem.to_lowercase().as_str()) {
        return Err(format!("Зарезервированное имя Windows: {:?}", name));
    }
    Ok(())
}

async fn write_resolved(
    resolved: &ResolvedFile,
    instance_id: &str,
    project_type: &str,
) -> Result<InstallResult, String> {
    ensure_safe_basename(&resolved.file_name)?;
    instances::validate_id(instance_id)?;
    let game_dir = instances::game_dir_of(instance_id);
    let subdir = folder_by_type(project_type);
    let target_dir = ensure_dir(game_dir.join(subdir));
    let target_path = target_dir.join(&resolved.file_name);

    let size = download_to_file(&resolved.download_url, &target_path, &[]).await?;

    Ok(InstallResult {
        path: target_path.to_string_lossy().into_owned(),
        file_name: resolved.file_name.clone(),
        version_name: resolved.version_name.clone(),
        size: if resolved.size > 0 { resolved.size } else { size },
    })
}

// --------------------------------------------------------------- public

pub async fn search(payload: SearchPayload) -> Result<Vec<Value>, String> {
    if !is_valid_type(&payload.project_type) {
        return Err(format!("Неподдерживаемый тип: {}", payload.project_type));
    }
    match payload.source.as_str() {
        "modrinth" => search_modrinth(&payload).await,
        other => Err(format!("Неизвестный источник: {}", other)),
    }
}

pub async fn install(payload: InstallPayload) -> Result<InstallResult, String> {
    if payload.instance_id.is_empty() {
        return Err("Нужно выбрать инстанс".to_string());
    }
    if !is_valid_type(&payload.project_type) {
        return Err(format!("Неподдерживаемый тип: {}", payload.project_type));
    }
    let resolved = match payload.source.as_str() {
        "modrinth" => resolve_modrinth_file(
            &payload.project_id,
            payload.mc_version.as_deref(),
            payload.loader.as_deref(),
            &payload.project_type,
        ).await?,
        other => return Err(format!("Неизвестный источник: {}", other)),
    };
    let result = write_resolved(&resolved, &payload.instance_id, &payload.project_type).await?;
    let _ = add_to_manifest(
        &payload.instance_id,
        &result.file_name,
        ManifestEntry {
            project_type: payload.project_type,
            project_id: payload.project_id,
            version_id: resolved.version_id.unwrap_or_default(),
            version_number: resolved.version_name,
            size: Some(result.size),
        },
    );
    Ok(result)
}

pub async fn install_version(payload: InstallVersionPayload) -> Result<InstallResult, String> {
    if payload.instance_id.is_empty() {
        return Err("Нужно выбрать инстанс".to_string());
    }
    if !is_valid_type(&payload.project_type) {
        return Err(format!("Неподдерживаемый тип: {}", payload.project_type));
    }

    let resolved = match payload.source.as_str() {
        "modrinth" => {
            let url = format!(
                "{}/v2/version/{}",
                obfstr::obfstr!("https://api.modrinth.com"),
                url_encode(&payload.version_id),
            );
            let v = fetch_json_resilient(&[&url], &FetchOpts::default()).await
                .map_err(|_| "Modrinth: версия не найдена".to_string())?;
            let files = v.get("files").and_then(|x| x.as_array()).cloned().unwrap_or_default();
            let file = files.iter().find(|f| f.get("primary").and_then(|x| x.as_bool()).unwrap_or(false))
                .or_else(|| files.first())
                .ok_or_else(|| "У этой версии нет файла для скачивания".to_string())?;
            let url = file.get("url").and_then(|v| v.as_str())
                .ok_or_else(|| "У этой версии нет файла для скачивания".to_string())?;
            ResolvedFile {
                file_name: file.get("filename").and_then(|v| v.as_str()).unwrap_or("file").to_string(),
                download_url: url.to_string(),
                version_id: v.get("id").and_then(|x| x.as_str()).map(|s| s.to_string()),
                version_name: v.get("version_number").and_then(|x| x.as_str())
                    .or_else(|| v.get("name").and_then(|x| x.as_str()))
                    .map(|s| s.to_string()),
                size: file.get("size").and_then(|v| v.as_u64()).unwrap_or(0),
            }
        }
        other => return Err(format!("Неизвестный источник: {}", other)),
    };

    let result = write_resolved(&resolved, &payload.instance_id, &payload.project_type).await?;
    let _ = add_to_manifest(
        &payload.instance_id,
        &result.file_name,
        ManifestEntry {
            project_type: payload.project_type,
            project_id: payload.project_id,
            version_id: payload.version_id,
            version_number: resolved.version_name,
            size: Some(result.size),
        },
    );
    Ok(result)
}

pub async fn project(payload: ProjectPayload) -> Result<Value, String> {
    match payload.source.as_str() {
        "modrinth" => get_modrinth_project(&payload.project_id).await,
        other => Err(format!("Неизвестный источник: {}", other)),
    }
}

pub async fn versions(payload: VersionsPayload) -> Result<Vec<Value>, String> {
    match payload.source.as_str() {
        "modrinth" => {
            let base = format!(
                "{}/v2/project/{}/version",
                obfstr::obfstr!("https://api.modrinth.com"),
                url_encode(&payload.project_id),
            );
            let mut params: Vec<(&str, String)> = Vec::new();
            if let Some(mv) = payload.mc_version.as_deref().filter(|s| !s.is_empty()) {
                params.push(("game_versions", json_array_one(mv)));
            }
            if payload.project_type == "mod" {
                if let Some(l) = payload.loader.as_deref().filter(|l| !l.is_empty() && *l != "vanilla") {
                    params.push(("loaders", json_array_one(l)));
                }
            }
            let url = build_url(&base, &params);
            let mut list = fetch_json_resilient(&[&url], &FetchOpts::default())
                .await
                .unwrap_or(Value::Null);
            let mut arr = list.as_array().cloned().unwrap_or_default();
            if arr.is_empty() {
                list = fetch_json_resilient(&[&base], &FetchOpts::default())
                    .await
                    .unwrap_or(Value::Null);
                arr = list.as_array().cloned().unwrap_or_default();
            }
            Ok(arr.iter().map(normalize_modrinth_version).collect())
        }
        other => Err(format!("Неизвестный источник: {}", other)),
    }
}

pub fn installed(payload: InstalledPayload) -> Vec<String> {
    if payload.instance_id.is_empty() || !is_valid_type(&payload.project_type) {
        return Vec::new();
    }
    if instances::validate_id(&payload.instance_id).is_err() {
        return Vec::new();
    }
    let game_dir = instances::game_dir_of(&payload.instance_id);
    let dir = game_dir.join(folder_by_type(&payload.project_type));
    let Ok(entries) = std::fs::read_dir(&dir) else { return Vec::new(); };
    entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect()
}

pub fn remove_installed(payload: RemoveInstalledPayload) -> Result<bool, String> {
    if payload.instance_id.is_empty() || payload.file_name.is_empty() {
        return Ok(false);
    }
    instances::validate_id(&payload.instance_id)?;
    let game_dir = instances::game_dir_of(&payload.instance_id);
    let subdir = folder_by_type(&payload.project_type);
    let target_dir = game_dir.join(subdir);
    let target = target_dir.join(&payload.file_name);

    // Защита от path traversal: финальный путь должен быть строго внутри target_dir.
    let expected = match target_dir.canonicalize() {
        Ok(p) => p,
        Err(_) => return Ok(false),
    };
    let resolved = match target.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            // Если файла нет — `canonicalize` падает, считаем «уже удалён».
            return Ok(false);
        }
    };
    if !path_is_within(&resolved, &expected) {
        return Ok(false);
    }
    // canonicalize()成功意味着文件存在. 直接删除而不重新检查exists(),
    // 否则会创建TOCTOU竞态窗口——文件在canonicalize和exists()之间消失时
    // manifest条目将不会被清理.
    match std::fs::remove_file(&resolved) {
        Ok(()) => {
            let _ = remove_from_manifest(&payload.instance_id, &payload.file_name);
            return Ok(true);
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // Файл уже удалён (другой процесс / пользователь) — чистим манифест.
            let _ = remove_from_manifest(&payload.instance_id, &payload.file_name);
            return Ok(true);
        }
        Err(e) => return Err(e.to_string()),
    }
}

fn path_is_within(child: &Path, parent: &Path) -> bool {
    let mut c = child.components();
    let mut p = parent.components();
    loop {
        match (p.next(), c.next()) {
            (Some(pa), Some(ca)) if pa == ca => continue,
            (Some(_), _) => return false,
            (None, _) => return true,
        }
    }
}

// ---------------------------------------------------------- manifest / updates

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestEntry {
    #[serde(rename = "projectType")]
    pub project_type: String,
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "versionId")]
    pub version_id: String,
    #[serde(rename = "versionNumber", default)]
    pub version_number: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Manifest {
    pub files: std::collections::HashMap<String, ManifestEntry>,
}

fn manifest_path(instance_id: &str) -> PathBuf {
    instances::game_dir_of(instance_id).join(".poshat-manifest.json")
}

fn read_manifest(instance_id: &str) -> Manifest {
    let p = manifest_path(instance_id);
    let Ok(data) = std::fs::read_to_string(&p) else {
        return Manifest::default();
    };
    serde_json::from_str(&data).unwrap_or_default()
}

fn write_manifest(instance_id: &str, manifest: &Manifest) -> Result<(), String> {
    let p = manifest_path(instance_id);
    let data = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
    std::fs::write(&p, data).map_err(|e| format!("Ошибка записи манифеста: {}", e))
}

fn add_to_manifest(
    instance_id: &str,
    file_name: &str,
    entry: ManifestEntry,
) -> Result<(), String> {
    let mut manifest = read_manifest(instance_id);
    manifest.files.insert(file_name.to_string(), entry);
    write_manifest(instance_id, &manifest)
}

fn remove_from_manifest(instance_id: &str, file_name: &str) -> Result<(), String> {
    let mut manifest = read_manifest(instance_id);
    manifest.files.remove(file_name);
    write_manifest(instance_id, &manifest)
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    #[serde(rename = "fileName")]
    pub file_name: String,
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "projectName")]
    pub project_name: String,
    #[serde(rename = "currentVersion")]
    pub current_version: String,
    #[serde(rename = "latestVersionId")]
    pub latest_version_id: String,
    #[serde(rename = "latestVersionNumber")]
    pub latest_version_number: String,
    #[serde(rename = "latestFileName")]
    pub latest_file_name: String,
    #[serde(rename = "downloadUrl")]
    pub download_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct VerifyResult {
    #[serde(rename = "fileName")]
    pub file_name: String,
    pub exists: bool,
    #[serde(rename = "projectId", default)]
    pub project_id: Option<String>,
    #[serde(rename = "expectedSize", default)]
    pub expected_size: Option<u64>,
    #[serde(rename = "actualSize", default)]
    pub actual_size: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CheckUpdatesPayload {
    #[serde(rename = "instanceId")]
    pub instance_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VerifyFilesPayload {
    #[serde(rename = "instanceId")]
    pub instance_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateModPayload {
    #[serde(rename = "instanceId")]
    pub instance_id: String,
    #[serde(rename = "fileName")]
    pub file_name: String,
    #[serde(rename = "versionId")]
    pub version_id: String,
    #[serde(rename = "projectType")]
    pub project_type: String,
}

pub async fn check_updates(payload: CheckUpdatesPayload) -> Result<Vec<UpdateInfo>, String> {
    if payload.instance_id.is_empty() {
        return Err("Нужно выбрать инстанс".to_string());
    }
    instances::validate_id(&payload.instance_id)?;
    let meta = instances::get_instance(&payload.instance_id)
        .ok_or_else(|| "Инстанс не найден".to_string())?;
    let manifest = read_manifest(&payload.instance_id);
    if manifest.files.is_empty() {
        return Ok(Vec::new());
    }

    use futures::future::join_all;

    let tasks: Vec<_> = manifest.files.iter()
        .filter(|(_, entry)| !entry.project_id.is_empty() && !entry.version_id.is_empty())
        .map(|(file_name, entry)| {
            let file_name = file_name.clone();
            let entry = entry.clone();
            let meta_loader = meta.loader.clone();
            let meta_mc = meta.mc_version.clone();
            async move {
                let base = format!(
                    "{}/v2/project/{}/version",
                    obfstr::obfstr!("https://api.modrinth.com"),
                    url_encode(&entry.project_id),
                );
                let mut params: Vec<(&str, String)> = Vec::new();
                if entry.project_type == "mod" && meta_loader != "vanilla" {
                    params.push(("loaders", json_array_one(&meta_loader)));
                }
                params.push(("game_versions", json_array_one(&meta_mc)));
                let url = build_url(&base, &params);
                let data = fetch_json_resilient(&[&url], &FetchOpts::default())
                    .await
                    .unwrap_or(Value::Null);
                let versions = match data {
                    Value::Array(a) => a,
                    _ => {
                        let url2 = build_url(&base, &[]);
                        let d2 = fetch_json_resilient(&[&url2], &FetchOpts::default())
                            .await
                            .unwrap_or(Value::Null);
                        match d2 {
                            Value::Array(a) => a,
                            _ => return None,
                        }
                    }
                };
                if versions.is_empty() {
                    return None;
                }
                let latest = &versions[0];
                let latest_id = latest.get("id").and_then(|v| v.as_str()).unwrap_or("");
                if latest_id == entry.version_id {
                    return None;
                }
                let files = latest.get("files").and_then(|f| f.as_array()).cloned().unwrap_or_default();
                let file = files.iter().find(|f| f.get("primary").and_then(|x| x.as_bool()).unwrap_or(false))
                    .or_else(|| files.first());
                let dl_file = file?;
                let dl_url = dl_file.get("url").and_then(|v| v.as_str());
                let dl_name = dl_file.get("filename").and_then(|v| v.as_str()).unwrap_or(&file_name);
                let version_number = latest.get("version_number").and_then(|x| x.as_str()).unwrap_or("");
                let version_name = latest.get("name").and_then(|x| x.as_str()).unwrap_or(version_number);

                let proj_url = format!(
                    "{}/v2/project/{}",
                    obfstr::obfstr!("https://api.modrinth.com"),
                    url_encode(&entry.project_id),
                );
                let proj_data = fetch_json_resilient(&[&proj_url], &FetchOpts::default())
                    .await
                    .unwrap_or(Value::Null);
                let project_name = proj_data.get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or(version_name);

                Some(UpdateInfo {
                    file_name: file_name.clone(),
                    project_id: entry.project_id.clone(),
                    project_name: project_name.to_string(),
                    current_version: entry.version_number.clone().unwrap_or_default(),
                    latest_version_id: latest_id.to_string(),
                    latest_version_number: version_number.to_string(),
                    latest_file_name: dl_name.to_string(),
                    download_url: dl_url.map(|s| s.to_string()),
                })
            }
        })
        .collect();

    let results = join_all(tasks).await;
    Ok(results.into_iter().flatten().collect())
}

pub fn verify_files(payload: VerifyFilesPayload) -> Result<Vec<VerifyResult>, String> {
    if payload.instance_id.is_empty() {
        return Err("Нужно выбрать инстанс".to_string());
    }
    instances::validate_id(&payload.instance_id)?;
    let manifest = read_manifest(&payload.instance_id);
    let game_dir = instances::game_dir_of(&payload.instance_id);
    let mut results = Vec::new();

    for (file_name, entry) in &manifest.files {
        let dir = game_dir.join(folder_by_type(&entry.project_type));
        let path = dir.join(file_name);
        let exists = path.exists();
        let actual_size = if exists {
            std::fs::metadata(&path).ok().map(|m| m.len())
        } else {
            None
        };
        results.push(VerifyResult {
            file_name: file_name.clone(),
            exists,
            project_id: Some(entry.project_id.clone()),
            expected_size: entry.size,
            actual_size,
        });
    }
    Ok(results)
}

pub async fn update_mod(payload: UpdateModPayload) -> Result<InstallResult, String> {
    if payload.instance_id.is_empty() {
        return Err("Нужно выбрать инстанс".to_string());
    }
    instances::validate_id(&payload.instance_id)?;
    ensure_safe_basename(&payload.file_name)?;

    let resolved = {
        let url = format!(
            "{}/v2/version/{}",
            obfstr::obfstr!("https://api.modrinth.com"),
            url_encode(&payload.version_id),
        );
        let v = fetch_json_resilient(&[&url], &FetchOpts::default())
            .await
            .map_err(|_| "Modrinth: версия не найдена".to_string())?;
        let files = v.get("files").and_then(|x| x.as_array()).cloned().unwrap_or_default();
        let file = files.iter().find(|f| f.get("primary").and_then(|x| x.as_bool()).unwrap_or(false))
            .or_else(|| files.first())
            .ok_or_else(|| "У этой версии нет файла для скачивания".to_string())?;
        let url = file.get("url").and_then(|v| v.as_str())
            .ok_or_else(|| "У этой версии нет файла для скачивания".to_string())?;
        let version_number = v.get("version_number").and_then(|x| x.as_str())
            .or_else(|| v.get("name").and_then(|x| x.as_str()))
            .map(|s| s.to_string());
        ResolvedFile {
            file_name: file.get("filename").and_then(|v| v.as_str()).unwrap_or("file").to_string(),
            download_url: url.to_string(),
            version_id: v.get("id").and_then(|x| x.as_str()).map(|s| s.to_string()),
            version_name: version_number.clone(),
            size: file.get("size").and_then(|v| v.as_u64()).unwrap_or(0),
        }
    };

    // Move old file aside before download; restore on failure.
    let game_dir = instances::game_dir_of(&payload.instance_id);
    let dir = game_dir.join(folder_by_type(&payload.project_type));
    let old_path = dir.join(&payload.file_name);
    let backup = old_path.with_extension("old");
    let moved = std::fs::rename(&old_path, &backup).is_ok();

    let result = match write_resolved(&resolved, &payload.instance_id, &payload.project_type).await {
        Ok(r) => r,
        Err(e) => {
            if moved { let _ = std::fs::rename(&backup, &old_path); }
            return Err(e);
        }
    };

    // Update manifest — backup удаляем ТОЛЬКО после успешного обновления
    // манифеста, иначе при ошибке записи манифеста старый файл будет удалён,
    // а запись в манифесте укажет на несуществующий файл.
    let manifest = read_manifest(&payload.instance_id);
    let project_id = manifest.files.get(&payload.file_name)
        .map(|e| e.project_id.clone())
        .unwrap_or_default();

    remove_from_manifest(&payload.instance_id, &payload.file_name)?;
    add_to_manifest(
        &payload.instance_id,
        &result.file_name,
        ManifestEntry {
            project_type: payload.project_type,
            project_id,
            version_id: payload.version_id,
            version_number: resolved.version_name.clone(),
            size: Some(result.size),
        },
    )?;
    let _ = std::fs::remove_file(&backup);

    Ok(result)
}

