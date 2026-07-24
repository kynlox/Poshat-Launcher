// Аналог electron/store.js на голом serde_json.
// Контракт один-в-один с Electron-версией, чтобы старые store.json читались без миграции.

use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::paths::get_roots;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct VersionFilters {
    pub release: bool,
    pub snapshot: bool,
    // electron-store писал ключи как `old_beta` / `old_alpha` — сохраняем.
    #[serde(rename = "old_beta")]
    pub old_beta: bool,
    #[serde(rename = "old_alpha")]
    pub old_alpha: bool,
}

impl Default for VersionFilters {
    fn default() -> Self {
        Self { release: true, snapshot: false, old_beta: false, old_alpha: false }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default, rename = "versionFilters")]
    pub version_filters: VersionFilters,
    #[serde(default = "default_mem_gb", rename = "javaMemoryGb")]
    pub java_memory_gb: u32,

    // ----- новые игровые/JVM настройки (все с serde-defaults, чтобы
    //       старый store.json без них продолжал читаться) -----

    /// Ширина окна Minecraft при старте. Передаётся как --width <N>.
    #[serde(default = "default_w", rename = "mcWindowWidth")]
    pub mc_window_width: u32,
    /// Высота окна Minecraft при старте. Передаётся как --height <N>.
    #[serde(default = "default_h", rename = "mcWindowHeight")]
    pub mc_window_height: u32,

    /// Автоматически переключаться на вкладку «Логи» при запуске игры.
    /// Удобно для отладки крашей, обычным игрокам — выключено.
    #[serde(default, rename = "autoOpenLogs")]
    pub auto_open_logs: bool,

    /// Сборщик мусора Java:
    ///   "default" — не трогаем (что lyceris/Mojang настроили)
    ///   "g1"      — -XX:+UseG1GC (по умолчанию у современной JVM, но
    ///              некоторые модпаки переопределяют — даём явный контроль)
    ///   "zgc"     — -XX:+UseZGC (Java 21+, отличный для больших heap)
    ///   "shenandoah" — -XX:+UseShenandoahGC (низколатентный)
    #[serde(default = "default_gc_type", rename = "gcType")]
    pub gc_type: String,

    /// Доп. JVM-аргументы — свободный текст. Будут переданы as-is перед
    /// служебными аргументами lyceris. Разбиваем по whitespace.
    /// Пример: "-XX:+DisableExplicitGC -Dfile.encoding=UTF-8"
    #[serde(default, rename = "extraJvmArgs")]
    pub extra_jvm_args: String,

    #[serde(default = "default_launcher_w", rename = "launcherWindowWidth")]
    pub launcher_window_width: u32,
    #[serde(default = "default_launcher_h", rename = "launcherWindowHeight")]
    pub launcher_window_height: u32,
    #[serde(default = "default_instances_sort", rename = "instancesSort")]
    pub instances_sort: String,
    #[serde(default = "default_theme_id", rename = "themeId")]
    pub theme_id: String,
    #[serde(default, rename = "pinnedInstances")]
    pub pinned_instances: Vec<String>,
    #[serde(default, rename = "sidebarCollapsed")]
    pub sidebar_collapsed: bool,
    #[serde(default, rename = "onboardingCompleted")]
    pub onboarding_completed: bool,
}

fn default_mem_gb() -> u32 { 4 }
fn default_w() -> u32 { 854 }
fn default_h() -> u32 { 480 }
fn default_gc_type() -> String { "default".to_string() }
fn default_launcher_w() -> u32 { 920 }
fn default_launcher_h() -> u32 { 620 }
fn default_instances_sort() -> String { "recent".to_string() }
fn default_theme_id() -> String { "dark".to_string() }

