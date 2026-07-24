#![windows_subsystem = "windows"]

fn main() {
    // Тонкая обёртка: реальная логика (Builder, команды, security::init) в lib.rs.
    poshat_launcher_rust_lib::run()
}
