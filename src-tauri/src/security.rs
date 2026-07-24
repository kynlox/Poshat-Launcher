// Анти-отладочный слой. Активен ТОЛЬКО в release-сборке (в dev выключен, иначе не отладить).
//
// Почему именно эти WinAPI:
//   - IsDebuggerPresent читает флаг BeingDebugged из PEB — дёшево, но
//     ломается, если кто-то патчит PEB (стандартный анти-анти-дебаг).
//   - CheckRemoteDebuggerPresent делает NtQueryInformationProcess(DebugPort) —
//     ловит дебаггер, который патчил PEB. Гораздо труднее обойти.
//
// На macOS/Linux компилируется в no-op.

// allow(dead_code) — в debug-сборке init() пуст и эти функции не вызываются.
// В release сразу подтягиваются.
#[cfg(target_os = "windows")]
#[allow(dead_code)]
extern "system" {
    fn IsDebuggerPresent() -> i32;
    fn CheckRemoteDebuggerPresent(handle: usize, present: *mut i32) -> i32;
    fn GetCurrentProcess() -> usize;
}

#[cfg(target_os = "windows")]
#[allow(dead_code)]
fn debugger_attached() -> bool {
    unsafe {
        if IsDebuggerPresent() != 0 {
            return true;
        }
        let mut present: i32 = 0;
        let _ = CheckRemoteDebuggerPresent(GetCurrentProcess(), &mut present);
        present != 0
    }
}

#[cfg(not(target_os = "windows"))]
fn debugger_attached() -> bool {
    false
}

/// Стартовая проверка + запуск фонового мониторинга. Зовём один раз
/// в самом начале `run()`, ДО tauri::Builder.
pub fn init() {
    // В dev-сборке всё это выключаем — иначе IDE/принтер отладки сломает разработку.
    #[cfg(not(debug_assertions))]
    {
        if debugger_attached() {
            // Молча. Без сообщения, без логов — чтобы реверсер не понял,
            // что именно его триггернуло.
            std::process::exit(0xDEAD);
        }
        std::thread::spawn(|| loop {
            std::thread::sleep(std::time::Duration::from_secs(5));
            if debugger_attached() {
                std::process::exit(0xDEAD);
            }
        });
    }
}
