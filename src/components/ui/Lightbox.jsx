// Просмотрщик картинок поверх лаунчера. Открывается из галереи мода и
// из описания (клик по img в MarkdownView). Не уходит в браузер — иначе
// в Tauri-вебвью пользователь застрянет на странице картинки без «назад».
//
// Управление: ← → между картинками, Esc закрывает, клик по фону тоже.

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * Открывается, если `items` непустой массив { url, title }.
 * `startIndex` — какой кадр показать первым.
 */
export function Lightbox({ items, startIndex = 0, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);

  // Перематываем индекс если родитель передал новый стартовый.
  useEffect(() => {
    setIdx(startIndex);
    setLoading(true);
  }, [startIndex, items]);

  const goPrev = useCallback(() => {
    if (!items?.length) return;
    setIdx((i) => (i - 1 + items.length) % items.length);
    setLoading(true);
  }, [items]);

  const goNext = useCallback(() => {
    if (!items?.length) return;
    setIdx((i) => (i + 1) % items.length);
    setLoading(true);
  }, [items]);

  useEffect(() => {
    if (!items?.length) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [items, onClose, goPrev, goNext]);

  if (!items?.length) return null;
  if (idx < 0 || idx >= items.length) return null;
  const current = items[idx];
  if (!current) return null;

  return (
    <div
      ref={containerRef}
      className="theme-force-dark fixed inset-0 z-[120] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      {/* Затемнение. Клик закрывает. */}
      <div
        className="absolute inset-0 bg-black/82 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Верхний правый угол: счётчик + крестик */}
      <div className="absolute right-5 top-5 z-10 flex items-center gap-2">
        <span className="rounded-full bg-white/8 px-3 py-1 text-[11px] font-semibold text-zinc-200 backdrop-blur">
          {idx + 1} / {items.length}
        </span>
        <button
          onClick={onClose}
          className="rounded-full bg-white/8 p-2 text-zinc-200 backdrop-blur transition hover:bg-white/16 hover:text-white"
          aria-label="Закрыть"
        >
          <X size={16} />
        </button>
      </div>

      {/* Левая стрелка */}
      {items.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className="absolute left-5 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/15 bg-black/40 p-3 text-zinc-100 backdrop-blur transition hover:bg-white/15 hover:text-white"
          aria-label="Назад"
        >
          <ChevronLeft size={20} />
        </button>
      )}

      {/* Картинка */}
      <div
        className="relative z-0 flex max-h-[92vh] max-w-[92vw] items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-violet-300" />
          </div>
        )}
        <img
          key={current.url}
          src={current.url}
          alt={current.title || ""}
          className={`max-h-[92vh] max-w-[92vw] rounded-2xl shadow-[0_60px_180px_rgba(0,0,0,0.65)] transition-opacity ${
            loading ? "opacity-0" : "opacity-100"
          }`}
          referrerPolicy="no-referrer"
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
        {current.title && (
          <p className="absolute bottom-[-2.4rem] left-1/2 max-w-[80vw] -translate-x-1/2 truncate rounded-full bg-black/55 px-4 py-1.5 text-[12px] text-zinc-100 backdrop-blur">
            {current.title}
          </p>
        )}
      </div>

      {/* Правая стрелка */}
      {items.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="absolute right-5 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/15 bg-black/40 p-3 text-zinc-100 backdrop-blur transition hover:bg-white/15 hover:text-white"
          aria-label="Вперёд"
        >
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  );
}
