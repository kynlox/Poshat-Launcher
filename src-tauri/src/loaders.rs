// Версии лоадеров для MC-версии — lyceris не отдаёт такой список, поэтому
// здесь прямые HTTP-запросы к официальным meta-эндпоинтам.
// Forge/NeoForge split: 1.20.1 → forge, 1.20.2+ → neoforge; для 1.20.1
// neoforge вернёт пустой список, и UI сам предложит Forge.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::http::{fetch_json_resilient, FetchOpts};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoaderVersion {
    pub version: String,
    /// Помечен ли как stable у Fabric/Quilt, либо latest/recommended
    /// у Forge. UI рисует у таких пометку.
    pub stable: bool,
    /// Опциональный «тип» (для Forge: "latest" | "recommended"). Для
    /// прочих — None.
    pub tag: Option<String>,
}

fn fetch_opts() -> FetchOpts {
    FetchOpts {
        retries: Some(2),
        timeout_secs: Some(20),
        headers: Vec::new(),
    }
}

pub async fn list_loader_versions(loader: &str, mc_version: &str) -> Result<Vec<LoaderVersion>, String> {
    match loader.to_lowercase().as_str() {
        "vanilla" => Ok(Vec::new()),
        "fabric" => fabric(mc_version).await,
        "quilt" => quilt(mc_version).await,
        "forge" => forge(mc_version).await,
        "neoforge" => neoforge(mc_version).await,
        other => Err(format!("Неизвестный лоадер: {}", other)),
    }
}

// -------- Fabric --------
// GET https://meta.fabricmc.net/v2/versions/loader/<mc>
async fn fabric(mc: &str) -> Result<Vec<LoaderVersion>, String> {
    let url = format!("https://meta.fabricmc.net/v2/versions/loader/{}", mc);
    let raw = fetch_json_resilient(&[&url], &fetch_opts()).await?;
    let arr = raw.as_array().cloned().unwrap_or_default();
    let mut out = Vec::with_capacity(arr.len());
    for item in arr {
        if let Some(l) = item.get("loader") {
            if let Some(v) = l.get("version").and_then(Value::as_str) {
                let stable = l.get("stable").and_then(Value::as_bool).unwrap_or(false);
                out.push(LoaderVersion {
                    version: v.to_string(),
                    stable,
                    tag: None,
                });
            }
        }
    }
    Ok(out)
}

// -------- Quilt --------
// GET https://meta.quiltmc.org/v3/versions/loader/<mc>
async fn quilt(mc: &str) -> Result<Vec<LoaderVersion>, String> {
    let url = format!("https://meta.quiltmc.org/v3/versions/loader/{}", mc);
    let raw = fetch_json_resilient(&[&url], &fetch_opts()).await?;
    let arr = raw.as_array().cloned().unwrap_or_default();
    let mut out = Vec::with_capacity(arr.len());
    for item in arr {
        if let Some(l) = item.get("loader") {
            if let Some(v) = l.get("version").and_then(Value::as_str) {
                // Quilt не отдаёт stable-флаг — определяем по beta-суффиксу.
                let stable = !v.contains("beta") && !v.contains("rc");
                out.push(LoaderVersion {
                    version: v.to_string(),
                    stable,
                    tag: None,
                });
            }
        }
    }
    Ok(out)
}

// -------- Forge --------
// promotions_slim.json даёт пары "<mc>-recommended"/"<mc>-latest" → версия.
// Полный список в maven-metadata.xml, но для UI достаточно recommended+latest.
async fn forge(mc: &str) -> Result<Vec<LoaderVersion>, String> {
    let url = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
    let raw = fetch_json_resilient(&[url], &fetch_opts()).await?;
    let promos = raw
        .get("promos")
        .and_then(Value::as_object)
        .ok_or_else(|| "Невалидный promotions_slim.json: нет поля promos".to_string())?;

    let mut out = Vec::new();
    // Сначала recommended (его обычно ставит большинство).
    if let Some(v) = promos.get(&format!("{}-recommended", mc)).and_then(Value::as_str) {
        out.push(LoaderVersion {
            version: v.to_string(),
            stable: true,
            tag: Some("recommended".to_string()),
        });
    }
    if let Some(v) = promos.get(&format!("{}-latest", mc)).and_then(Value::as_str) {
        // Если recommended == latest (бывает) — не дублируем.
        let already = out.iter().any(|x| x.version == v);
        if !already {
            out.push(LoaderVersion {
                version: v.to_string(),
                stable: false,
                tag: Some("latest".to_string()),
            });
        }
    }
    Ok(out)
}

// -------- NeoForge --------
// API возвращает все версии артефакта; нам нужны только те, что
// начинаются с маппинга MC-версии (NeoForge кодирует major.minor MC
// в первых двух полях своей версии: для 1.20.4 → 20.4.x.y).
async fn neoforge(mc: &str) -> Result<Vec<LoaderVersion>, String> {
    // mc вида "1.20.4" → префикс "20.4." (для 1.21.4 → "21.4.")
    let prefix = mc.strip_prefix("1.").map(|s| format!("{}.", s));
    let url = "https://maven.neoforged.net/api/maven/details/releases/net/neoforged/neoforge";
    let raw = fetch_json_resilient(&[url], &fetch_opts()).await?;
    let files = raw
        .get("files")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut versions = Vec::new();
    for f in files {
        let Some(name) = f.get("name").and_then(Value::as_str) else { continue };
        if let Some(ref p) = prefix {
            if !name.starts_with(p) {
                continue;
            }
        }
        versions.push(name.to_string());
    }

    // API отдаёт по возрастанию; нам удобнее свежие сверху.
    versions.sort();
    versions.reverse();

    Ok(versions
        .into_iter()
        .map(|v| LoaderVersion {
            stable: !v.contains("beta") && !v.contains("rc"),
            version: v,
            tag: None,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loader_version_serialization() {
        let lv = LoaderVersion {
            version: "0.16.11".into(),
            stable: true,
            tag: Some("recommended".into()),
        };
        let json = serde_json::to_string(&lv).unwrap();
        assert!(json.contains("0.16.11"));
        assert!(json.contains("recommended"));
    }

    #[test]
    fn loader_version_no_tag() {
        let lv = LoaderVersion {
            version: "1.0.0".into(),
            stable: false,
            tag: None,
        };
        let json = serde_json::to_string(&lv).unwrap();
        assert!(json.contains("tag"));
        assert!(json.contains("null"));
    }

    #[test]
    fn stable_detection_beta() {
        let versions = vec!["0.15.0-beta.1", "0.15.0-rc.1", "0.15.0"];
        let results: Vec<bool> = versions.iter()
            .map(|v| !v.contains("beta") && !v.contains("rc"))
            .collect();
        assert_eq!(results, vec![false, false, true]);
    }
}
