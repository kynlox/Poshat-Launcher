// Аккаунты. Один источник правды — store.rs; структура совпадает с Electron-сборкой
// (старый store.json читается без миграции). Публичные карточки не отдают токены.

use chrono::Utc;
use md5::{Digest, Md5};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use serde::Serialize;

use crate::store::{
    get_active_account_id, list_account_records, replace_accounts, set_active_account_id,
    AccountRecord,
};

/// Глобальный лок на ВСЕ read-modify-write списка аккаунтов: без него два
/// параллельных add_account (логин + фоновый рефреш) затирают изменения
/// друг друга. Мутации редки, поэтому один Mutex на всех.
static ACCOUNTS_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

/// Карточка, видимая UI — без секретов (camelCase).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicAccount {
    pub id: String,
    pub r#type: String,
    pub name: String,
    pub uuid: String,
    pub avatar_url: Option<String>,
    pub added_at: Option<String>,
    pub expires_at: Option<i64>,
    pub expired: bool,
    pub has_token: bool,
    pub token_mask: Option<String>,
}

// ----------------------- helpers -----------------------

/// Оффлайн-UUID, совместимый с Java `UUID.nameUUIDFromBytes(...)`:
/// UUIDv3-биты( MD5("OfflinePlayer:<name>") ) — серверы видят игрока стабильно.
pub fn offline_uuid(name: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(format!("OfflinePlayer:{}", name).as_bytes());
    let mut bytes: [u8; 16] = hasher.finalize().into();
    // version=3 (имя-based MD5) + variant=RFC4122 — как в Java.
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    uuid::Uuid::from_bytes(bytes).hyphenated().to_string()
}

