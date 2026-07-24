// Ely.by — Yggdrasil-совместимый authserver. Для подмены auth-эндпоинтов в
// клиенте используем authlib-injector как `-javaagent`. URL берём из официального
// манифеста yushi.moe — прямая ссылка ely.by/load иногда отдаёт 404.

use serde::Serialize;
use serde_json::{json, Value};

use crate::accounts::{self, TokenPatch};
use crate::http::{download_to_file, fetch_json_resilient, CLIENT, FetchOpts};
use crate::paths::{ensure_dir, get_roots};
use crate::store::AccountRecord;

// Базовый URL Ely.by Yggdrasil. НЕ const — обёрнут obfstr!() при каждом
// использовании: литерал шифруется на этапе компиляции, в .exe лежит зашифрованный
// массив байт. `strings program.exe | grep ely.by` ничего не покажет.
const AUTHLIB_PREFIX: &str = "ely.by";
const AUTHLIB_MANIFEST: &str = "https://authlib-injector.yushi.moe/artifact/latest.json";

/// Срок жизни токена ely.by (в JS-версии 2 дня).
const ELY_TOKEN_TTL_MS: i64 = 2 * 24 * 60 * 60 * 1000;

#[derive(Debug, Serialize)]
pub struct ElyLoginResult {
    pub account: accounts::PublicAccount,
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Percent-encode для path-сегмента URL. unreserved по RFC 3986 как есть,
/// остальное (включая UTF-8 байты) — кодируем.
fn percent_encode_path(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        let c = *b;
        if c.is_ascii_alphanumeric() || c == b'-' || c == b'_' || c == b'.' || c == b'~' {
            out.push(c as char);
        } else {
            out.push_str(&format!("%{:02X}", c));
        }
    }
    out
}

fn parse_err(ctx: &str, status: u16, body: &str) -> String {
    // ely.by отдаёт { error, errorMessage }. RAW body НИКОГДА не лепим в сообщение:
    // на /refresh / /authenticate сервер эхает обратно accessToken/clientToken —
    // утекут в логи и тосты. Берём только эти два поля.
    if let Ok(v) = serde_json::from_str::<Value>(body) {
        let msg = v.get("errorMessage").and_then(|x| x.as_str())
            .or_else(|| v.get("error").and_then(|x| x.as_str()))
            .unwrap_or("");
        if !msg.is_empty() {
            return format!("{}: {}", ctx, msg);
        }
    }
    format!("{}: HTTP {}", ctx, status)
}

async fn post_json(url: &str, body: &Value, ctx: &str) -> Result<Value, String> {
    let res = CLIENT
        .post(url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("{}: сеть: {}", ctx, e))?;

    let status = res.status();
    let text = res.text().await.map_err(|e| format!("{}: чтение тела: {}", ctx, e))?;
    if !status.is_success() {
        return Err(parse_err(ctx, status.as_u16(), &text));
    }
    serde_json::from_str(&text).map_err(|e| format!("{}: парсинг JSON: {}", ctx, e))
}

// -------------------------------------------------- login / refresh

pub async fn login(username: String, password: String) -> Result<ElyLoginResult, String> {
    if username.trim().is_empty() || password.is_empty() {
        return Err("Введи логин и пароль".to_string());
    }
    let client_token = uuid::Uuid::new_v4().to_string();
    let body = json!({
        "username": username,
        "password": password,
        "clientToken": client_token,
        "requestUser": true,
    });
    let data = post_json(&format!("{}/authenticate", obfstr::obfstr!("https://authserver.ely.by/auth")), &body, "ely.by auth").await?;

    let profile = data.get("selectedProfile")
        .ok_or_else(|| "ely.by: профиль не выбран (купи Minecraft / выбери ник на ely.by/profile)".to_string())?;
    let access_token = data.get("accessToken").and_then(|v| v.as_str())
        .ok_or_else(|| "ely.by: нет accessToken в ответе".to_string())?
        .to_string();
    let response_client_token = data.get("clientToken").and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or(client_token);
    let profile_name = profile.get("name").and_then(|v| v.as_str())
        .ok_or_else(|| "ely.by: профиль без имени".to_string())?
        .to_string();
    let profile_id = profile.get("id").and_then(|v| v.as_str())
        .ok_or_else(|| "ely.by: профиль без id".to_string())?
        .to_string();

    // ely.by разрешает юникод в нике (русские буквы); такие символы в path-сегменте
    // URL ломают <img src>. Простой percent-encode для не-ASCII решает это без
    // лишней зависимости (urlencoding).
    let avatar = format!(
        "https://ely.by/avatar/{}/64",
        percent_encode_path(&profile_name)
    );
    let public = accounts::add_account(AccountRecord {
        id: String::new(),
        r#type: "elyby".to_string(),
        name: profile_name,
        uuid: profile_id,
        access_token: Some(access_token),
        refresh_token: None,
        client_token: Some(response_client_token),
        expires_at: Some(now_ms() + ELY_TOKEN_TTL_MS),
        avatar_url: Some(avatar),
        added_at: None,
    })?;

    Ok(ElyLoginResult { account: public })
}

