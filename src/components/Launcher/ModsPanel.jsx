import { ModRow } from "./ModRow";
import { EmptyState } from "./EmptyState";

export function ModsPanel({ modsList, onToggleMod }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-theme-card/80 p-3 lg:rounded-[32px] lg:p-5">
      <div className="mb-2 flex items-center justify-between lg:mb-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold lg:text-base">Моды сборки</h3>
          <p className="hidden text-xs text-zinc-500 lg:block">Включение, версии и категории</p>
        </div>
        <span className="shrink-0 rounded-xl bg-white/8 px-2 py-1 text-[10px] font-semibold text-zinc-200 lg:rounded-2xl lg:px-3 lg:py-2 lg:text-xs">
          {modsList.length} модов
        </span>
      </div>
      <div className="launcher-scroll max-h-[200px] space-y-1.5 overflow-y-auto pr-1 lg:max-h-none lg:space-y-2 lg:overflow-visible lg:pr-0">
        {modsList.length === 0 && <EmptyState label="Поиск не нашёл моды" />}
        {modsList.map((mod) => (
          <ModRow
            key={mod.name}
            mod={mod}
            onToggle={() => onToggleMod(mod.name)}
          />
        ))}
      </div>
    </div>
  );
}
