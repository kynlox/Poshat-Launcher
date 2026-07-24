// Корни лаунчера на диске (%APPDATA%/.poshatlauncher/), структура повторяет Electron-порт.
// Путь намеренно разделён с Electron: пока миграция идёт параллельно, юзер видит инстансы в обеих сборках.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use directories::BaseDirs;

#[derive(Debug, Clone)]
pub struct Roots {
    pub root: PathBuf,
    pub instances: PathBuf,
    pub shared: PathBuf,
    pub runtime: PathBuf,
    pub java: PathBuf,
    pub store_file: PathBuf,
}

static ROOTS: OnceLock<Roots> = OnceLock::new();

/// `fs::create_dir_all` плюс возврат самого пути — чтобы цепочки в стиле
/// `ensure_dir(path).join("...")` работали как в JS.
pub fn ensure_dir<P: AsRef<Path>>(dir: P) -> PathBuf {
    let p = dir.as_ref().to_path_buf();
    // Игнорируем ошибку «уже существует» — fs::create_dir_all сам её не вернёт,
    // но другие IO-ошибки тоже не паникуем: пусть упадёт первый, кто реально
    // полезет писать. Это поведение совпадает с Node-версией.
    let _ = std::fs::create_dir_all(&p);
    p
}

/// Главный getter. Возвращает один и тот же объект на всю жизнь процесса.
pub fn get_roots() -> &'static Roots {
    ROOTS.get_or_init(|| {
        let base = BaseDirs::new()
            .expect("Не удалось определить домашний каталог пользователя");
        // На Windows BaseDirs::config_dir() == %APPDATA% (Roaming) — то же,
        // что `app.getPath('appData')` в Electron.
        let root = base.config_dir().join(".poshatlauncher");
        let runtime = root.join("runtime");
        let java = runtime.join("java");
        Roots {
            instances: ensure_dir(root.join("instances")),
            shared: ensure_dir(root.join("shared")),
            runtime: ensure_dir(&runtime),
            java: ensure_dir(&java),
            store_file: root.join("store.json"),
            root: ensure_dir(&root),
        }
    })
}

/// Папка под конкретный мажор Java-рантайма (8, 17, 21, 25, ...).
/// Пока не используется: lyceris сам определяет, куда положить рантайм.
#[allow(dead_code)]
pub fn java_dir_for(major: u32) -> PathBuf {
    let roots = get_roots();
    ensure_dir(roots.java.join(major.to_string()))
}
