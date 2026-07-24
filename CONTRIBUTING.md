# Contributing

Проект временно закрыт. Публичный контрибьютинг пока не принимается.

## Как запустить локально

```bash
git clone <repo-url>
cd poshat-launcher-rust
npm install
npx tauri dev
```

## Код-стайл

### Rust
- `cargo clippy --lib -- -D warnings` должен быть чистым
- Русские комментарии в коде (как в Electron-версии)
- Анти-отладка только в release (`#[cfg(not(debug_assertions))]`)

### Frontend
- TypeScript strict mode
- Tailwind CSS для стилей
- Lucide React для иконок
- Никаких `console.log` в production-коде
