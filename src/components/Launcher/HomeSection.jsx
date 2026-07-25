import { memo } from "react";
import {
  Play,
  SlidersHorizontal,
  Sparkles,
  Zap,
  HardDrive,
  FolderOpen,
  Loader2,
  Square,
} from "lucide-react";
import { StatCard } from "@/components/Launcher/StatCard";
import { VersionPanel } from "@/components/Launcher/VersionPanel";
import { LoaderPanel } from "@/components/Launcher/LoaderPanel";

function capitalize(value) {
  if (!value) return "";
  return value[0].toUpperCase() + value.slice(1);
}

export const HomeSection = memo(function HomeSection({
  selectedVersion,
  loader,
  loaderVersion,
  filterTypes,
  memorySetting,
  launchState,
  installProgress,
  onSelectVersion,
  onSelectLoader,
  onSelectLoaderVersion,
  onPlay,
  onStop,
  onCancel,
  onConfigure,
}) {
  const memoryValue = memorySetting
    ? `${memorySetting.value} ${memorySetting.unit || "GB"}`
    : "—";

  const loaderLabel = loader && loader !== "vanilla"
    ? `${capitalize(loader)}${loaderVersion ? ` ${loaderVersion}` : ""}`
    : "Vanilla";

  const isInstalling = launchState === "installing";
  const isLaunching = launchState === "launching";
  const isRunning = launchState === "running";
  const isBusy = isInstalling || isLaunching;

  const installPct = installProgress
    ? Math.max(0, Math.min(100, Math.round(Number(installProgress.percent) || 0)))
    : 0;

  const playLabel = isInstalling
    ? `Установка ${installProgress ? installPct + "%" : ""}`
    : isLaunching
      ? "Запуск…"
      : isRunning
        ? "Остановить"
        : "Играть";

  const handleClick = () => {
    if (isRunning) onStop();
    else if (!isBusy) onPlay();
  };

  return (
    <section className="min-w-0 space-y-3">
      <div className="home-hero-panel relative overflow-hidden rounded-2xl border border-white/10 bg-theme-card/80 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.3)] sm:p-4 lg:rounded-3xl">
        <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.35),transparent_45%)]" />
        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-2.5 py-1 text-[10px] font-semibold text-violet-200">
              <Sparkles size={12} /> Текущая сборка
            </div>
            <h2 className="truncate text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
              {selectedVersion || "Версия не выбрана"}
            </h2>
            <p className="mt-1 truncate text-xs text-zinc-400 lg:text-sm">
              Загрузчик: {loaderLabel}
            </p>
          </div>
          <div className="flex shrink-0 gap-2 sm:flex-col lg:w-[200px]">
            <button
              data-tour="play"
              onClick={handleClick}
              disabled={!selectedVersion || isBusy}
              className={`group flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold shadow-[0_20px_60px_rgba(255,255,255,0.14)] transition sm:flex-none sm:rounded-2xl sm:px-5 sm:py-3 sm:text-sm ${
                isRunning
                  ? "bg-rose-400 text-[#250406] hover:bg-rose-300"
                  : "bg-white text-[#080b12] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
              }`}
            >
              {isInstalling || isLaunching ? (
                <Loader2 className="animate-spin" size={14} />
              ) : isRunning ? (
                <Square className="fill-current" size={14} />
              ) : (
                <Play className="fill-[#080b12]" size={14} />
              )}
              {playLabel}
            </button>
            <button
              onClick={onConfigure}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 sm:flex-none sm:rounded-2xl sm:px-5 sm:py-3"
            >
              <SlidersHorizontal size={14} /> Настроить
            </button>
          </div>
        </div>

        {isInstalling && installProgress && (
          <div className="relative z-10 mt-3 rounded-xl border border-white/10 bg-white/[0.035] p-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="truncate text-zinc-300">{installProgress.label}</span>
              <span className="shrink-0 font-semibold text-violet-200">
                {installPct}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-400 to-cyan-300 transition-all"
                style={{ width: `${installPct}%` }}
              />
            </div>
            {onCancel && (
              <div className="mt-2 flex justify-end">
                <button
                  onClick={onCancel}
                  className="rounded-lg bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-500/25"
                >
                  Отменить
                </button>
              </div>
            )}
          </div>
        )}

        <div className="relative z-10 mt-3 grid grid-cols-3 gap-2 sm:mt-4">
          <StatCard
            icon={Zap}
            label="Загрузчик"
            value={loader === "vanilla" ? "Vanilla" : capitalize(loader)}
            detail={loaderVersion || (loader === "vanilla" ? "—" : "не выбрана")}
          />
          <StatCard
            icon={HardDrive}
            label="Память"
            value={memoryValue}
            detail="Настроить в разделе настроек"
          />
          <StatCard
            icon={FolderOpen}
            label="Версия"
            value={selectedVersion || "—"}
            detail="Из manifest Mojang"
          />
        </div>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <VersionPanel
          selectedVersion={selectedVersion}
          filterTypes={filterTypes}
          onSelectVersion={onSelectVersion}
        />
        <LoaderPanel
          loader={loader}
          loaderVersion={loaderVersion}
          mcVersion={selectedVersion}
          onSelectLoader={onSelectLoader}
          onSelectLoaderVersion={onSelectLoaderVersion}
        />
      </div>
    </section>
  );
});
