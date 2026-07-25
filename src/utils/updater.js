/**
 * Автообновление лаунчера через tauri-plugin-updater.
 *
 * Сценарий:
 *   1. При старте лаунчера (через 3 сек) тихо проверяем наличие обновления.
 *   2. Если обновление есть — показываем confirm-диалог «Доступна новая
 *      версия v0.2.0. Обновить?» с кнопками «Обновить» / «Позже».
 *   3. При подтверждении — качаем и устанавливаем в passive-режиме
 *      (перезапуск автоматический после установки).
 *   4. Прогресс виден через тосты.
 *   5. Если обновиться нельзя (сеть/подпись/404) — тихо логируем, не мешаем.
 *
 * ВАЖНО: updater требует подписанные release-артефакты (.msi/.nsis + .sig),
 * собранные с TAURI_SIGNING_PRIVATE_KEY. Без них check() вернёт 404/ошибку
 * — это нормально для dev-сборок.
 */
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

let checkedOnce = false;

/**
 * Запускает фоновую проверку обновлений.
 * Возвращает функцию отмены — вызвать для очистки таймера при unmount.
 *
 * @param {object} toast
 * @param {function} confirm
 * @returns {function} cleanup — вызвать при unmount
 */
export function checkForUpdatesOnStartup(toast, confirm) {
  if (checkedOnce) return () => {};
  checkedOnce = true;

  let cancelled = false;
  const timerId = setTimeout(async () => {
    if (cancelled) return;
    try {
      if (typeof check !== "function") return;
      const update = await check();
      if (cancelled || !update?.available) return;

      const version = update.version || "новая версия";
      const ok = await confirm({
        title: `Доступно обновление: ${version}`,
        message:
          "Лаунчер может обновиться автоматически.\nТекущая сессия будет перезапущена после установки.",
        confirmLabel: "Обновить",
        cancelLabel: "Позже",
      });

      if (cancelled || !ok) return;

      await downloadAndInstall(update, toast);
    } catch (e) {
      if (!cancelled) {
        console.info("[updater] проверка недоступна:", e?.message || e);
      }
    }
  }, 3000);

  return () => {
    cancelled = true;
    clearTimeout(timerId);
  };
}

/**
 * Скачивает и устанавливает обновление.
 * Показывает прогресс через тосты.
 */
async function downloadAndInstall(update, toast) {
  let contentLength = 0;
  let downloaded = 0;
  let lastPct = -1;

  try {
    let busyId = toast.busy("Скачивание обновления…");

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          contentLength = event.data.contentLength || 0;
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            const pct = Math.round((downloaded / contentLength) * 100);
            if (pct !== lastPct && pct % 5 === 0) {
              lastPct = pct;
              toast.dismiss(busyId);
              busyId = toast.busy(`Скачивание обновления… ${pct}%`);
            }
          }
          break;
        case "Finished":
          toast.dismiss(busyId);
          toast.info("Установка обновления…");
          break;
      }
    });

    toast.ok("Обновление установлено. Перезапуск…");
    await relaunch();
  } catch (e) {
    const msg = e?.message || String(e);
    console.error("[updater] ошибка установки:", msg);
    toast.err(`Не удалось обновить: ${msg}`);
  }
}
