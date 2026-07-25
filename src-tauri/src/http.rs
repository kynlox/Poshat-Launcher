// HTTP-клиент: общий UA (некоторые серверы Mojang смотрят на него), таймаут,
// резильентный fetch JSON (зеркала × N попыток с экспоненциальной задержкой).
//
// ВАЖНО (security): TLS проверяется системными корнями. Раньше здесь стоял
// `danger_accept_invalid_certs(true)` (унаследовано из plauncher.py, verify=False),
// но он распространялся на ВСЁ — включая ely.by auth и скачивание модов. Любой
// MITM мог подменить authserver.ely.by и собрать access-токены. Снято.
// Mojang/Modrinth/ely.by обслуживаются публичными CA; корпоративный MITM —
// пусть добавит свой корневой сертификат в системный trust store Windows.

use std::time::Duration;

use once_cell::sync::Lazy;
use reqwest::Client;
use serde::Serialize;
use serde_json::Value;

pub const UA: &str = "PoshatLauncher/1.0 (+https://poshat.local)";
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_RETRIES: u32 = 3;

/// Один клиент на весь процесс — переиспользует connection pool.
pub static CLIENT: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .user_agent(UA)
        .timeout(DEFAULT_TIMEOUT)
        .build()
        .expect("failed to build reqwest client")
});

#[derive(Debug, Default, Clone, Serialize)]
pub struct FetchOpts {
    pub retries: Option<u32>,
    pub timeout_secs: Option<u64>,
    /// Доп. заголовки (например, авторизация в API).
    pub headers: Vec<(String, String)>,
}

async fn delay(ms: u64) {
    tokio::time::sleep(Duration::from_millis(ms)).await;
}

/// Универсальный загрузчик: список зеркал × несколько попыток.
pub async fn fetch_json_resilient(urls: &[&str], opts: &FetchOpts) -> Result<Value, String> {
    let retries = opts.retries.unwrap_or(DEFAULT_RETRIES);
    let timeout = opts.timeout_secs.map(Duration::from_secs);
    let mut last_err: Option<String> = None;

    for url in urls {
        for attempt in 0..retries {
            let mut req = CLIENT.get(*url);
            if let Some(t) = timeout {
                req = req.timeout(t);
            }
            for (k, v) in &opts.headers {
                req = req.header(k, v);
            }

            match req.send().await {
                Ok(res) if res.status().is_success() => {
                    match res.json::<Value>().await {
                        Ok(v) => return Ok(v),
                        Err(e) => last_err = Some(format!("parse {}: {}", url, e)),
                    }
                }
                Ok(res) => {
                    last_err = Some(format!("HTTP {} for {}", res.status(), url));
                }
                Err(e) => {
                    last_err = Some(format!("network {}: {}", url, e));
                }
            }

            // экспоненциальная задержка перед повтором
            if attempt + 1 < retries {
                delay(500u64 * (attempt as u64 + 1)).await;
            }
        }
    }

    Err(last_err.unwrap_or_else(|| "fetch_json_resilient: all attempts failed".into()))
}

/// Скачать `url` в файл по `dest`. Пишем через временный файл рядом, потом rename —
/// иначе при внезапной смерти процесса останется полу-записанный `*.jar`,
/// от которого Minecraft крашится.
pub async fn download_to_file(
    url: &str,
    dest: &std::path::Path,
    headers: &[(String, String)],
) -> Result<u64, String> {
    use tokio::io::AsyncWriteExt;

    let mut req = CLIENT.get(url).timeout(Duration::from_secs(120));
    for (k, v) in headers {
        req = req.header(k, v);
    }

    let res = req
        .send()
        .await
        .map_err(|e| format!("Сеть: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("HTTP {} для {}", res.status(), url));
    }

    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Не удалось создать {}: {}", parent.display(), e))?;
    }

    let tmp = dest.with_extension({
        let ext = dest.extension().and_then(|s| s.to_str()).unwrap_or("");
        if ext.is_empty() { "part".to_string() } else { format!("{}.part", ext) }
    });

    let download_result = async {
        let mut file = tokio::fs::File::create(&tmp)
            .await
            .map_err(|e| format!("Не удалось создать {}: {}", tmp.display(), e))?;

        let mut stream = res.bytes_stream();
        let mut total: u64 = 0;
        use futures::StreamExt;
        while let Some(chunk) = stream.next().await {
            let bytes = chunk.map_err(|e| format!("Чтение тела: {}", e))?;
            file.write_all(&bytes)
                .await
                .map_err(|e| format!("Запись в {}: {}", tmp.display(), e))?;
            total += bytes.len() as u64;
        }
        file.flush()
            .await
            .map_err(|e| format!("Сброс {}: {}", tmp.display(), e))?;
        drop(file);
        Ok::<u64, String>(total)
    }
    .await;

    match download_result {
        Ok(total) => {
            tokio::fs::rename(&tmp, dest)
                .await
                .map_err(|e| format!("Переименование {}: {}", tmp.display(), e))?;
            Ok(total)
        }
        Err(e) => {
            let _ = tokio::fs::remove_file(&tmp).await;
            Err(e)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ua_contains_launcher_name() {
        assert!(UA.contains("PoshatLauncher"));
    }

    #[test]
    fn ua_has_contact_url() {
        assert!(UA.contains("https://poshat.local"));
    }

    #[test]
    fn fetch_opts_default() {
        let opts = FetchOpts::default();
        assert!(opts.retries.is_none());
        assert!(opts.timeout_secs.is_none());
        assert!(opts.headers.is_empty());
    }

    #[test]
    fn fetch_opts_with_headers() {
        let opts = FetchOpts {
            retries: Some(5),
            timeout_secs: Some(60),
            headers: vec![
                ("Authorization".into(), "Bearer token".into()),
                ("Accept".into(), "application/json".into()),
            ],
        };
        assert_eq!(opts.retries, Some(5));
        assert_eq!(opts.timeout_secs, Some(60));
        assert_eq!(opts.headers.len(), 2);
        assert_eq!(opts.headers[0].0, "Authorization");
    }

    #[test]
    fn fetch_opts_clone() {
        let opts = FetchOpts {
            retries: Some(3),
            timeout_secs: Some(10),
            headers: vec![("Key".into(), "Val".into())],
        };
        let cloned = opts.clone();
        assert_eq!(cloned.retries, Some(3));
        assert_eq!(cloned.headers.len(), 1);
    }

    #[test]
    fn fetch_opts_serialization() {
        let opts = FetchOpts {
            retries: Some(2),
            timeout_secs: Some(15),
            headers: vec![],
        };
        let json = serde_json::to_string(&opts).unwrap();
        assert!(json.contains("retries"));
        assert!(json.contains("timeout_secs"));
    }
}
