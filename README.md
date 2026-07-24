# Poshat Launcher

Minecraft-лаунчер на Tauri 2 (Rust + React). Поддерживает Fabric, Forge, NeoForge, Quilt, Vanilla.

**Версия:** 0.1.2  
**Лицензия:** Закрытая (временно)

## Возможности

- Автономные инстансы (каждый со своей папкой mods/saves)
- Установка Minecraft, библиотек, ассетов через lyceris
- Каталог модов/шейдеров/ресурспаков (Modrinth)
- Мультиаккаунт (оффлайн + Ely.by)
- Автообновление
- Экспорт/импорт сборок (.mrpack)
- Ярлыки на рабочем столе

## Требования

- Node.js 20+
- Rust stable
- Windows: WebView2 (обычно уже установлен)
- Linux: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`

## Разработка

```bash
npm install
npx tauri dev
```

## Сборка

```bash
npm run build
npx tauri build
```

## Тесты

```bash
# Rust (unit tests)
cd src-tauri && cargo test --lib

# Frontend (Vitest)
npm run test

# Clippy
cd src-tauri && cargo clippy --lib -- -D warnings
```

## Структура проекта

```
src-tauri/src/
├── main.rs           # Точка входа
├── lib.rs            # Tauri Builder + команды
├── accounts.rs       # Аккаунты (offline + elyby)
├── catalog.rs        # Каталог Modrinth
├── elyby.rs          # Авторизация Ely.by
├── http.rs           # HTTP-клиент (reqwest + rustls)
├── instances.rs      # Инстансы (CRUD, иконки, обложки)
├── java.rs           # Java-детект (Mojang runtime)
├── launch.rs         # Запуск Minecraft
├── loaders.rs        # Версии загрузчиков (Fabric/Forge/...)
├── mc_install.rs     # Установка клиента
├── paths.rs          # Директории (%APPDATA%/.poshatlauncher/)
├── security.rs       # Анти-отладка (Windows)
├── store.rs          # Конфиг (store.json)
└── versions.rs       # Версии Minecraft

src/
├── api/poshatAPI.ts  # Шим window.poshatAPI → Tauri invoke
├── app/page.jsx      # Главный layout
├── components/       # UI-компоненты
├── data/             # Статические данные
├── hooks/            # React-хуки
└── utils/            # Утилиты
```

## Лицензия

Закрытая. Временно.
