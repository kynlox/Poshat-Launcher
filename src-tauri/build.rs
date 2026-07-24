fn main() {
    // Перекомпилировать (читай: переслинковать с новым resource'ом) при любом
    // изменении иконок. По умолчанию tauri-build их не трекает, поэтому замена
    // icon.ico/PNG-ов без правок Rust-кода не вызывала пересборку exe и в
    // таскбаре Windows оставалась старая «вшитая» иконка.
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.png");
    println!("cargo:rerun-if-changed=icons/32x32.png");
    println!("cargo:rerun-if-changed=icons/128x128.png");
    println!("cargo:rerun-if-changed=icons/128x128@2x.png");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    tauri_build::build()
}
