import { ShieldCheck } from "lucide-react";
import { InstanceCard } from "@/components/Launcher/InstanceCard";

export function RightSidebar({
  instances = [],
  activeInstanceId,
  onNavigateToInstances,
  onSelectInstance,
}) {
  const visibleInstances = instances.slice(0, 3);

  return (
    <aside className="space-y-4">
      <div className="rounded-[32px] border border-white/10 bg-theme-card/80 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Мои сборки</h3>
            <p className="text-xs text-zinc-500">{instances.length} сборок</p>
          </div>
          <button
            onClick={onNavigateToInstances}
            className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-[#090b12]"
          >
            Открыть
          </button>
        </div>
        <div className="space-y-3">
          {visibleInstances.length === 0 && (
            <p className="text-center text-xs text-zinc-500">Нет сборок</p>
          )}
          {visibleInstances.map((item) => (
            <InstanceCard
              key={item.id}
              item={item}
              active={item.id === activeInstanceId}
              onClick={() => onSelectInstance(item.id)}
            />
          ))}
        </div>
      </div>

      <div className="rounded-[32px] border border-white/10 bg-theme-card/80 p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-400/10 p-2 text-emerald-300">
            <ShieldCheck size={19} />
          </div>
          <div>
            <h3 className="font-semibold">Приватность</h3>
            <p className="text-xs text-zinc-500">Ничего лишнего</p>
          </div>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex w-full items-center justify-between rounded-2xl bg-white/[0.035] px-4 py-3">
            <span className="text-zinc-400">Реклама</span>
            <span className="font-semibold text-emerald-300">Нет</span>
          </div>
          <div className="flex w-full items-center justify-between rounded-2xl bg-white/[0.035] px-4 py-3">
            <span className="text-zinc-400">Телеметрия</span>
            <span className="font-semibold text-emerald-300">Выкл.</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
