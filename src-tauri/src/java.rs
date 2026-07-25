// Java: детект и резолв runtime-манифеста Mojang. Установка (закачка, sha1, lzma)
// уедет в Phase 3b (installService). Контракт пар «major → runtime target»
// (gamma/delta/epsilon/...) чувствителен: путаница имён даёт
// `UnsupportedClassVersionError` — сохраняем 1-в-1 с JS-версией.

// Модуль заморожен: lyceris сам тянет Java-рантайм. Держим код на будущее.
#![allow(dead_code)]

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::http::{fetch_json_resilient, FetchOpts};
use crate::paths::{get_roots, java_dir_for};

// URL Mojang (как в JS-версии). Хэш `2ec0cc...` — указатель на ревизию манифеста
// (Mojang меняет его при добавлении runtime'ов). Менять только осознанно,
// иначе сломаем детект новых Java.
const JAVA_RUNTIME_MANIFEST_URLS: &[&str] = &[
    "https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json",
    "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaInfo {
    /// Полный путь к javaw.exe (Windows) / java (другие платформы).
    #[serde(rename = "javaPath")]
    pub java_path: String,
    /// Мажорная версия, которую запросили (НЕ та, что у бинарника).
    /// Мы ставим Java под конкретный major; точный мажор бинарника
    /// можно вытащить через `java -version`, но пока не нужно.
    #[serde(rename = "majorVersion")]
    pub major_version: u32,
}

fn java_exe_name() -> &'static str {
    if cfg!(target_os = "windows") { "javaw.exe" } else { "java" }
}

/// Рекурсивный поиск javaw.exe (или java). Валиден только файл ненулевого размера —
/// пустые «заглушки» установщиков роняют Minecraft молча.
pub fn find_java_exe(root_dir: &Path) -> Option<PathBuf> {
    if !root_dir.exists() {
        return None;
    }
    let needle = java_exe_name().to_ascii_lowercase();
    let mut stack: Vec<PathBuf> = vec![root_dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                stack.push(path);
            } else if ft.is_file() {
                let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                if name == needle {
                    if let Ok(meta) = entry.metadata() {
                        if meta.len() > 0 {
                            return Some(path);
                        }
                    }
                }
            }
        }
    }
    None
}

/// `major → имя Mojang-runtime target`. Жёстко соответствует JS-версии.
/// Любая замена ломает совместимость классов (gamma/delta).
pub fn pick_runtime_target(major: u32) -> &'static str {
    if major >= 25 { "java-runtime-epsilon" }
    else if major >= 21 { "java-runtime-delta" }
    else if major >= 17 { "java-runtime-gamma" }
    else if major >= 16 { "java-runtime-alpha" }
    else { "jre-legacy" }
}

/// Платформенный ключ в Mojang manifest. Кросс-платформенная логика
/// оставлена для будущего, по факту лаунчер Windows-only.
pub fn pick_platform_key() -> &'static str {
    if cfg!(target_os = "windows") {
        if cfg!(target_arch = "aarch64") { "windows-arm64" }
        else if cfg!(target_arch = "x86") { "windows-x86" }
        else { "windows-x64" }
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") { "mac-os-arm64" } else { "mac-os" }
    } else {
        if cfg!(target_arch = "x86") { "linux-i386" } else { "linux" }
    }
}

/// Bundled Java — то, что лежит рядом с приложением. В Tauri 2 такой папки пока нет
/// (была в Electron через extraResources); ищем в `<root>/runtime` для совместимости
/// с возможным будущим extraResources и для тех, кто распакует JRE заранее.
pub fn find_bundled_java() -> Option<PathBuf> {
    let runtime = &get_roots().runtime;
    if !runtime.exists() {
        return None;
    }
    let Ok(entries) = std::fs::read_dir(runtime) else { return None };
    for entry in entries.flatten() {
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            if let Some(exe) = find_java_exe(&entry.path()) {
                return Some(exe);
            }
        }
    }
    None
}

/// Ищет доступную Java для запрошенного major: bundled → ранее установленная.
/// Без сетевых запросов — «дешёвый» детект. `None` = Java надо ставить (Phase 3b).
pub fn find_existing_java(major: u32) -> Option<JavaInfo> {
    if let Some(p) = find_bundled_java() {
        return Some(JavaInfo {
            java_path: p.to_string_lossy().into_owned(),
            major_version: major,
        });
    }
    let dest = java_dir_for(major);
    if let Some(p) = find_java_exe(&dest) {
        return Some(JavaInfo {
            java_path: p.to_string_lossy().into_owned(),
            major_version: major,
        });
    }
    None
}

