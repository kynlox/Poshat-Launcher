import { useMemo, useState } from "react";
import { ArrowDownUp, Check, ChevronDown, RefreshCw, Search } from "lucide-react";
import { useVersions } from "@/hooks/useVersions";
import { useInstalledVersions } from "@/hooks/useInstalledVersions";

const TYPE_BADGE = {
  release: { label: "release", className: "bg-emerald-400/15 text-emerald-300" },
  snapshot: { label: "snapshot", className: "bg-yellow-400/15 text-yellow-300" },
  old_beta: { label: "beta", className: "bg-orange-400/15 text-orange-300" },
  old_alpha: { label: "alpha", className: "bg-rose-400/15 text-rose-300" },
};

export function VersionPanel({
  selectedVersion,
  filterTypes,
  onSelectVersion,
}) {
  // По умолчанию — desc (новые сверху), пользователь может переключить.
  // Бэкенд тянет уже в нужном порядке — UI просто его транслирует.
  const [order, setOrder] = useState("desc");
  const { data, loading, refreshing, error, refresh } = useVersions(filterTypes, order);
  // Подсветка установленных версий. Poll'им раз в 10 секунд — FS-чтение
  // дешёвое, а пользователь увидит свежее состояние после установки без
  // ручного рефреша.
  const { installed } = useInstalledVersions(10000);
  const [query, setQuery] = useState("");
  const [installedOnly, setInstalledOnly] = useState(false);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    let list = data;
    if (installedOnly) list = list.filter((entry) => installed.has(entry.id));
    if (trimmed) list = list.filter((entry) => entry.id.toLowerCase().includes(trimmed));
    return list;
  }, [data, query, installedOnly, installed]);

  const total = data.length;
  const installedCount = useMemo(
    () => data.reduce((n, entry) => (installed.has(entry.id) ? n + 1 : n), 0),
    [data, installed],
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-theme-card/80 p-3 lg:rounded-[32px] lg:p-5">
      <div className="mb-2 flex items-center justify-between gap-2 lg:mb-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold lg:text-base">
            Версии Minecraft
          </h3>
          <p className="hidden text-xs text-zinc-500 lg:block">
            {total > 0
              ? `Всего: ${total}${installedCount > 0 ? ` · скачано ${installedCount}` : ""}`
              : "Фильтры — в настройках"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setInstalledOnly((v) => !v)}
            className={`rounded-md border p-1 transition ${
              installedOnly
                ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-200"
                : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white"
            }`}
          >
            <Check size={12} />
          </button>
          <button
            type="button"
            onClick={() => setOrder((o) => (o === "asc" ? "desc" : "asc"))}
            className="rounded-md border border-white/10 bg-white/[0.04] p-1 text-zinc-400 transition hover:text-white"
          >
            <ArrowDownUp size={12} className={order === "asc" ? "rotate-180" : ""} />
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="rounded-md border border-white/10 bg-white/[0.04] p-1 text-zinc-400 transition hover:text-white disabled:opacity-40"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          </button>
          <label className="flex w-[120px] items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-zinc-400 sm:w-[150px]">
            <Search size={11} className="shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-zinc-500"
            />
          </label>
        </div>
      </div>

      {/* Ошибку показываем как баннер, но не прячем список — если data есть,
          пусть пользователь видит хоть что-то, пока сеть/main process чинятся. */}
      {error && data.length === 0 && (
        <p className="px-1 text-[11px] text-red-300">
          {String(error.message || error)}
        </p>
      )}
      {error && data.length > 0 && (
        <p className="mb-2 rounded-md border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-200">
          Обновление списка не удалось — показываю последние известные версии.
        </p>
      )}
      {loading && data.length === 0 && (
        <p className="px-1 text-[11px] text-zinc-500">Загрузка списка версий…</p>
      )}
      {!loading && !error && data.length > 0 && filtered.length === 0 && (
        <p className="px-1 text-[11px] text-zinc-500">
          По запросу ничего не найдено.
        </p>
      )}
      {!loading && !error && data.length === 0 && (
        <p className="px-1 text-[11px] text-zinc-500">
          Включи нужные типы версий в настройках.
        </p>
      )}

      {filtered.length > 0 && (
        <div className="launcher-scroll max-h-[260px] space-y-1.5 overflow-y-auto pr-1 lg:max-h-[420px]">
          {filtered.slice(0, 500).map((entry) => {
            const active = entry.id === selectedVersion;
            const isInstalled = installed.has(entry.id);
            let cls;
            if (active) {
              // active побеждает: фиолетовый — это явный выбор пользователя.
              cls = "border-violet-300/30 bg-violet-400/15 text-white";
            } else if (isInstalled) {
              // зелёная подсветка установленных — отличить, что лежит на диске.
              cls = "border-emerald-300/30 bg-emerald-400/10 text-emerald-50 hover:bg-emerald-400/15";
            } else {
              cls = "border-white/8 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07]";
            }
            const badge = TYPE_BADGE[entry.type] || TYPE_BADGE.release;
            return (
              <button
                key={entry.id}
                onClick={() => onSelectVersion(entry.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition lg:rounded-xl lg:px-3 lg:py-2 ${cls}`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {isInstalled && (
                    <Check size={11} className="shrink-0 text-emerald-300" />
                  )}
                  <span className="truncate">{entry.id}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {isInstalled && (
                    <span className="rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-200">
                      скачано
                    </span>
                  )}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  <ChevronDown size={11} className="text-zinc-500" />
                </span>
              </button>
            );
          })}
          {filtered.length > 500 && (
            <p className="px-2 pt-1 text-[10px] text-zinc-500">
              Показаны первые 500 из {filtered.length}. Уточни поиск.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
