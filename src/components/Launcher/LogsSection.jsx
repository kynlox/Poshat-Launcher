import { useEffect, useMemo, useRef } from "react";
import { Trash2, ClipboardCopy, ScrollText } from "lucide-react";
import { SectionTitle } from "@/components/Launcher/SectionTitle";
import { useToast } from "@/components/ui/UIProvider";

const LIMIT = 2000;

export function LogsSection({ lines, onClear, autoScroll, onToggleAutoScroll }) {
  const scrollRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, autoScroll]);

  const text = useMemo(
    () => lines.map((l) => l.line).join("\n"),
    [lines],
  );

  const copy = async () => {
    if (!text) {
      toast.info("Логи пустые — копировать нечего.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.ok(`Скопировано ${lines.length} строк в буфер.`);
    } catch {
      // Fallback для Tauri-вебвью без clipboard permissions
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {}
      document.body.removeChild(textarea);
      if (ok) {
        toast.ok(`Скопировано ${lines.length} строк в буфер.`);
      } else {
        toast.err("Не удалось скопировать. Разреши доступ к буферу в настройках Tauri.");
      }
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <SectionTitle
          eyebrow="Диагностика"
          title="Логи запуска"
          description={`stdout/stderr процесса Minecraft. Лимит ${LIMIT} строк (старые отбрасываются).`}
        />
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-zinc-300">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => onToggleAutoScroll(e.target.checked)}
              className="h-3 w-3 accent-violet-400"
            />
            Автоскролл
          </label>
          <button
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/8 px-3 py-2 text-xs text-zinc-200 transition hover:bg-white/12"
          >
            <ClipboardCopy size={14} /> Копировать
          </button>
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/15 px-3 py-2 text-xs text-rose-300 transition hover:bg-rose-500/25"
          >
            <Trash2 size={14} /> Очистить
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="theme-force-dark launcher-scroll h-[calc(100vh-220px)] overflow-y-auto rounded-3xl border border-white/10 bg-black/40 p-4 font-mono text-[11px] leading-[1.5]"
      >
        {lines.length === 0 && (
          <div className="flex h-full items-center justify-center text-center text-zinc-500">
            <div>
              <ScrollText className="mx-auto mb-2 text-zinc-600" size={24} />
              <p>Пока пусто.</p>
              <p className="mt-1 text-[10px]">Запусти сборку или версию с главной — здесь появятся stdout/stderr.</p>
            </div>
          </div>
        )}
        {lines.map((entry, idx) => {
          const colorClass =
            entry.stream === "error"
              ? "text-rose-300/95 font-semibold"
              : entry.stream === "stderr"
                ? "text-rose-300/90"
                : entry.stream === "system"
                  ? "text-cyan-300/90"
                  : "text-zinc-300";
          return (
            <div
              key={`${entry.pid}-${idx}-${entry.ts}`}
              className={`whitespace-pre-wrap ${colorClass}`}
            >
              {entry.line}
            </div>
          );
        })}
      </div>
    </section>
  );
}
