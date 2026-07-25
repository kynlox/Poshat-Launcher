import { memo, useCallback, useEffect, useRef, useState } from "react";
import { THEMES } from "@/data/themes";
import {
  ChevronDown,
  FolderOpen,
  RefreshCw,
  Trash2,
  HardDrive,
  Cpu,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { SectionTitle } from "@/components/Launcher/SectionTitle";
import { GameJavaPanel } from "@/components/Launcher/GameJavaPanel";
import { useConfirm, useToast } from "@/components/ui/UIProvider";

function formatBytes(n) {
  if (!n || n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export const SettingsSection = memo(function SettingsSection({
  groups,
  onCycleSetting,
  onUpdateSetting,
  themeId,
  onThemeChange,
  onStartOnboarding,
  animationsEnabled,
  onToggleAnimations,
}) {
  const api = typeof window !== "undefined" ? window.poshatAPI : null;
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(null);

  const [storeSettings, setStoreSettings] = useState(null);
  useEffect(() => {
    if (!api) return;
    api.settings.get().then((payload) => {
      if (payload?.settings) setStoreSettings(payload.settings);
    }).catch(() => {});
  }, [api]);

  const storeSettingsRef = useRef(storeSettings);
  storeSettingsRef.current = storeSettings;

  const handleGameJavaChange = useCallback(
    async (patch) => {
      if (!api) return;
      const prev = storeSettingsRef.current;
      setStoreSettings((s) => ({ ...(s || {}), ...patch }));
      try {
        const snap = await api.settings.set({ settings: patch });
        if (snap?.settings) setStoreSettings(snap.settings);
      } catch (e) {
        setStoreSettings(prev);
        toast.err(`Не удалось сохранить настройку: ${e?.message || e}`);
      }
    },
    [api, toast],
  );

  const handleOpenFolder = async () => {
    if (!api) return;
    setBusy("open");
    try {
      await api.system.openRootFolder();
    } catch (e) {
      toast.err(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleVerify = () => {
    toast.info(
      "Запусти сборку — при установке lyceris сверит хэши и докачает повреждённые файлы.",
    );
  };

  const handleClearCache = async () => {
    if (!api) return;
    const ok = await confirm({
      title: "Очистить общий кэш?",
      message:
        "Удалится папка <shared> с общими версиями и библиотеками.\nСборки и их сейвы НЕ удалятся.",
      confirmLabel: "Очистить",
      danger: true,
    });
    if (!ok) return;
    setBusy("clear");
    try {
      const freed = await api.system.clearSharedCache();
      toast.ok(`Готово, освобождено ${formatBytes(freed)}`);
    } catch (e) {
      toast.err(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  const iconMap = {
    HardDrive,
    Cpu,
    CheckCircle2,
  };

  return (
    <section className="space-y-3">
      <SectionTitle
        eyebrow="Система"
        title="Настройки"
        description="Java, память, папки и кэш."
      />

      {/* Внешний вид — тема + обучение в одну строку */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 rounded-2xl border border-white/10 bg-theme-card/80 p-3 lg:rounded-3xl lg:p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Тема оформления</h3>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => onThemeChange(theme.id)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs transition ${
                  themeId === theme.id
                    ? "bg-violet-400/20 text-white ring-1 ring-violet-400/50"
                    : "bg-white/[0.035] text-zinc-400 hover:bg-white/[0.065]"
                }`}
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: theme.vars["--bg-primary"] }}
                />
                {theme.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-theme-card/80 p-3 lg:rounded-3xl lg:p-4">
          <button
            type="button"
            onClick={onStartOnboarding}
            className="w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.065] hover:text-white"
          >
            Повторить обучение
          </button>
          <button
            type="button"
            onClick={onToggleAnimations}
            role="switch"
            aria-checked={animationsEnabled}
            aria-label="Анимации интерфейса"
            className="no-press flex w-full items-center justify-between rounded-xl bg-white/[0.035] px-3 py-2.5 text-left transition hover:bg-white/[0.065]"
          >
            <span className="text-xs text-zinc-400">Анимации</span>
            <span
              className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ${animationsEnabled ? "bg-violet-400/80" : "bg-white/10"}`}
            >
              <span
                className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${animationsEnabled ? "translate-x-4" : "translate-x-0"}`}
              />
            </span>
          </button>
        </div>
      </div>

      {/* Игра и Java — на верху, самый важный блок */}
      <GameJavaPanel
        settings={storeSettings}
        onChange={handleGameJavaChange}
      />

      {/* производительность + Версии */}
      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map((group) => (
          <div
            key={group.title}
            className="rounded-2xl border border-white/10 bg-theme-card/80 p-3 lg:rounded-3xl lg:p-4"
          >
            <h3 className="mb-3 text-sm font-semibold text-white">
              {group.title}
            </h3>
            <div className="space-y-2">
              {group.rows.map((row) => {
                const Icon = iconMap[row.icon] || HardDrive;
                if (row.type === "toggle") {
                  return (
                    <button
                      key={row.label}
                      type="button"
                      onClick={() =>
                        onUpdateSetting(group.title, row.label, !row.value)
                      }
                      role="switch"
                      aria-checked={Boolean(row.value)}
                      aria-label={row.label}
                      className="no-press flex w-full items-center justify-between rounded-xl bg-white/[0.035] px-3 py-2.5 text-left transition hover:bg-white/[0.065]"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-xs text-zinc-400">
                        <Icon size={14} />{" "}
                        <span className="truncate">{row.label}</span>
                      </span>
                      <span
                        className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 ${row.value ? "bg-violet-400/80" : "bg-white/10"}`}
                      >
                        <span
                          className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${row.value ? "translate-x-4" : "translate-x-0"}`}
                        />
                      </span>
                    </button>
                  );
                }
                if (row.type === "range") {
                  return (
                    <div
                      key={row.label}
                      className="rounded-xl bg-white/[0.035] px-3 py-2.5"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-xs text-zinc-400">
                          <Icon size={14} />{" "}
                          <span className="truncate">{row.label}</span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-white">
                          {row.value} {row.unit || ""}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={row.min}
                        max={row.max}
                        step={row.step || 1}
                        value={row.value}
                        onChange={(event) =>
                          onUpdateSetting(
                            group.title,
                            row.label,
                            Number(event.target.value),
                          )
                        }
                        className="launcher-range w-full"
                      />
                      <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
                        <span>
                          {row.min} {row.unit || ""}
                        </span>
                        <span>
                          {row.max} {row.unit || ""}
                        </span>
                      </div>
                    </div>
                  );
                }
                return (
                  <button
                    key={row.label}
                    onClick={() => onCycleSetting(group.title, row.label)}
                    className="flex w-full items-center justify-between rounded-xl bg-white/[0.035] px-3 py-2.5 text-left transition hover:bg-white/[0.065]"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-xs text-zinc-400">
                      <Icon size={14} />{" "}
                      <span className="truncate">{row.label}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-white">
                      {row.value}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Папки и кэш — внизу, полная ширина */}
        <div className="rounded-2xl border border-white/10 bg-theme-card/80 p-3 lg:rounded-3xl lg:p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Папки и кэш</h3>
          <div className="space-y-2">
            <button
              onClick={handleOpenFolder}
              disabled={busy === "open"}
              className="flex w-full items-center justify-between rounded-xl bg-white/[0.035] px-3 py-2.5 text-left text-xs text-zinc-300 transition hover:bg-white/[0.065] disabled:opacity-60"
            >
              <span className="flex items-center gap-2">
                {busy === "open" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FolderOpen size={14} />
                )}{" "}
                Открыть папку игры
              </span>
              <ChevronDown size={14} />
            </button>
            <button
              onClick={handleVerify}
              className="flex w-full items-center justify-between rounded-xl bg-white/[0.035] px-3 py-2.5 text-left text-xs text-zinc-300 transition hover:bg-white/[0.065]"
            >
              <span className="flex items-center gap-2">
                <RefreshCw size={14} /> Проверить файлы
              </span>
              <ChevronDown size={14} />
            </button>
            <button
              onClick={handleClearCache}
              disabled={busy === "clear"}
              className="flex w-full items-center justify-between rounded-xl bg-red-400/10 px-3 py-2.5 text-left text-xs text-red-200 transition hover:bg-red-400/15 disabled:opacity-60"
            >
              <span className="flex items-center gap-2">
                {busy === "clear" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}{" "}
                Очистить кэш
              </span>
              <ChevronDown size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
});
