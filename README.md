<div align="center">

<img src="poshat-logo.png" alt="Poshat Launcher" width="200" />

# Poshat Launcher

**Современный лаунчер Minecraft, созданный с вниманием к деталям.**

[![Version](https://img.shields.io/badge/version-0.1.3-blue)](https://github.com/docilan/Poshat-Launcher/releases)
[![License](https://img.shields.io/badge/license-closed-red)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey)]()
[![Rust](https://img.shields.io/badge/built%20with-Rust-orange)]()
[![React](https://img.shields.io/badge/built%20with-React-61DAFB)]()

<br/>

[**Скачать**](https://github.com/docilan/Poshat-Launcher/releases/latest) · [**Сообщить об ошибке**](https://github.com/docilan/Poshat-Launcher/issues/new?template=bug_report.md) · [**Предложить идею**](https://github.com/docilan/Poshat-Launcher/issues/new?template=feature_request.md)

</div>

---

## Почему Poshat Launcher?

> Мы создали Poshat Launcher, потому что хотели лаунчер, который **выглядит современно**, работает **быстро** и **не перегружен** лишним.

- **Мгновенный запуск** — Rust на бэкенде, нативная сборка через Tauri 2. Никакого Electron.
- **Полная изоляция инстансов** — каждый мир в своей папке. Моды, сейвы, ресурспаки — ничего не смешивается.
- **Каталог Modrinth** — установка модов, шейдеров и ресурспаков в пару кликов.
- **Экспорт и импорт** — делись своими сборками через стандарт `.mrpack`.
- **Мультиаккаунт** — оффлайн и [Ely.by](https://ely.by) из коробки.

---

## Ключевые возможности

<table>
<tr>
<td width="50%">

### Управление инстансами
- Создание, переименование, удаление
- Собственные обложки для каждого инстанса
- Ярлыки на рабочем столе
- Полная информация о размере на диске

</td>
<td width="50%">

### Поддержка загрузчиков
- Fabric
- Forge
- NeoForge
- Quilt
- Vanilla

</td>
</tr>
<tr>
<td>

### Каталог контента
- Моды с фильтрацией по версии
- Шейдерпаки
- Ресурспаки
- Установка одним кликом

</td>
<td>

### Под account'ами
- Оффлайн-аккаунты
- Авторизация через Ely.by
- Мультиаккаунт
- Быстрое переключение

</td>
</tr>
</table>

---

## Технологический стек

| Слой | Технологии |
|------|-----------|
| **Бэкенд** | Rust, Tauri 2, reqwest, serde |
| **Фронтенд** | React 19, Vite 7, Tailwind CSS 3 |
| **Сборка** | NSIS (Windows), `.deb` / AppImage (Linux) |
| **API** | [Modrinth API](https://docs.modrinth.com/) |
| **Безопасность** | Обфускация бандла, CSP-политики, анти-отладка |

---

## Скачать

Зайдите на страницу [**Releases**](https://github.com/docilan/Poshat-Launcher/releases/latest) и скачайте установщик для вашей платформы:

| Платформа | Формат | |
|-----------|--------|-|
| **Windows x64** | NSIS Installer (.exe) | [Скачать](https://github.com/docilan/Poshat-Launcher/releases/latest) |
| **Windows x64** | Portable (.zip) | [Скачать](https://github.com/docilan/Poshat-Launcher/releases/latest) |
| **Linux x64** | `.deb` / AppImage | Скоро |

---

## Разработка

### Требования

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) stable
- **Windows:** WebView2 (установлен по умолчанию в Windows 10/11)
- **Linux:**

```bash
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev libgtk-3-dev libayatana-appindicator3-dev
```

### Запуск в dev-режиме

```bash
git clone https://github.com/docilan/Poshat-Launcher.git
cd Poshat-Launcher
npm install
npx tauri dev
```

### Сборка

```bash
npm run build
npx tauri build
```

Результат: `src-tauri/target/release/bundle/`

---

## Структура проекта

```
src-tauri/src/           # Rust-бэкенд
├── lib.rs               # Tauri Builder + IPC-команды
├── instances.rs         # CRUD инстансов, экспорт/импорт
├── launch.rs            # Запуск Minecraft
├── mc_install.rs        # Установка клиента
├── catalog.rs           # Modrinth API
├── accounts.rs          # Аккаунты
├── java.rs              # Java-детект
├── loaders.rs           # Загрузчики (Fabric/Forge/...)
├── http.rs              # HTTP-клиент
├── paths.rs             # Директории приложения
├── security.rs          # Анти-отладка
├── store.rs             # Конфигурация
└── versions.rs          # Версии Minecraft

src/                     # React-фронтенд
├── api/poshatAPI.ts     # IPC-мост → Tauri invoke
├── app/page.jsx         # Главный layout
├── components/          # UI-компоненты
├── hooks/               # React-хуки
└── utils/               # Утилиты
```

---

## Тесты

```bash
# Rust unit tests
cd src-tauri && cargo test --lib

# Frontend (Vitest)
npm run test

# Clippy (lint)
cd src-tauri && cargo clippy --lib -- -D warnings
```

---

## Лицензия

Проект находится под закрытой лицензией. Использование и распространение без разрешения автора запрещены.

---

<div align="center">

**Сделано с заботой о деталях.**

</div>
