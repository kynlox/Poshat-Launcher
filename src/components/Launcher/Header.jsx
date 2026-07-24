import { Search, Minimize2, Maximize2, X } from "lucide-react";

export function Header({
  activeSectionLabel,
  searchText,
  onSearchChange,
  windowMode,
  onWindowAction,
}) {
  return (
    <header className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-theme-card/75 p-2 lg:gap-4 lg:rounded-[32px] lg:p-4">
      <div className="flex min-w-0 items-center gap-2 lg:gap-3">
        <div className="hidden gap-2 rounded-full bg-white/5 px-3 py-2 sm:flex">
          <button
            onClick={() => onWindowAction("Закрытие окна")}
            className="h-3 w-3 rounded-full bg-red-400/80 transition hover:scale-125"
            aria-label="Закрыть окно"
          />
          <button
            onClick={() => onWindowAction("Сворачивание окна")}
            className="h-3 w-3 rounded-full bg-yellow-400/80 transition hover:scale-125"
            aria-label="Свернуть окно"
          />
          <button
            onClick={() => onWindowAction("Полноэкранный режим")}
            className="h-3 w-3 rounded-full bg-emerald-400/80 transition hover:scale-125"
            aria-label="Развернуть окно"
          />
        </div>
        <div className="min-w-0">
          <p className="hidden text-xs text-zinc-500 lg:block">{windowMode}</p>
          <h2 className="truncate text-sm font-semibold lg:text-lg">
            {activeSectionLabel}
          </h2>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 lg:gap-2">
        <label className="flex min-w-0 max-w-[280px] flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-2.5 py-1.5 text-xs text-zinc-400 lg:max-w-[310px] lg:rounded-2xl lg:px-3 lg:py-2 lg:text-sm">
          <Search size={14} className="shrink-0" />
          <input
            value={searchText}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Поиск"
            className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-zinc-500 lg:text-sm"
          />
        </label>
        <button
          onClick={() => onWindowAction("Сворачивание окна")}
          className="hidden rounded-xl bg-white/8 p-1.5 text-zinc-300 hover:bg-white/12 sm:block lg:rounded-2xl lg:p-2.5"
        >
          <Minimize2 size={14} />
        </button>
        <button
          onClick={() => onWindowAction("Полноэкранный режим")}
          className="hidden rounded-xl bg-white/8 p-1.5 text-zinc-300 hover:bg-white/12 sm:block lg:rounded-2xl lg:p-2.5"
        >
          <Maximize2 size={14} />
        </button>
        <button
          onClick={() => onWindowAction("Закрытие окна")}
          className="rounded-xl bg-white/8 p-1.5 text-zinc-300 hover:bg-white/12 lg:rounded-2xl lg:p-2.5"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
