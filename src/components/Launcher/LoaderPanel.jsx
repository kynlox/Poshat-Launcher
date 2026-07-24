import { Hammer } from "lucide-react";
import { loaderOptions } from "@/data/launcherData";
import { useLoaderVersions } from "@/hooks/useLoaderVersions";

export function LoaderPanel({
  loader,
  loaderVersion,
  mcVersion,
  onSelectLoader,
  onSelectLoaderVersion,
}) {
  const { data, loading, error } = useLoaderVersions(loader, mcVersion);

  return (
    <div className="self-start rounded-2xl border border-white/10 bg-theme-card/80 p-3 lg:rounded-[32px] lg:p-5">
      <div className="mb-2 flex items-center justify-between lg:mb-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 truncate text-sm font-semibold lg:text-base">
            <Hammer size={14} className="text-violet-300" /> Загрузчик
          </h3>
          <p className="hidden text-xs text-zinc-500 lg:block">
            Vanilla • Fabric • Quilt • Forge • NeoForge
          </p>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {loaderOptions.map((option) => {
          const active = loader === option.id;
          const cls = active
            ? "border-violet-300/30 bg-violet-400/15 text-white"
            : "border-white/8 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07]";
          return (
            <button
              key={option.id}
              onClick={() => onSelectLoader(option.id)}
              className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition lg:rounded-xl lg:px-3 lg:py-2 lg:text-xs ${cls}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {(!loader || loader === "vanilla") && (
        <p className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] text-zinc-400">
          Vanilla запускается без отдельной версии загрузчика.
        </p>
      )}

      {loader && loader !== "vanilla" && (
        <div>
          {!mcVersion && (
            <p className="text-[11px] text-zinc-500">
              Сначала выбери версию Minecraft.
            </p>
          )}
          {mcVersion && loading && (
            <p className="text-[11px] text-zinc-500">Загрузка версий загрузчика…</p>
          )}
          {mcVersion && error && (
            <p className="text-[11px] text-red-300">
              Не удалось получить список: {String(error.message || error)}
            </p>
          )}
          {mcVersion && !loading && !error && data.length === 0 && (
            <p className="text-[11px] text-zinc-500">
              Для {mcVersion} версий загрузчика нет.
            </p>
          )}
          {mcVersion && !loading && !error && data.length > 0 && (
            <div className="launcher-scroll max-h-[140px] space-y-1 overflow-y-auto pr-1">
              {data.slice(0, 80).map((entry) => {
                const active = entry.loaderVersion === loaderVersion;
                const cls = active
                  ? "border-violet-300/30 bg-violet-400/15 text-white"
                  : "border-white/8 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07]";
                return (
                  <button
                    key={entry.loaderVersion}
                    onClick={() => onSelectLoaderVersion(entry.loaderVersion)}
                    className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11px] transition ${cls}`}
                  >
                    <span className="truncate">{entry.loaderVersion}</span>
                    {entry.stable && (
                      <span className="ml-2 shrink-0 rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                        stable
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
