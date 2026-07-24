// Унифицированный рендер описаний модов под стиль лаунчера.
//
// Вход:
//   <MarkdownView md="...">    — Modrinth отдаёт markdown в `body`
//   <MarkdownView html="...">  — на случай, если в будущем подключим источник,
//                                отдающий готовый HTML; сейчас не используется.
//
// Что делаем:
//   1) markdown → HTML через `marked`. GFM включаем (таблицы, code fences).
//   2) Чистим через DOMPurify — модерация Modrinth всё-таки не гарантирует,
//      что в описании не пролезет `<script>` или onerror=...
//      Лаунчер живёт в Tauri-вебвью с доступом к window.poshatAPI — XSS тут
//      означает доступ ко всем командам бэка.
//   3) Картинки → отлавливаем клики, передаём наверх через onImageClick,
//      чтобы открыть lightbox внутри лаунчера, а не в браузере.
//   4) Внешние ссылки открываем через tauri-opener, не в текущем окне —
//      иначе вебвью уйдёт со страницы лаунчера навсегда (в Tauri нет
//      «назад», как у браузера).

import { useEffect, useMemo, useRef } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { openUrl } from "@tauri-apps/plugin-opener";

// Настройка marked один раз на жизнь модуля — но защищённо. Vite HMR
// может перезагружать модуль; setOptions идемпотентен, addHook — нет.
// Чтобы хук не добавлялся дважды (тогда target=_blank ставился бы 2 раза
// и т. п.), регистрируем под флагом на самом DOMPurify.
let _initDone = false;
function ensureInit() {
  if (_initDone) return;
  _initDone = true;
  try {
    marked.setOptions({ gfm: true, breaks: false });
  } catch {
    /* старые версии могут не иметь setOptions — игнорим */
  }
  try {
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node && node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    });
  } catch {
    /* если DOMPurify не доинициализирован — пропустим, не ломая UI */
  }
}

function renderToHtml({ md, html }) {
  if (html) return html;
  if (!md) return "";
  try {
    const out = marked.parse(md);
    // marked.parse в стандартном режиме возвращает строку; если кто-то
    // переключил async — это будет Promise. Защищаемся.
    return typeof out === "string" ? out : "";
  } catch {
    // На случай совсем экзотического входа — отдаём как plain-текст в <pre>.
    return `<pre>${md.replace(/[<>&]/g, (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]),
    )}</pre>`;
  }
}

export function MarkdownView({ md, html, onImageClick }) {
  // Ленивая инициализация — гарантированно после того, как браузерный
  // DOM прогружен; снимает риск падения при ранней статической оценке.
  ensureInit();

  const rootRef = useRef(null);
  const rawHtml = useMemo(() => renderToHtml({ md, html }), [md, html]);
  const clean = useMemo(() => {
    try {
      return DOMPurify.sanitize(rawHtml, {
        // Запрещаем формы / iframe / object — в описании мода им делать нечего.
        FORBID_TAGS: ["form", "iframe", "object", "embed", "input", "button"],
        FORBID_ATTR: ["onload", "onclick", "onerror", "onmouseover"],
        ALLOW_DATA_ATTR: false,
      });
    } catch {
      // Если санитайзер сломался — лучше показать «—», чем сырой HTML.
      return "";
    }
  }, [rawHtml]);

  // Перехватчики кликов: картинки → lightbox, ссылки → внешний opener.
  // Делаем единым делегатом на корне, чтобы не вешать onClick на каждый
  // элемент после dangerouslySetInnerHTML.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onClick = (e) => {
      const a = e.target.closest("a[href]");
      if (a) {
        e.preventDefault();
        const href = a.getAttribute("href");
        if (!href) return;
        // Якорные ссылки внутри страницы (`#anchor`) — игнорируем, но
        // вебвью всё равно их не найдёт, так что просто молча гасим.
        if (href.startsWith("#")) return;
        openUrl(href).catch(() => {
          /* opener не сработал — fail silently, alert тут лишний */
        });
        return;
      }
      const img = e.target.closest("img");
      if (img && onImageClick) {
        e.preventDefault();
        const all = Array.from(root.querySelectorAll("img"))
          .filter((el) => el.getAttribute("src"))
          .map((el) => ({
            url: el.getAttribute("src"),
            title: el.getAttribute("alt") || "",
          }));
        const idx = all.findIndex((x) => x.url === img.getAttribute("src"));
        onImageClick({ items: all, startIndex: Math.max(0, idx) });
      }
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [clean, onImageClick]);

  return (
    <div
      ref={rootRef}
      className="prose-launcher max-w-none text-[13.5px] leading-relaxed text-zinc-200"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
