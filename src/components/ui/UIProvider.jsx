// Глобальный провайдер UI-нотификаций: тосты + модальные confirm-диалоги.
//
// Заменяет нативные `alert()` / `confirm()` (которые в Tauri/браузере рисуются
// системно с заголовком «localhost:1420 говорит…» — это ломает атмосферу
// лаунчера). Здесь — то же поведение, но в стилистике интерфейса.
//
// Использование:
//   const toast = useToast();
//   toast.ok("Готово");
//   toast.err("Не удалось…");
//
//   const confirm = useConfirm();
//   const ok = await confirm({ title: "Удалить?", message: "...", danger: true });
//   if (!ok) return;
//
// Тосты — неблокирующие, исчезают сами через 4 сек (можно настроить).
// Confirm — модальный, возвращает Promise<boolean>, поддерживает Esc/Enter.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
} from "lucide-react";

// --------------------------------------------------------- контекст

const ToastCtx = createContext({
  push: () => {},
  dismiss: () => {},
});

const ConfirmCtx = createContext(async () => false);

// --------------------------------------------------------- провайдер

let _toastId = 0;
const nextId = () => ++_toastId;

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  // confirmState: null | { title, message, confirmLabel, cancelLabel, danger, resolve }
  const [confirmState, setConfirmState] = useState(null);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast) => {
      const id = nextId();
      const entry = {
        id,
        type: toast.type || "info",
        text: toast.text || "",
        ttl: toast.ttl ?? 4000,
      };
      setToasts((list) => [...list, entry]);
      if (entry.ttl > 0) {
        setTimeout(() => dismiss(id), entry.ttl);
      }
      return id;
    },
    [dismiss],
  );

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setConfirmState((prev) => {
          if (prev?.resolve) prev.resolve(false);
          return {
            title: opts?.title || "Подтверждение",
            message: opts?.message || "",
            confirmLabel: opts?.confirmLabel || "Подтвердить",
            cancelLabel: opts?.cancelLabel || "Отмена",
            danger: !!opts?.danger,
            resolve,
          };
        });
      }),
    [],
  );

  const handleConfirmClose = useCallback(
    (result) => {
      setConfirmState((s) => {
        if (s) s.resolve(result);
        return null;
      });
    },
    [],
  );

  // Esc/Enter в confirm — глобальные слушатели только пока модалка открыта.
  useEffect(() => {
    if (!confirmState) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleConfirmClose(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleConfirmClose(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmState, handleConfirmClose]);

  const toastApi = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastCtx.Provider value={toastApi}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        <ToastHost toasts={toasts} onClose={dismiss} />
        {confirmState && (
          <ConfirmDialog
            {...confirmState}
            onResult={handleConfirmClose}
          />
        )}
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}

// --------------------------------------------------------- хуки

/**
 * Хук для нотификаций. Возвращает { ok, err, info, busy, dismiss }.
 *   toast.ok("Готово")           → зелёный тост, исчезнет через 4сек
 *   toast.err("…", { ttl: 0 })   → красный, остаётся до клика по крестику
 *   toast.busy("Качаю…")         → синий с лоадером (для фоновых задач)
 *   toast.dismiss(id)            → снять конкретный тост
 */
export function useToast() {
  const { push, dismiss } = useContext(ToastCtx);
  return useMemo(
    () => ({
      ok: (text, opts) => push({ type: "ok", text, ...(opts || {}) }),
      err: (text, opts) => push({ type: "err", text, ttl: 6000, ...(opts || {}) }),
      info: (text, opts) => push({ type: "info", text, ...(opts || {}) }),
      busy: (text, opts) => push({ type: "busy", text, ttl: 0, ...(opts || {}) }),
      dismiss,
    }),
    [push, dismiss],
  );
}

/**
 * Хук для confirm-диалога. Возвращает async ({title,message,confirmLabel,cancelLabel,danger}) => bool.
 * Пример:
 *   if (!(await confirm({ title: "Удалить?", danger: true }))) return;
 */
export function useConfirm() {
  return useContext(ConfirmCtx);
}

// --------------------------------------------------------- ToastHost

function ToastHost({ toasts, onClose }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[360px] flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onClose={() => onClose(t.id)} />
      ))}
    </div>
  );
}

const TOAST_STYLES = {
  ok: {
    border: "border-emerald-400/35",
    bg: "bg-emerald-400/10",
    iconWrap: "bg-emerald-400/20 text-emerald-200",
    Icon: CheckCircle2,
  },
  err: {
    border: "border-rose-400/40",
    bg: "bg-rose-400/12",
    iconWrap: "bg-rose-400/25 text-rose-100",
    Icon: AlertTriangle,
  },
  info: {
    border: "border-violet-300/30",
    bg: "bg-violet-400/10",
    iconWrap: "bg-violet-400/20 text-violet-100",
    Icon: Info,
  },
  busy: {
    border: "border-cyan-300/30",
    bg: "bg-cyan-400/10",
    iconWrap: "bg-cyan-400/20 text-cyan-100",
    Icon: Loader2,
  },
};

function ToastCard({ toast, onClose }) {
  const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info;
  const Icon = style.Icon;
  const mountedRef = useRef(false);
  const [enter, setEnter] = useState(false);

  // Маленькая анимация появления — клик в transition только после mount,
  // иначе React успеет сразу с конечным классом и анимация не запустится.
  useEffect(() => {
    mountedRef.current = true;
    requestAnimationFrame(() => setEnter(true));
  }, []);

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-3.5 py-3 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur transition-all duration-200 ${style.border} ${style.bg} ${enter ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"}`}
    >
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${style.iconWrap}`}>
        <Icon size={15} className={toast.type === "busy" ? "animate-spin" : ""} />
      </div>
      <p className="flex-1 whitespace-pre-line text-[12.5px] leading-snug text-zinc-100">
        {toast.text}
      </p>
      <button
        onClick={onClose}
        className="-mr-1 -mt-1 rounded-full p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white"
        aria-label="Закрыть"
      >
        <X size={13} />
      </button>
    </div>
  );
}

// --------------------------------------------------------- ConfirmDialog

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  onResult,
}) {
  // Автофокус на Confirm-кнопке — Enter тогда сразу её активирует, а юзер
  // визуально понимает, какой выбор по умолчанию.
  const btnRef = useRef(null);
  useEffect(() => {
    btnRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
    >
      {/* Затемнение фона. Клик по нему = отмена. */}
      <div
        className="absolute inset-0 bg-black/55"
        onClick={() => onResult(false)}
      />

      {/* Сама модалка */}
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-gradient-to-br from-[#10141f] via-[#0c0f17] to-[#0a0d16] p-5 shadow-[0_40px_120px_rgba(0,0,0,0.6)]">
        <div className="mb-4 flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
              danger
                ? "bg-rose-400/20 text-rose-200"
                : "bg-violet-400/20 text-violet-100"
            }`}
          >
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-white">{title}</h3>
            {message && (
              <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-zinc-300">
                {message}
              </p>
            )}
          </div>
          <button
            onClick={() => onResult(false)}
            className="-mr-1 -mt-1 rounded-full p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Закрыть"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={() => onResult(false)}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.08]"
          >
            {cancelLabel}
          </button>
          <button
            ref={btnRef}
            onClick={() => onResult(true)}
            className={`rounded-2xl px-4 py-2 text-xs font-bold transition ${
              danger
                ? "bg-rose-400 text-[#1a0608] hover:bg-rose-300"
                : "bg-white text-[#090b12] hover:scale-[1.02]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
