# Security Policy

## Reporting a Vulnerability

Если вы нашли уязвимость, пожалуйста, сообщите нам напрямую через email:

**TODO: добавить email**

Не публикуйте уязвимость публично до исправления.

## Что мы проверяем

- Path traversal атаки (инстансы, инпуты)
- Анти-отладка (только Windows release)
- CSP политика
- Подпись обновлений (Tauri signing)

## Scope

- Laунчер (Tauri app)
- Rust бэкенд
- React фронтенд

Не в scope: серверная часть Modrinth/Ely.by (сторонние сервисы).