/// Скачивает Mojang `all.json` (список таргетов по платформам) и подманифест
/// версии (список файлов и хэшей). Подманифест понадобится в Phase 3b.
pub async fn resolve_runtime_manifest(major: u32) -> Result<Value, String> {
    let target = pick_runtime_target(major);
    let platform_key = pick_platform_key();
    let all = fetch_json_resilient(JAVA_RUNTIME_MANIFEST_URLS, &FetchOpts::default()).await?;

    let platform_block = all
        .get(platform_key)
        .ok_or_else(|| format!("Платформы {} нет в java-runtime манифесте", platform_key))?;

    // Сначала пробуем запрошенный target, потом fallback на jre-legacy.
    let manifest_url = pick_manifest_url(platform_block, target)
        .or_else(|| pick_manifest_url(platform_block, "jre-legacy"))
        .ok_or_else(|| format!(
            "Java runtime '{}' недоступен для платформы '{}'",
            target, platform_key
        ))?;

    let sub = fetch_json_resilient(&[manifest_url.as_str()], &FetchOpts::default()).await?;
    Ok(sub)
}

fn pick_manifest_url(platform_block: &Value, target: &str) -> Option<String> {
    let arr = platform_block.get(target)?.as_array()?;
    let first = arr.first()?;
    first.get("manifest")?.get("url")?.as_str().map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn pick_runtime_target_java8() {
        assert_eq!(pick_runtime_target(8), "jre-legacy");
    }

    #[test]
    fn pick_runtime_target_java16() {
        assert_eq!(pick_runtime_target(16), "java-runtime-alpha");
    }

    #[test]
    fn pick_runtime_target_java17() {
        assert_eq!(pick_runtime_target(17), "java-runtime-gamma");
    }

    #[test]
    fn pick_runtime_target_java21() {
        assert_eq!(pick_runtime_target(21), "java-runtime-delta");
    }

    #[test]
    fn pick_runtime_target_java25() {
        assert_eq!(pick_runtime_target(25), "java-runtime-epsilon");
    }

    #[test]
    fn pick_runtime_target_java11() {
        assert_eq!(pick_runtime_target(11), "jre-legacy");
    }

    #[test]
    fn pick_runtime_target_java20() {
        assert_eq!(pick_runtime_target(20), "java-runtime-gamma");
    }

    #[test]
    fn pick_runtime_target_java24() {
        assert_eq!(pick_runtime_target(24), "java-runtime-delta");
    }

    #[test]
    fn pick_runtime_target_java99() {
        assert_eq!(pick_runtime_target(99), "java-runtime-epsilon");
    }

    #[test]
    fn pick_runtime_target_java1() {
        assert_eq!(pick_runtime_target(1), "jre-legacy");
    }

    #[test]
    fn pick_platform_key_windows_x64() {
        if cfg!(target_os = "windows") && cfg!(target_arch = "x86_64") {
            assert_eq!(pick_platform_key(), "windows-x64");
        }
    }

    #[test]
    fn java_exe_name_format() {
        let name = java_exe_name();
        if cfg!(target_os = "windows") {
            assert_eq!(name, "javaw.exe");
        } else {
            assert_eq!(name, "java");
        }
    }

    #[test]
    fn find_java_exe_nonexistent_dir() {
        let result = find_java_exe(Path::new("/nonexistent/path/xyz"));
        assert!(result.is_none());
    }

    #[test]
    fn pick_manifest_url_valid() {
        let block = json!({
            "java-runtime-gamma": [
                { "manifest": { "url": "https://example.com/gamma.json" } }
            ]
        });
        let url = pick_manifest_url(&block, "java-runtime-gamma");
        assert_eq!(url.as_deref(), Some("https://example.com/gamma.json"));
    }

    #[test]
    fn pick_manifest_url_missing_target() {
        let block = json!({
            "java-runtime-gamma": [
                { "manifest": { "url": "https://example.com/gamma.json" } }
            ]
        });
        assert!(pick_manifest_url(&block, "java-runtime-delta").is_none());
    }

    #[test]
    fn pick_manifest_url_empty_array() {
        let block = json!({
            "java-runtime-gamma": []
        });
        assert!(pick_manifest_url(&block, "java-runtime-gamma").is_none());
    }

    #[test]
    fn pick_manifest_url_no_manifest_key() {
        let block = json!({
            "java-runtime-gamma": [
                { "other": "data" }
            ]
        });
        assert!(pick_manifest_url(&block, "java-runtime-gamma").is_none());
    }

    #[test]
    fn java_info_serialization() {
        let info = JavaInfo {
            java_path: "/usr/bin/java".into(),
            major_version: 17,
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("javaPath"));
        assert!(json.contains("majorVersion"));
        assert!(json.contains("17"));
    }
}
