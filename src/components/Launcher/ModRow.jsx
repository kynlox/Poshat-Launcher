import { Package } from "lucide-react";

export function ModRow({ mod, onToggle }) {
  const switchClass = mod.enabled ? "bg-emerald-400" : "bg-white/10";
  const knobClass = mod.enabled
    ? "translate-x-5 bg-[#07110c]"
    : "translate-x-0 bg-zinc-500";
  const rowClass = mod.enabled ? "opacity-100" : "opacity-55";

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-2.5 py-2 transition lg:gap-4 lg:rounded-2xl lg:px-4 lg:py-3 ${rowClass}`}
    >
      <div className="flex min-w-0 items-center gap-2 lg:gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/8 text-zinc-200 lg:h-10 lg:w-10 lg:rounded-xl">
          <Package size={14} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-white lg:text-sm">{mod.name}</p>
          <p className="truncate text-[10px] text-zinc-500 lg:text-xs">
            {mod.category} · v{mod.version}
          </p>
        </div>
      </div>
      <button
        onClick={onToggle}
        className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition lg:h-6 lg:w-11 ${switchClass}`}
        aria-label={mod.enabled ? "Выключить мод" : "Включить мод"}
      >
        <div className={`h-4 w-4 rounded-full transition lg:h-5 lg:w-5 ${knobClass}`} />
      </button>
    </div>
  );
}
