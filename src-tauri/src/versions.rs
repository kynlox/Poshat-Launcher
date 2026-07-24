// Аналог electron/services/versionsService.js. Контракт один-в-один (массив
// `{ id, type, releaseTime, url, sha1 }`, двухслойный кеш, фоновый рефреш).
// Реализация — async через tokio: tauri 2 требует async-команды.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime};

use chrono::DateTime;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::Mutex as AsyncMutex;

use crate::http::{fetch_json_resilient, FetchOpts};
use crate::paths::{ensure_dir, get_roots};

const MEM_TTL: Duration = Duration::from_secs(5 * 60);
const FILE_TTL: Duration = Duration::from_secs(30 * 60);
const BACKGROUND_REFRESH: Duration = Duration::from_secs(5 * 60);

const MANIFEST_URLS: &[&str] = &[
    "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json",
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
    // v1 — крайний случай, если v2 ляжет.
    "https://launchermeta.mojang.com/mc/game/version_manifest.json",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionEntry {
    pub id: String,
    /// release / snapshot / old_beta / old_alpha
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(rename = "releaseTime")]
    pub release_time: Option<String>,
    pub url: Option<String>,
    pub sha1: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LatestPointers {
    pub release: Option<String>,
    pub snapshot: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    #[serde(default)]
    pub latest: LatestPointers,
    pub versions: Vec<VersionEntry>,
}

struct MemCache {
    data: Arc<Manifest>,
    fetched_at: SystemTime,
}

// Память: дешёвый sync-мьютекс для коротких чтений/записей кеша.
static MEM_CACHE: Lazy<Mutex<Option<MemCache>>> = Lazy::new(|| Mutex::new(None));

// Дедупликация одновременных загрузок. Кому-то одному отдаём «честный»
// сетевой запрос, остальные ждут результат под этим Mutex.
static INFLIGHT: Lazy<AsyncMutex<()>> = Lazy::new(|| AsyncMutex::new(()));

fn cache_file_path() -> PathBuf {
    let roots = get_roots();
    let dir = ensure_dir(roots.root.join("cache"));
    dir.join("version_manifest.json")
}

fn read_file_cache() -> Option<(Arc<Manifest>, Duration)> {
    let p = cache_file_path();
    let meta = std::fs::metadata(&p).ok()?;
    let modified = meta.modified().ok()?;
    let age = SystemTime::now().duration_since(modified).unwrap_or(Duration::ZERO);
    let raw = std::fs::read_to_string(&p).ok()?;
    let parsed: Manifest = serde_json::from_str(&raw).ok()?;
    if parsed.versions.is_empty() {
        return None;
    }
    Some((Arc::new(parsed), age))
}

fn write_file_cache(m: &Manifest) {
    let p = cache_file_path();
    if let Ok(body) = serde_json::to_string(m) {
        // Атомарно через tmp, иначе сбой записи оставит битый файл.
        let tmp = p.with_extension("json.tmp");
        if std::fs::write(&tmp, body).is_ok() {
            let _ = std::fs::rename(&tmp, &p);
        }
    }
}

fn normalize(raw: Value) -> Result<Manifest, String> {
    let latest: LatestPointers = serde_json::from_value(
        raw.get("latest").cloned().unwrap_or(Value::Null),
    )
    .unwrap_or_default();

    let raw_versions = raw
        .get("versions")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Невалидный манифест Mojang: нет поля versions".to_string())?;

    let mut versions = Vec::with_capacity(raw_versions.len());
    for v in raw_versions {
        let id = v.get("id").and_then(|x| x.as_str());
        let kind = v.get("type").and_then(|x| x.as_str());
        if let (Some(id), Some(kind)) = (id, kind) {
            versions.push(VersionEntry {
                id: id.to_string(),
                kind: kind.to_string(),
                release_time: v
                    .get("releaseTime")
                    .or_else(|| v.get("time"))
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
                url: v.get("url").and_then(|x| x.as_str()).map(|s| s.to_string()),
                sha1: v.get("sha1").and_then(|x| x.as_str()).map(|s| s.to_string()),
            });
        }
    }

    Ok(Manifest { latest, versions })
}

async fn fetch_fresh() -> Result<Arc<Manifest>, String> {
    let raw = fetch_json_resilient(MANIFEST_URLS, &FetchOpts {
        retries: Some(3),
        timeout_secs: Some(30),
        headers: Vec::new(),
    })
    .await?;
    let m = normalize(raw)?;
    write_file_cache(&m);
    Ok(Arc::new(m))
}

/// Главный API: вернуть актуальный манифест.
pub async fn fetch_manifest(force: bool) -> Result<Arc<Manifest>, String> {
    if !force {
        if let Some(ref c) = *MEM_CACHE.lock() {
            if c.fetched_at.elapsed().unwrap_or(MEM_TTL) < MEM_TTL {
                return Ok(c.data.clone());
            }
        }
    }

    // Дедупликация: лочим, под локом ещё раз проверяем мем-кеш (его мог
    // обновить тот, кто стоял в очереди до нас).
    let _guard = INFLIGHT.lock().await;
    if !force {
        if let Some(ref c) = *MEM_CACHE.lock() {
            if c.fetched_at.elapsed().unwrap_or(MEM_TTL) < MEM_TTL {
                return Ok(c.data.clone());
            }
        }

        // Свежий файл-кеш? Отдаём его, а в фоне обновим.
        if let Some((data, age)) = read_file_cache() {
            if age < FILE_TTL {
                *MEM_CACHE.lock() = Some(MemCache {
                    data: data.clone(),
                    fetched_at: SystemTime::now(),
                });
                // background refresh — не ждём; tauri::async_runtime гарантирует
                // правильный tokio-контекст в любой точке вызова.
                tauri::async_runtime::spawn(async move {
                    if let Ok(fresh) = fetch_fresh().await {
                        *MEM_CACHE.lock() = Some(MemCache {
                            data: fresh,
                            fetched_at: SystemTime::now(),
                        });
                    }
                });
                return Ok(data);
            }
        }
    }

    // Не вышло из кешей — тянем по-настоящему.
    match fetch_fresh().await {
        Ok(fresh) => {
            *MEM_CACHE.lock() = Some(MemCache {
                data: fresh.clone(),
                fetched_at: SystemTime::now(),
            });
            Ok(fresh)
        }
        Err(e) => {
            // Сеть упала — лучше отдать даже устаревший кеш, чем красный экран.
            if let Some((data, _)) = read_file_cache() {
                tracing::warn!("сеть упала, отдаю старый файл-кеш: {}", e);
                *MEM_CACHE.lock() = Some(MemCache {
                    data: data.clone(),
                    fetched_at: SystemTime::now(),
                });
                Ok(data)
            } else {
                Err(e)
            }
        }
    }
}

fn parse_time(s: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(s).ok().map(|d| d.timestamp_millis())
}

fn sort_ascending(mut list: Vec<VersionEntry>) -> Vec<VersionEntry> {
    list.sort_by(|a, b| {
        let ta = a.release_time.as_deref().and_then(parse_time);
        let tb = b.release_time.as_deref().and_then(parse_time);
        match (ta, tb) {
            (Some(x), Some(y)) => x.cmp(&y),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.id.cmp(&b.id),
        }
    });
    list
}

/// Аналог `listVersions`. Параметры опциональны (как в JS).
pub async fn list_versions(
    types: Option<Vec<String>>,
    order: Option<String>,
    force: bool,
) -> Result<Vec<VersionEntry>, String> {
    let m = fetch_manifest(force).await?;
    let mut list: Vec<VersionEntry> = if let Some(types) = types {
        let set: std::collections::HashSet<String> = types.into_iter().collect();
        m.versions.iter().filter(|v| set.contains(&v.kind)).cloned().collect()
    } else {
        m.versions.clone()
    };
    list = sort_ascending(list);
    if order.as_deref() == Some("desc") {
        list.reverse();
    }
    Ok(list)
}

pub async fn get_latest() -> Result<Option<VersionEntry>, String> {
    let m = fetch_manifest(false).await?;
    if let Some(ref id) = m.latest.release {
        return Ok(m.versions.iter().find(|v| &v.id == id).cloned());
    }
    Ok(m.versions.first().cloned())
}

pub async fn refresh() -> Result<Arc<Manifest>, String> {
    fetch_manifest(true).await
}

/// Список id, для которых на диске лежит только манифест-json
/// (без проверки jar). Оставлено как fallback / для внутреннего
/// диагностического использования. Команда `versions_installed`
/// теперь зовёт более строгий `mc_install::list_fully_installed_versions`.
#[allow(dead_code)]
pub fn list_installed_versions() -> Vec<String> {
    let dir = get_roots().shared.join("versions");
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let id = entry.file_name().to_string_lossy().into_owned();
        let json_path = entry.path().join(format!("{}.json", id));
        if json_path.exists() {
            out.push(id);
        }
    }
    out
}

/// Фоновый рефреш каждые 5 минут — стартуем один раз при инициализации.
/// Используем `tauri::async_runtime::spawn`, потому что `.setup()` Tauri
/// зовётся в sync-контексте: чистый `tokio::spawn` упадёт с "no reactor running".
/// async_runtime внутри Tauri 2 — это и есть tokio, так что interval работает.
pub fn start_background_refresh() {
    tauri::async_runtime::spawn(async {
        let mut interval = tokio::time::interval(BACKGROUND_REFRESH);
        // первый tick срабатывает сразу — пропускаем, чтобы не делать
        // лишний запрос на старте: при первом UI-вызове он сам случится.
        interval.tick().await;
        loop {
            interval.tick().await;
            let _ = fetch_manifest(true).await;
        }
    });
}