impl Default for Settings {
    fn default() -> Self {
        Self {
            version_filters: VersionFilters::default(),
            java_memory_gb: 4,
            mc_window_width: default_w(),
            mc_window_height: default_h(),
            auto_open_logs: false,
            gc_type: default_gc_type(),
            extra_jvm_args: String::new(),
            launcher_window_width: default_launcher_w(),
            launcher_window_height: default_launcher_h(),
            instances_sort: default_instances_sort(),
            theme_id: default_theme_id(),
            pinned_instances: Vec::new(),
            sidebar_collapsed: false,
            onboarding_completed: false,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LastSelection {
    #[serde(default, rename = "mcVersion")]
    pub mc_version: Option<String>,
    #[serde(default = "default_loader")]
    pub loader: String,
    #[serde(default, rename = "loaderVersion")]
    pub loader_version: Option<String>,
}

fn default_loader() -> String { "vanilla".to_string() }

/// Полная запись аккаунта в сторе. Соответствует структуре из
/// electron/services/accountsService.js — старый store.json читается
/// без миграции (включая `clientToken`, `refreshToken`, `expiresAt`).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AccountRecord {
    pub id: String,
    /// "offline" | "elyby"
    #[serde(default = "default_acc_type")]
    pub r#type: String,
    pub name: String,
    pub uuid: String,
    #[serde(default, rename = "accessToken")]
    pub access_token: Option<String>,
    #[serde(default, rename = "refreshToken")]
    pub refresh_token: Option<String>,
    #[serde(default, rename = "clientToken")]
    pub client_token: Option<String>,
    /// ms-timestamp; null для offline.
    #[serde(default, rename = "expiresAt")]
    pub expires_at: Option<i64>,
    #[serde(default, rename = "avatarUrl")]
    pub avatar_url: Option<String>,
    /// ISO-8601 (как и в Electron-версии).
    #[serde(default, rename = "addedAt")]
    pub added_at: Option<String>,
}

fn default_acc_type() -> String { "offline".to_string() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoreData {
    #[serde(default)]
    pub settings: Settings,
    #[serde(default, rename = "lastSelection")]
    pub last_selection: LastSelection,
    #[serde(default = "default_nickname", rename = "offlineNickname")]
    pub offline_nickname: String,
    /// id последнего выбранного инстанса. UI восстанавливает выделение
    /// между сессиями. None — никакой инстанс не выбран.
    #[serde(default, rename = "lastInstanceId")]
    pub last_instance_id: Option<String>,
    /// Список всех сохранённых аккаунтов (offline + elyby).
    #[serde(default)]
    pub accounts: Vec<AccountRecord>,
    /// id активного аккаунта. None — нет активного.
    #[serde(default, rename = "activeAccountId")]
    pub active_account_id: Option<String>,
}

fn default_nickname() -> String { "Player".to_string() }

impl Default for StoreData {
    fn default() -> Self {
        Self {
            settings: Settings::default(),
            last_selection: LastSelection { loader: default_loader(), ..Default::default() },
            offline_nickname: default_nickname(),
            last_instance_id: None,
            accounts: Vec::new(),
            active_account_id: None,
        }
    }
}

/// Внутреннее состояние стора. Прячем за RwLock — чтения дёшевы, записи редки.
struct StoreState {
    data: RwLock<StoreData>,
    file: PathBuf,
    flush_mutex: parking_lot::Mutex<()>,
}

static STORE: OnceLock<StoreState> = OnceLock::new();

fn state() -> &'static StoreState {
    STORE.get_or_init(|| {
        let file = get_roots().store_file.clone();
        let data = load_from_disk(&file).unwrap_or_default();
        StoreState { data: RwLock::new(data), file, flush_mutex: parking_lot::Mutex::new(()) }
    })
}

fn load_from_disk(file: &PathBuf) -> Option<StoreData> {
    let raw = fs::read_to_string(file).ok()?;
    // Толерантный парс: serde подставит default для отсутствующих полей.
    match serde_json::from_str::<StoreData>(&raw) {
        Ok(d) => Some(d),
        Err(e) => {
            // НЕЛЬЗЯ просто молча подменить дефолтом — это сотрёт юзеру
            // все аккаунты, инстансы и токены при первой же кривой
            // правке файла (или баге сериализации). Спасаем оригинал
            // в .corrupt-<ts> рядом — пользователь сможет восстановить
            // руками или прислать нам для диагностики.
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let backup = file.with_file_name(format!(
                "{}.corrupt-{}",
                file.file_name().map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_else(|| "store.json".to_string()),
                ts,
            ));
            let _ = fs::copy(file, &backup);
            tracing::error!(
                "store.json не парсится ({}), оригинал сохранён в {}",
                e,
                backup.display()
            );
            None
        }
    }
}

fn flush(state: &StoreState) {
    let _flush_guard = state.flush_mutex.lock();
    // Сериализуем под чтением — слепок согласованный, держим лок коротко.
    let snapshot: Value = {
        let guard = state.data.read();
        match serde_json::to_value(&*guard) {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!("flush: ошибка сериализации store: {}", e);
                return;
            }
        }
    };
    let body = serde_json::to_string_pretty(&snapshot).unwrap_or_else(|_| "{}".to_string());
    // Уникальное имя tmp-файла чтобы параллельные flush не перезаписывали друг друга.
    let tmp = state.file.with_extension(format!(
        "json.{}.tmp",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    if fs::write(&tmp, body).is_ok() {
        if let Err(e) = fs::rename(&tmp, &state.file) {
            tracing::warn!(
                "не удалось переименовать {} → {}: {}",
                tmp.display(),
                state.file.display(),
                e,
            );
            let _ = fs::remove_file(&tmp);
        }
    }
}

// --------------------------- публичный API (соответствует Electron-стору) ---

pub fn get_settings() -> Settings {
    state().data.read().settings.clone()
}

/// Аналог `setSettings(patch)`. На входе принимает произвольный JSON-объект,
/// чтобы фронту не пришлось знать про полные структуры — мерджит поля.
pub fn set_settings(patch: Value) -> Settings {
    let st = state();
    {
        let mut guard = st.data.write();
        let mut current = serde_json::to_value(&guard.settings).unwrap_or_default();
        merge(&mut current, patch);
        match serde_json::from_value::<Settings>(current) {
            Ok(parsed) => guard.settings = parsed,
            Err(e) => {
                tracing::warn!("set_settings: невалидный патч: {}", e);
                return guard.settings.clone();
            }
        }
    }
    flush(st);
    get_settings()
}

pub fn set_launcher_window_size(width: u32, height: u32) {
    if width < 820 || height < 560 {
        return;
    }
    let st = state();
    {
        let mut guard = st.data.write();
        guard.settings.launcher_window_width = width;
        guard.settings.launcher_window_height = height;
    }
    flush(st);
}

pub fn get_last_selection() -> LastSelection {
    state().data.read().last_selection.clone()
}

pub fn set_last_selection(patch: Value) -> LastSelection {
    let st = state();
    {
        let mut guard = st.data.write();
        let mut current = serde_json::to_value(&guard.last_selection).unwrap_or_default();
        merge(&mut current, patch);
        if let Ok(parsed) = serde_json::from_value::<LastSelection>(current) {
            guard.last_selection = parsed;
        }
    }
    flush(st);
    get_last_selection()
}

pub fn get_offline_nickname() -> String {
    let n = state().data.read().offline_nickname.clone();
    if n.trim().is_empty() { "Player".to_string() } else { n }
}

pub fn set_offline_nickname(name: String) -> String {
    let clean = {
        let t = name.trim();
        if t.is_empty() { "Player".to_string() } else { t.to_string() }
    };
    let st = state();
    st.data.write().offline_nickname = clean.clone();
    flush(st);
    clean
}

pub fn get_last_instance_id() -> Option<String> {
    state().data.read().last_instance_id.clone()
}

pub fn toggle_pinned_instance(id: &str) -> Vec<String> {
    let st = state();
    let pinned = {
        let mut guard = st.data.write();
        if let Some(pos) = guard.settings.pinned_instances.iter().position(|x| x == id) {
            guard.settings.pinned_instances.remove(pos);
        } else {
            guard.settings.pinned_instances.push(id.to_string());
        }
        guard.settings.pinned_instances.clone()
    };
    flush(st);
    pinned
}

pub fn get_pinned_instances() -> Vec<String> {
    state().data.read().settings.pinned_instances.clone()
}

/// Передаём `None` — значит «забыть» (например, после удаления инстанса).
pub fn set_last_instance_id(id: Option<String>) -> Option<String> {
    let st = state();
    st.data.write().last_instance_id = id.clone();
    flush(st);
    id
}

// ----------------------- accounts: низкоуровневые геттеры/сеттеры --------
// Публичный API (валидация, маскировка) живёт в accounts.rs; здесь — сырые операции под flush().

pub fn list_account_records() -> Vec<AccountRecord> {
    state().data.read().accounts.clone()
}

pub fn replace_accounts(list: Vec<AccountRecord>) {
    let st = state();
    st.data.write().accounts = list;
    flush(st);
}

pub fn get_active_account_id() -> Option<String> {
    state().data.read().active_account_id.clone()
}

pub fn set_active_account_id(id: Option<String>) -> Option<String> {
    let st = state();
    st.data.write().active_account_id = id.clone();
    flush(st);
    id
}

/// Глубокий merge объектов JSON: поля из `patch` затирают `target`,
/// вложенные объекты сливаются рекурсивно (как electron-store `set`).
fn merge(target: &mut Value, patch: Value) {
    match (target, patch) {
        (Value::Object(t_map), Value::Object(p_map)) => {
            for (k, v) in p_map {
                merge(t_map.entry(k).or_insert(Value::Null), v);
            }
        }
        (t, p) => { *t = p; }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_overwrites_top_level() {
        let mut target = serde_json::json!({"a": 1, "b": 2});
        let patch = serde_json::json!({"b": 99});
        merge(&mut target, patch);
        assert_eq!(target["a"], 1);
        assert_eq!(target["b"], 99);
    }

    #[test]
    fn merge_deep_nested() {
        let mut target = serde_json::json!({"settings": {"memory": 4, "theme": "dark"}});
        let patch = serde_json::json!({"settings": {"memory": 8}});
        merge(&mut target, patch);
        assert_eq!(target["settings"]["memory"], 8);
        assert_eq!(target["settings"]["theme"], "dark");
    }

    #[test]
    fn merge_adds_new_keys() {
        let mut target = serde_json::json!({"a": 1});
        let patch = serde_json::json!({"b": 2});
        merge(&mut target, patch);
        assert_eq!(target["a"], 1);
        assert_eq!(target["b"], 2);
    }

    #[test]
    fn merge_replaces_arrays_not_deep() {
        let mut target = serde_json::json!({"arr": [1, 2, 3]});
        let patch = serde_json::json!({"arr": [4, 5]});
        merge(&mut target, patch);
        assert_eq!(target["arr"], serde_json::json!([4, 5]));
    }

    #[test]
    fn settings_deserialize_full() {
        let json = r#"{
            "javaMemoryGb": 8,
            "versionFilters": {"release": true, "snapshot": true, "old_beta": false, "old_alpha": false},
            "mcWindowWidth": 1920,
            "mcWindowHeight": 1080,
            "autoOpenLogs": true,
            "gcType": "zgc",
            "extraJvmArgs": "-Xmx2g",
            "launcherWindowWidth": 1024,
            "launcherWindowHeight": 768,
            "instancesSort": "name",
            "themeId": "light",
            "pinnedInstances": ["a", "b"],
            "sidebarCollapsed": true,
            "onboardingCompleted": true
        }"#;
        let s: Settings = serde_json::from_str(json).unwrap();
        assert_eq!(s.java_memory_gb, 8);
        assert!(s.version_filters.snapshot);
        assert_eq!(s.mc_window_width, 1920);
        assert!(s.auto_open_logs);
        assert_eq!(s.gc_type, "zgc");
        assert_eq!(s.extra_jvm_args, "-Xmx2g");
        assert_eq!(s.launcher_window_width, 1024);
        assert_eq!(s.instances_sort, "name");
        assert_eq!(s.theme_id, "light");
        assert_eq!(s.pinned_instances, vec!["a", "b"]);
        assert!(s.sidebar_collapsed);
        assert!(s.onboarding_completed);
    }

    #[test]
    fn settings_defaults_on_missing_fields() {
        let json = "{}";
        let s: Settings = serde_json::from_str(json).unwrap();
        assert_eq!(s.java_memory_gb, 4);
        assert!(s.version_filters.release);
        assert!(!s.version_filters.snapshot);
        assert_eq!(s.mc_window_width, 854);
        assert_eq!(s.mc_window_height, 480);
        assert!(!s.auto_open_logs);
        assert_eq!(s.gc_type, "default");
        assert!(s.extra_jvm_args.is_empty());
        assert_eq!(s.launcher_window_width, 920);
        assert_eq!(s.launcher_window_height, 620);
        assert_eq!(s.instances_sort, "recent");
        assert_eq!(s.theme_id, "dark");
        assert!(s.pinned_instances.is_empty());
        assert!(!s.sidebar_collapsed);
        assert!(!s.onboarding_completed);
    }

    #[test]
    fn settings_partial_override() {
        let json = r#"{"javaMemoryGb": 16, "autoOpenLogs": true}"#;
        let s: Settings = serde_json::from_str(json).unwrap();
        assert_eq!(s.java_memory_gb, 16);
        assert!(s.auto_open_logs);
        assert_eq!(s.mc_window_width, 854);
    }

    #[test]
    fn last_selection_defaults() {
        let json = "{}";
        let s: LastSelection = serde_json::from_str(json).unwrap();
        assert_eq!(s.loader, "vanilla");
        assert!(s.mc_version.is_none());
        assert!(s.loader_version.is_none());
    }

    #[test]
    fn store_data_defaults() {
        let json = "{}";
        let s: StoreData = serde_json::from_str(json).unwrap();
        assert_eq!(s.offline_nickname, "Player");
        assert!(s.last_instance_id.is_none());
        assert!(s.accounts.is_empty());
        assert!(s.active_account_id.is_none());
    }
}