fn mask_token(t: Option<&str>) -> Option<String> {
    let t = t?;
    if t.len() < 8 {
        return Some("…".to_string());
    }
    Some(format!("{}…{}", &t[..4], &t[t.len() - 4..]))
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn public_form(acc: &AccountRecord) -> PublicAccount {
    PublicAccount {
        id: acc.id.clone(),
        r#type: acc.r#type.clone(),
        name: acc.name.clone(),
        uuid: acc.uuid.clone(),
        avatar_url: acc.avatar_url.clone(),
        added_at: acc.added_at.clone(),
        expires_at: acc.expires_at,
        expired: acc.expires_at.map(|e| e < now_ms()).unwrap_or(false),
        has_token: acc.access_token.as_deref().map(|s| !s.is_empty()).unwrap_or(false),
        token_mask: mask_token(acc.access_token.as_deref()),
    }
}

// ----------------------- публичный API -----------------------


pub fn list_accounts() -> Vec<PublicAccount> {
    list_account_records().iter().map(public_form).collect()
}

pub fn get_active_account_public() -> Option<PublicAccount> {
    let id = get_active_account_id()?;
    list_account_records().iter().find(|a| a.id == id).map(public_form)
}

/// Полная запись активного аккаунта — для launch (нужен access_token и uuid).
pub fn get_active_account_full() -> Option<AccountRecord> {
    let id = get_active_account_id()?;
    list_account_records().into_iter().find(|a| a.id == id)
}

pub fn set_active_account(id: Option<String>) -> Result<Option<PublicAccount>, String> {
    let _guard = ACCOUNTS_LOCK.lock();
    if let Some(ref id) = id {
        let exists = list_account_records().iter().any(|a| &a.id == id);
        if !exists {
            return Err("Аккаунт не найден".to_string());
        }
    }
    set_active_account_id(id);
    Ok(get_active_account_public())
}

/// add/update по паре (type, uuid). Если активного аккаунта не было —
/// добавленный становится активным (UX: первый аккаунт сразу выбран).
pub fn add_account(input: AccountRecord) -> Result<PublicAccount, String> {
    if input.r#type.is_empty() || input.name.is_empty() || input.uuid.is_empty() {
        return Err("Невалидный аккаунт".to_string());
    }
    let _guard = ACCOUNTS_LOCK.lock();
    let mut list = list_account_records();

    let existing_idx = list.iter().position(|a| a.r#type == input.r#type && a.uuid == input.uuid);
    let (id, added_at) = match existing_idx {
        Some(i) => (list[i].id.clone(), list[i].added_at.clone()),
        None => (uuid::Uuid::new_v4().to_string(), Some(Utc::now().to_rfc3339())),
    };

    let record = AccountRecord {
        id: id.clone(),
        r#type: input.r#type,
        name: input.name,
        uuid: input.uuid,
        access_token: input.access_token,
        refresh_token: input.refresh_token,
        client_token: input.client_token,
        expires_at: input.expires_at,
        avatar_url: input.avatar_url,
        added_at,
    };

    if let Some(i) = existing_idx {
        list[i] = record.clone();
    } else {
        list.push(record.clone());
    }
    replace_accounts(list);

    if get_active_account_id().is_none() {
        set_active_account_id(Some(id));
    }
    Ok(public_form(&record))
}

/// Создать оффлайн-профиль. Валидация ника — Java/Mojang-правила.
pub fn add_offline_account(name: String) -> Result<PublicAccount, String> {
    let clean = name.trim().to_string();
    if clean.is_empty() {
        return Err("Введи никнейм".to_string());
    }
    // 2-16 символов, латиница/цифры/_ — правила Vanilla.
    let valid = clean.len() >= 2 && clean.len() <= 16
        && clean.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    if !valid {
        return Err("Никнейм 2-16 символов: латиница, цифры, _".to_string());
    }
    add_account(AccountRecord {
        id: String::new(), // переопределится в add_account
        r#type: "offline".to_string(),
        name: clean.clone(),
        uuid: offline_uuid(&clean),
        access_token: None,
        refresh_token: None,
        client_token: None,
        expires_at: None,
        avatar_url: None,
        added_at: None,
    })
}

pub fn remove_account(id: &str) -> bool {
    let _guard = ACCOUNTS_LOCK.lock();
    let mut list = list_account_records();
    let next: Vec<AccountRecord> = list.drain(..).filter(|a| a.id != id).collect();
    replace_accounts(next.clone());
    if get_active_account_id().as_deref() == Some(id) {
        set_active_account_id(next.first().map(|a| a.id.clone()));
    }
    true
}

pub struct TokenPatch {
    pub access_token: Option<String>,
    pub refresh_token: Option<Option<String>>,
    pub client_token: Option<Option<String>>,
    pub expires_at: Option<Option<i64>>,
    pub name: Option<String>,
    pub uuid: Option<String>,
}

pub fn update_account_tokens(id: &str, patch: TokenPatch) -> Result<PublicAccount, String> {
    let _guard = ACCOUNTS_LOCK.lock();
    let mut list = list_account_records();
    let idx = list.iter().position(|a| a.id == id)
        .ok_or_else(|| "Аккаунт не найден".to_string())?;
    if let Some(v) = patch.access_token { list[idx].access_token = Some(v); }
    if let Some(v) = patch.refresh_token { list[idx].refresh_token = v; }
    if let Some(v) = patch.client_token { list[idx].client_token = v; }
    if let Some(v) = patch.expires_at { list[idx].expires_at = v; }
    if let Some(v) = patch.name { list[idx].name = v; }
    if let Some(v) = patch.uuid { list[idx].uuid = v; }
    let record = list[idx].clone();
    replace_accounts(list);
    Ok(public_form(&record))
}

// Шим для mc_install.rs — быстрый доступ к имени без двойного match на стороне вызова.
pub fn active_display_name() -> Option<String> {
    get_active_account_full().map(|a| a.name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offline_uuid_deterministic() {
        let a = offline_uuid("TestPlayer");
        let b = offline_uuid("TestPlayer");
        assert_eq!(a, b);
    }

    #[test]
    fn offline_uuid_different_for_different_names() {
        let a = offline_uuid("Player1");
        let b = offline_uuid("Player2");
        assert_ne!(a, b);
    }

    #[test]
    fn offline_uuid_format() {
        let u = offline_uuid("Test");
        // UUID v3 format: 8-4-4-4-12
        assert_eq!(u.len(), 36);
        let parts: Vec<&str> = u.split('-').collect();
        assert_eq!(parts.len(), 5);
        assert_eq!(parts[0].len(), 8);
        assert_eq!(parts[1].len(), 4);
        assert_eq!(parts[2].len(), 4);
        assert_eq!(parts[3].len(), 4);
        assert_eq!(parts[4].len(), 12);
    }

    #[test]
    fn offline_uuid_version_3() {
        let u = offline_uuid("Player");
        // Version nibble at position 13 (after first dash): should be '3'
        assert_eq!(u.chars().nth(14), Some('3'));
    }

    #[test]
    fn offline_uuid_variant_rfc4122() {
        let u = offline_uuid("Player");
        // Variant bits at position 19: should be 8, 9, a, or b
        let variant = u.chars().nth(19).unwrap();
        assert!("89ab".contains(variant));
    }

    #[test]
    fn mask_token_none() {
        assert!(mask_token(None).is_none());
    }

    #[test]
    fn mask_token_short() {
        let m = mask_token(Some("abc"));
        assert_eq!(m.as_deref(), Some("…"));
    }

    #[test]
    fn mask_token_exactly_8() {
        let m = mask_token(Some("12345678"));
        assert_eq!(m.as_deref(), Some("1234…5678"));
    }

    #[test]
    fn mask_token_long() {
        let m = mask_token(Some("abcdefghijklmnop"));
        assert_eq!(m.as_deref(), Some("abcd…mnop"));
    }

    #[test]
    fn mask_token_empty_string() {
        let m = mask_token(Some(""));
        assert_eq!(m.as_deref(), Some("…"));
    }

    #[test]
    fn now_ms_positive() {
        let t = now_ms();
        assert!(t > 0);
    }

    #[test]
    fn now_ms_approximately_now() {
        let t = now_ms();
        let expected = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        // Within 1 second
        assert!((t - expected).abs() < 1000);
    }

    #[test]
    fn public_account_serialization() {
        let acc = PublicAccount {
            id: "test-id".into(),
            r#type: "offline".into(),
            name: "TestPlayer".into(),
            uuid: "12345678-1234-3234-a234-123456789abc".into(),
            avatar_url: None,
            added_at: Some("2024-01-01T00:00:00Z".into()),
            expires_at: None,
            expired: false,
            has_token: true,
            token_mask: Some("abcd…wxyz".into()),
        };
        let json = serde_json::to_string(&acc).unwrap();
        assert!(json.contains("test-id"));
        assert!(json.contains("TestPlayer"));
        assert!(json.contains("tokenMask"));
        assert!(json.contains("avatarUrl"));
    }
}

