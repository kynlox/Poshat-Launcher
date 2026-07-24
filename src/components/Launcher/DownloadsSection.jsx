import { CheckCircle2, Clock3, Loader2, X } from "lucide-react";
import { SectionTitle } from "@/components/Launcher/SectionTitle";
import { EmptyState } from "@/components/Launcher/EmptyState";

export function DownloadsSection({ items, onClear, onCancel }) {
  return (
    <section className="space-y-3">
      <SectionTitle
        eyebrow="Очередь"
        title="Загрузки"
        description="Прогресс установки версий и загрузчиков."
      />
      <div className="rounded-2xl border border-white/10 bg-theme-card/80 p-3 lg:rounded-3xl lg:p-4">
        <div className="mb-3 flex justify-end">
          <button
            onClick={onClear}
            className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[11px] font-semibold text-zinc-300 transition hover:bg-white/10"
          >
            Очистить готовые
          </button>
        </div>
        <div className="space-y-2">
          {items.length === 0 && <EmptyState label="Очередь пустая" />}
          {items.map((item) => {
            const done = item.percent >= 100;
            const failed = item.error;
            const Icon = failed ? Clock3 : done ? CheckCircle2 : Loader2;
            const statusClass = failed
              ? "text-rose-300"
              : done
                ? "text-emerald-300"
                : "text-cyan-300";
            const statusText = failed
              ? "Ошибка"
              : done
                ? "Готово"
                : `${Math.round(item.percent)}%`;
            return (
              <div
                key={item.taskId}
                className="rounded-xl border border-white/8 bg-white/[0.035] p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="shrink-0 rounded-lg bg-white/8 p-1.5 text-white">
                      <Icon
                        size={14}
                        className={
                          !done && !failed ? "animate-spin" : undefined
                        }
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white">
                        {item.label || item.taskId}
                      </p>
                      <p className="truncate text-[10px] text-zinc-500">
                        {item.target || "Глобально"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`text-[11px] font-semibold ${statusClass}`}
                    >
                      {statusText}
                    </span>
                    {!done && !failed && onCancel && (
                      <button
                        onClick={() => onCancel(item.taskId)}
                        className="rounded-lg bg-rose-500/15 p-1 text-rose-300 transition hover:bg-rose-500/25"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                  <div
                    className={`h-full rounded-full transition-all ${
                      failed
                        ? "bg-rose-400"
                        : "bg-gradient-to-r from-violet-400 to-cyan-300"
                    }`}
                    style={{ width: `${Math.min(100, item.percent)}%` }}
                  />
                </div>
                {failed && (
                  <p className="mt-2 text-[10px] text-rose-300">{item.error}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