pub async fn refresh(account_id: String) -> Result<accounts::PublicAccount, String> {
    let acc = accounts::get_active_account_full()
        .filter(|a| a.id == account_id)
        .or_else(|| {
            crate::store::list_account_records().into_iter().find(|a| a.id == account_id)
        })
        .ok_or_else(|| "Аккаунт не найден".to_string())?;
    if acc.r#type != "elyby" {
        return Err("Не ely.by аккаунт".to_string());
    }
    let access_token = acc.access_token.clone()
        .ok_or_else(|| "У аккаунта нет accessToken".to_string())?;
    let client_token = acc.client_token.clone()
        .ok_or_else(|| "У аккаунта нет clientToken".to_string())?;

    let body = json!({
        "accessToken": access_token,
        "clientToken": client_token,
        "requestUser": true,
    });
    let data = post_json(&format!("{}/refresh", obfstr::obfstr!("https://authserver.ely.by/auth")), &body, "ely.by refresh").await?;

    let new_access = data.get("accessToken").and_then(|v| v.as_str())
        .ok_or_else(|| "ely.by refresh: нет accessToken".to_string())?
        .to_string();
    let new_client = data.get("clientToken").and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or(Some(client_token));
    let new_name = data.get("selectedProfile").and_then(|p| p.get("name")).and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let new_uuid = data.get("selectedProfile").and_then(|p| p.get("id")).and_then(|v| v.as_str())
        .map(|s| s.to_string());

    accounts::update_account_tokens(&account_id, TokenPatch {
        access_token: Some(new_access),
        refresh_token: None,
        client_token: Some(new_client),
        expires_at: Some(Some(now_ms() + ELY_TOKEN_TTL_MS)),
        name: new_name,
        uuid: new_uuid,
    })
}

// -------------------------------------------------- authlib-injector

fn authlib_injector_path() -> std::path::PathBuf {
    let dir = ensure_dir(get_roots().runtime.join("authlib-injector"));
    dir.join("authlib-injector.jar")
}

pub async fn ensure_authlib_injector() -> Result<std::path::PathBuf, String> {
    let jar = authlib_injector_path();
    if jar.exists() {
        if let Ok(meta) = std::fs::metadata(&jar) {
            // 100КБ — порог санити-чека (как в JS): меньше — почти наверняка
            // обрезанный файл от прерванной скачки.
            if meta.len() > 100_000 {
                return Ok(jar);
            }
        }
    }

    let manifest = fetch_json_resilient(&[AUTHLIB_MANIFEST], &FetchOpts::default())
        .await
        .map_err(|e| format!("Не удалось получить manifest authlib-injector: {}", e))?;
    let download_url = manifest.get("download_url").and_then(|v| v.as_str())
        .ok_or_else(|| "В manifest authlib-injector нет download_url".to_string())?
        .to_string();

    download_to_file(&download_url, &jar, &[]).await?;
    Ok(jar)
}

/// JVM-аргумент для запуска Minecraft с ely.by-аккаунтом:
/// `-javaagent:<path-to-jar>=<prefix>`.
pub async fn authlib_injector_jvm_arg() -> Result<String, String> {
    let jar = ensure_authlib_injector().await?;
    Ok(format!("-javaagent:{}={}", jar.to_string_lossy(), AUTHLIB_PREFIX))
}
