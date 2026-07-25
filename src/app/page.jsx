"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Gamepad2, LoaderCircle, X } from "lucide-react";
import {
  sections,
  settingsGroups as defaultSettingsGroups,
} from "@/data/launcherData";
import { Sidebar } from "@/components/Launcher/Sidebar";
import { HomeSection } from "@/components/Launcher/HomeSection";
import { InstancesSection } from "@/components/Launcher/InstancesSection";
import { SettingsSection } from "@/components/Launcher/SettingsSection";
import { AccountsSection } from "@/components/Launcher/AccountsSection";
import { ModsCatalogSection } from "@/components/Launcher/ModsCatalogSection";
import { useToast, useConfirm } from "@/components/ui/UIProvider";
import { checkForUpdatesOnStartup } from "@/utils/updater";
import { applyTheme, THEMES } from "@/data/themes";
import { OnboardingTour } from "@/components/Launcher/OnboardingTour";
import { useAnimations } from "@/utils/useAnimations";

function cachedThemeId() {
  if (typeof window === "undefined") return "dark";
  try {
    const value = window.localStorage.getItem("poshat-theme");
    return THEMES.some((theme) => theme.id === value) ? value : "dark";
  } catch {
    return "dark";
  }
}

export default function PoshatLauncherPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [activeSection, setActiveSection] = useState("home");
  const [launcherAccounts, setLauncherAccounts] = useState([]);
  const [activeAccountId, setActiveAccountId] = useState(null);
  const [launcherInstances, setLauncherInstances] = useState([]);
  const [activeInstanceId, setActiveInstanceId] = useState(null);
  const [runningInstanceId, setRunningInstanceId] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [loader, setLoader] = useState("vanilla");
  const [loaderVersion, setLoaderVersion] = useState(null);
  const [launcherSettings, setLauncherSettings] = useState(defaultSettingsGroups);
  const [themeId, setThemeId] = useState(cachedThemeId);
  const [instancesSort, setInstancesSort] = useState("recent");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [instancesMounted, setInstancesMounted] = useState(false);
  const [pinnedIds, setPinnedIds] = useState([]);
  const [startupChecked, setStartupChecked] = useState(false);
  const [shortcutLaunchId, setShortcutLaunchId] = useState(null);
  const [shortcutLaunchError, setShortcutLaunchError] = useState(null);
  const [bootReady, setBootReady] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const animations = useAnimations();

  const [installProgress, setInstallProgress] = useState(null);
  const [currentInstallTaskId, setCurrentInstallTaskId] = useState(null);
  const [launchState, setLaunchState] = useState("idle");
  const [runningPid, setRunningPid] = useState(null);
  // Id инстанса, запрошенный извне (ярлык с argv). Срабатывает, как только
  // инстансы загрузятся и можно их найти по id.
  const [pendingAutoLaunchId, setPendingAutoLaunchId] = useState(null);

  const shortcutLaunchIdRef = useRef(null);
  useEffect(() => { shortcutLaunchIdRef.current = shortcutLaunchId; }, [shortcutLaunchId]);

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  const api = typeof window !== "undefined" ? window.poshatAPI : null;

  // One bootstrap transaction prevents the initial empty/dark UI flash and avoids duplicate IPC.
  useEffect(() => {
    if (!api) {
      setBootReady(true);
      return;
    }
    const safe = (promise, fallback) => Promise.resolve(promise).catch(() => fallback);
    Promise.all([
      safe(api.settings.get(), null),
      safe(api.accounts.list(), []),
      safe(api.accounts.active(), null),
      safe(api.instances.list(), []),
      safe(api.instances.getPinned(), []),
      safe(api.app.startupInstance(), null),
    ]).then(([payload, accounts, active, instances, pinned, startupId]) => {
      const settings = payload?.settings;
      if (settings) {
        setLauncherSettings((groups) => groups.map((group) => ({
          ...group,
          rows: group.rows.map((row) => {
            if (row.filterKey && settings.versionFilters) return { ...row, value: !!settings.versionFilters[row.filterKey] };
            if (row.settingKey && settings[row.settingKey] != null) return { ...row, value: settings[row.settingKey] };
            return row;
          }),
        })));
        if (["recent", "created", "name"].includes(settings.instancesSort)) setInstancesSort(settings.instancesSort);
        if (typeof settings.sidebarCollapsed === "boolean") setSidebarCollapsed(settings.sidebarCollapsed);
        if (THEMES.some((theme) => theme.id === settings.themeId)) {
          setThemeId(settings.themeId);
          try { window.localStorage.setItem("poshat-theme", settings.themeId); } catch {}
        }
      }
      if (payload?.lastSelection) {
        const selection = payload.lastSelection;
        if (selection.mcVersion) setSelectedVersion(selection.mcVersion);
        if (selection.loader) setLoader(selection.loader);
        if (selection.loaderVersion) setLoaderVersion(selection.loaderVersion);
      }
      if (payload?.lastInstanceId) setActiveInstanceId(payload.lastInstanceId);
      setLauncherAccounts(accounts || []);
      setActiveAccountId(active?.id || null);
      setLauncherInstances(instances || []);
      setPinnedIds(Array.isArray(pinned) ? pinned : []);
      if (startupId) {
        shortcutLaunchIdRef.current = startupId;
        setShortcutLaunchId(startupId);
        setPendingAutoLaunchId(startupId);
      }
      setStartupChecked(true);
      setOnboardingOpen(!settings?.onboardingCompleted && !startupId);
      setBootReady(true);
    });
  }, [api]);

  useEffect(() => {
    if (!bootReady || !startupChecked || shortcutLaunchId) return;
    let innerCleanup = null;
    const timer = window.setTimeout(() => {
      innerCleanup = checkForUpdatesOnStartup(toast, confirm);
    }, 1600);
    return () => {
      window.clearTimeout(timer);
      if (innerCleanup) innerCleanup();
    };
  }, [bootReady, startupChecked, shortcutLaunchId, toast, confirm]);

  const reloadAccounts = () => {
    if (!api) return Promise.resolve();
    return Promise.all([api.accounts.list(), api.accounts.active()]).then(
      ([list, active]) => {
        setLauncherAccounts(list || []);
        setActiveAccountId(active?.id || null);
      },
    );
  };

  const handleSelectAccount = async (id) => {
    if (!api) return;
    await api.accounts.setActive(id);
    setActiveAccountId(id);
  };

  const reloadInstances = () => {
    if (!api) return Promise.resolve([]);
    return api.instances.list().then((list) => {
      setLauncherInstances(list || []);
      return list || [];
    });
  };

  useEffect(() => {
    if (!api || activeSection !== "instances") return;
    if (launcherInstances.length === 0) reloadInstances();
  }, [api, activeSection]);

  // Subscribe to install/launch events
  useEffect(() => {
    if (!api) return;
    const offProgress = api.on("install:progress", (payload) => {
      if (!payload) return;
      setInstallProgress(payload);
      if (payload.taskId) setCurrentInstallTaskId(payload.taskId);
    });
    const offExit = api.on("launch:exit", (payload) => {
      setLaunchState("idle");
      setRunningPid(null);
      setRunningInstanceId(null);
      reloadInstances();
      // В shortcut-режиме: если Minecraft упал (launch:exit до minecraft_ready),
      // закрываем лаунчер, чтобы не висеть на заглушке 60 сек.
      if (shortcutLaunchIdRef.current) {
        api.app.exit().catch(() => {});
      }
    });
    const offMinecraftReady = api.on("launch:minecraft_ready", () => {
      if (shortcutLaunchIdRef.current) {
        api.app.exit().catch(() => {});
      }
    });
    const offAuto = api.on("app:autoLaunchInstance", (payload) => {
      if (payload && payload.id) setPendingAutoLaunchId(payload.id);
    });
    return () => {
      offProgress();
      offExit();
      offMinecraftReady();
      offAuto();
    };
  }, [api]);

  useEffect(() => {
    if (!pendingAutoLaunchId) return;
    const target = launcherInstances.find((i) => i.id === pendingAutoLaunchId);
    if (!target) return;
    // Если уже идёт запуск/установка — не дёргаем второй раз.
    if (launchState !== "idle") {
      setPendingAutoLaunchId(null);
      return;
    }
    setActiveSection("instances");
    setActiveInstanceId(target.id);
    setPendingAutoLaunchId(null);
    handlePlayInstance(target);
    // handlePlayInstance читается из текущего скоупа — линт ругнётся,
    // но это сознательно: пере-подписка на каждое изменение замыкания
    // вызвала бы двойной запуск. Зависим только от pendingAutoLaunchId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoLaunchId, launcherInstances]);

  const versionFilters = useMemo(() => {
    const versionsGroup = launcherSettings.find((group) => group.title === "Версии");
    if (!versionsGroup) return ["release"];
    return versionsGroup.rows.filter((row) => row.value).map((row) => row.filterKey);
  }, [launcherSettings]);

  const pinnedInstances = useMemo(
    () => pinnedIds.map((id) => launcherInstances.find((i) => i.id === id)).filter(Boolean),
    [pinnedIds, launcherInstances],
  );

  const memorySetting = useMemo(
    () => findRow(launcherSettings, "Память Java"),
    [launcherSettings],
  );

  const openSection = useCallback((sectionId) => setActiveSection(sectionId), []);

  const handleSortModeChange = useCallback((mode) => {
    setInstancesSort(mode);
    if (api) api.settings.set({ settings: { instancesSort: mode } }).catch(() => {});
  }, [api]);

  const handleSelectInstance = useCallback((id) => {
    setActiveInstanceId(id);
    if (api) api.instances.setLast(id).catch(() => {});
  }, [api]);

  useEffect(() => {
    if (activeSection === "instances") setInstancesMounted(true);
  }, [activeSection]);

  const handleSidebarCollapsedChange = (collapsed) => {
    setSidebarCollapsed(collapsed);
    if (api) {
      api.settings.set({ settings: { sidebarCollapsed: collapsed } }).catch(() => {});
    }
  };

  const persistSelection = (patch) => {
    if (!api) return;
    api.settings.set({ lastSelection: patch }).catch(() => {});
  };

  const persistSettings = (groups) => {
    if (!api) return;
    const versionsGroup = groups.find((g) => g.title === "Версии");
    const memoryRow = findRow(groups, "Память Java");
    const settingsPatch = {
      versionFilters: versionsGroup
        ? Object.fromEntries(versionsGroup.rows.map((r) => [r.filterKey, !!r.value]))
        : undefined,
      javaMemoryGb: memoryRow ? Number(memoryRow.value) : undefined,
    };
    api.settings.set({ settings: settingsPatch }).catch(() => {});
  };

  const onSelectVersion = (version) => {
    setSelectedVersion(version);
    setLoaderVersion(null);
    persistSelection({ mcVersion: version, loaderVersion: null });
  };

  const onSelectLoader = (next) => {
    setLoader(next);
    setLoaderVersion(null);
    persistSelection({ loader: next, loaderVersion: null });
  };

  const onSelectLoaderVersion = (version) => {
    setLoaderVersion(version);
    persistSelection({ loaderVersion: version });
  };

  const updateSetting = (groupTitle, rowLabel, nextValue) => {
    let updated;
    setLauncherSettings((current) => {
      updated = current.map((group) =>
        group.title !== groupTitle
          ? group
          : {
              ...group,
              rows: group.rows.map((row) =>
                row.label !== rowLabel ? row : { ...row, value: nextValue },
              ),
            },
      );
      return updated;
    });
    if (updated) persistSettings(updated);
  };

  const cycleSetting = (groupTitle, rowLabel) => {
    let updated;
    setLauncherSettings((current) => {
      updated = current.map((group) => {
        if (group.title !== groupTitle) return group;
        return {
          ...group,
          rows: group.rows.map((row) => {
            if (row.label !== rowLabel || !row.options) return row;
            const i = row.options.indexOf(row.value);
            const next = (i + 1) % row.options.length;
            return { ...row, value: row.options[next] };
          }),
        };
      });
      return updated;
    });
    if (updated) persistSettings(updated);
  };

  const handleThemeChange = (newThemeId) => {
    const appliedThemeId = applyTheme(newThemeId);
    setThemeId(appliedThemeId);
    try { window.localStorage.setItem("poshat-theme", appliedThemeId); } catch {}
    if (api) api.settings.set({ settings: { themeId: appliedThemeId } }).catch(() => {});
  };

  const finishOnboarding = () => {
    setOnboardingOpen(false);
    if (api) api.settings.set({ settings: { onboardingCompleted: true } }).catch(() => {});
  };

  const startOnboarding = () => {
    setActiveSection("home");
    setOnboardingOpen(true);
  };

  const handlePlay = async () => {
    if (!api || !selectedVersion) return;
    if (loader && loader !== "vanilla" && !loaderVersion) {
      toast.err("Сначала выбери версию загрузчика.");
      return;
    }
    // Защита от двойного клика: пока идёт установка/запуск/игра — игнор.
    if (launchState !== "idle") return;
    try {
      setLaunchState("installing");
      const installResult = await api.install.run({
        mcVersion: selectedVersion,
        loader,
        loaderVersion,
      });
      setCurrentInstallTaskId(null);
      setLaunchState("launching");
      const launchResult = await api.launch.run({
        mcVersion: selectedVersion,
        loader,
        loaderVersion,
        resolvedVersionId: installResult.resolvedVersionId,
        memoryGb: memorySetting ? Number(memorySetting.value) : 4,
      });
      setRunningPid(launchResult.pid);
      setRunningInstanceId(null);
      setLaunchState("running");
    } catch (err) {
      console.error(err);
      const msg = err && err.message ? err.message : String(err);
      toast.err(`Ошибка запуска: ${msg}`);
      setLaunchState("idle");
      setRunningInstanceId(null);
      setCurrentInstallTaskId(null);
    }
  };

  const handleStop = async () => {
    if (!api || !runningPid) return;
    await api.launch.kill(runningPid);
    setLaunchState("idle");
    setRunningPid(null);
    setRunningInstanceId(null);
  };

  const handleCancelInstall = async () => {
    if (!api || !currentInstallTaskId) return;
    try {
      await api.install.cancel(currentInstallTaskId);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePlayInstance = async (instance) => {
    if (!api || !instance) return;
    // Защита от двойного клика по карточке инстанса. См. handlePlay выше.
    if (launchState !== "idle") return;
    try {
      setActiveInstanceId(instance.id);
      setRunningInstanceId(instance.id);
      setLaunchState("installing");
      // КРИТИЧНО: install и launch должны указывать на ОДИН game_dir.
      // launch ниже передаёт instanceId → играет из <instance>/minecraft/.
      // Если install не передаст тот же instanceId, файлы лягут в shared,
      // а launch упадёт с os error 3 (клиент-jar не найден в папке инстанса).
      const installResult = await api.install.run({
        mcVersion: instance.mcVersion,
        loader: instance.loader || "vanilla",
        loaderVersion: instance.loaderVersion || null,
        instanceId: instance.id,
      });
      setCurrentInstallTaskId(null);
      setLaunchState("launching");
      const launchResult = await api.launch.run({
        mcVersion: instance.mcVersion,
        loader: instance.loader || "vanilla",
        loaderVersion: instance.loaderVersion || null,
        resolvedVersionId: installResult.resolvedVersionId,
        memoryGb: instance.memoryGb || (memorySetting ? Number(memorySetting.value) : 4),
        instanceId: instance.id,
      });
      setRunningPid(launchResult.pid);
      setLaunchState("running");
      api.instances.setLast(instance.id).catch(() => {});
      reloadInstances();
    } catch (err) {
      console.error(err);
      const msg = err && err.message ? err.message : String(err);
      if (shortcutLaunchIdRef.current === instance.id) {
        setShortcutLaunchError(msg);
      }
      toast.err(`Ошибка запуска: ${msg}`);
      setLaunchState("idle");
      setRunningInstanceId(null);
      setCurrentInstallTaskId(null);
    }
  };

  const handleStopInstance = async () => {
    if (!api) return;
    if (runningPid) {
      try {
        await api.launch.kill(runningPid);
      } catch (err) {
        console.error(err);
        toast.err(`Не удалось остановить: ${err?.message || err}`);
        return;
      }
    }
    setLaunchState("idle");
    setRunningPid(null);
    setRunningInstanceId(null);
  };

  const handleOpenInstanceFolder = (id) => {
    if (!api) return;
    api.instances.openFolder(id).catch((err) => {
      console.error(err);
      toast.err(`Не удалось открыть папку: ${err && err.message ? err.message : err}`);
    });
  };

  const handleDeleteInstance = async (id) => {
    if (!api) return;
    try {
      await api.instances.delete(id);
      const next = await reloadInstances();
      if (activeInstanceId === id) {
        setActiveInstanceId(next[0] ? next[0].id : null);
      }
      // Если удалили запущенный инстанс — обнуляем running-state.
      if (runningInstanceId === id) {
        setRunningInstanceId(null);
      }
    } catch (err) {
      toast.err(`Не удалось удалить: ${err && err.message ? err.message : err}`);
    }
  };

  const handleCreateInstance = async (payload) => {
    if (!api) throw new Error("API недоступен");
    const memoryGb = memorySetting ? Number(memorySetting.value) : 4;
    const instance = await api.instances.create({ ...payload, memoryGb });
    await reloadInstances();
    if (instance && instance.id) setActiveInstanceId(instance.id);
    return instance;
  };

  const handleCreateShortcut = async (id, shortcutName, iconBase64) => {
    if (!api) throw new Error("API недоступен");
    return api.instances.createShortcut(id, shortcutName, iconBase64);
  };

  const handleTogglePin = async (id) => {
    if (!api) return;
    const updated = await api.instances.togglePin(id);
    setPinnedIds(updated);
  };

  const handleSetIcon = async (id, base64Data) => {
    if (!api) throw new Error("API недоступен");
    const path = await api.instances.setIcon(id, base64Data);
    await reloadInstances();
    return path;
  };

  const handleSetCover = async (id, base64Data) => {
    if (!api) throw new Error("API недоступен");
    const path = await api.instances.setCover(id, base64Data);
    await reloadInstances();
    return path;
  };

  const [diskSizes, setDiskSizes] = useState({});
  const loadDiskSizes = async () => {
    if (!api || launcherInstances.length === 0) return;
    const results = await Promise.all(
      launcherInstances.map(async (inst) => {
        try {
          const size = await api.instances.diskSize(inst.id);
          return [inst.id, size];
        } catch {
          return [inst.id, null];
        }
      })
    );
    const next = {};
    for (const [id, size] of results) {
      if (size != null) next[id] = size;
    }
    setDiskSizes(next);
  };
  useEffect(() => {
    if (activeSection === "instances" && launcherInstances.length > 0) {
      const instanceIds = new Set(launcherInstances.map((i) => i.id));
      const staleKeys = Object.keys(diskSizes).filter((k) => !instanceIds.has(k));
      const missingIds = launcherInstances.filter((i) => !(i.id in diskSizes));
      if (Object.keys(diskSizes).length === 0 || staleKeys.length > 0 || missingIds.length > 0) {
        loadDiskSizes();
      }
    }
  }, [activeSection, launcherInstances, api]);

  const handleUpdateInstance = async (id, patch) => {
    if (!api) throw new Error("API недоступен");
    const updated = await api.instances.update(id, patch);
    await reloadInstances();
    return updated;
  };

  if (!bootReady) return <LaunchSplash />;

  if (shortcutLaunchId) {
    const instance = launcherInstances.find((item) => item.id === shortcutLaunchId);
    return (
      <ShortcutLaunchScreen
        name={instance?.name || "Minecraft"}
        launchState={launchState}
        progress={installProgress}
        error={shortcutLaunchError}
        onClose={() => api?.app.exit().catch(() => {})}
        onOpenLauncher={async () => {
          shortcutLaunchIdRef.current = null;
          setShortcutLaunchId(null);
          setShortcutLaunchError(null);
          setActiveSection("instances");
          await api?.app.showMain();
        }}
      />
    );
  }

  return (
    <main className="launcher-theme launcher-backdrop animate-app-ready h-screen overflow-hidden">
      <section className="relative flex h-full w-full gap-1.5 p-1.5">
        <Sidebar
          activeSection={activeSection}
          onSectionChange={openSection}
          accounts={launcherAccounts}
          selectedAccountId={activeAccountId}
          onSelectAccount={handleSelectAccount}
          pinnedInstances={pinnedInstances}
          onTogglePin={handleTogglePin}
          onPlayInstance={handlePlayInstance}
          runningInstanceId={runningInstanceId}
          launchState={launchState}
          collapsed={sidebarCollapsed}
          onCollapsedChange={handleSidebarCollapsedChange}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1 launcher-scroll">
            {(instancesMounted || activeSection === "instances") && (
              <div className={activeSection === "instances" ? "animate-section-enter min-h-full" : "hidden"}>
                <InstancesSection
                  items={launcherInstances}
                  activeInstanceId={activeInstanceId}
                  runningInstanceId={activeSection === "instances" ? runningInstanceId : null}
                  launchState={activeSection === "instances" ? launchState : "idle"}
                  installProgress={activeSection === "instances" ? installProgress : null}
                  filterTypes={versionFilters}
                  sortMode={instancesSort}
                  isActive={activeSection === "instances"}
                  onSortModeChange={handleSortModeChange}
                  onSelectInstance={handleSelectInstance}
                  onPlayInstance={handlePlayInstance}
                  onStopInstance={handleStopInstance}
                  onCancelInstall={handleCancelInstall}
                  onOpenFolder={handleOpenInstanceFolder}
                  onDeleteInstance={handleDeleteInstance}
                  onCreateInstance={handleCreateInstance}
                  onUpdateInstance={handleUpdateInstance}
                  onCreateShortcut={handleCreateShortcut}
                  onSetIcon={handleSetIcon}
                  onSetCover={handleSetCover}
                  onImportInstance={reloadInstances}
                  pinnedIds={pinnedIds}
                  onTogglePin={handleTogglePin}
                  diskSizes={diskSizes}
                />
              </div>
            )}
            {activeSection !== "instances" && (
            <div key={activeSection} className="animate-section-enter">
            {activeSection === "home" && (
              <HomeSection
                selectedVersion={selectedVersion}
                loader={loader}
                loaderVersion={loaderVersion}
                filterTypes={versionFilters}
                memorySetting={memorySetting}
                launchState={launchState}
                installProgress={installProgress}
                onSelectVersion={onSelectVersion}
                onSelectLoader={onSelectLoader}
                onSelectLoaderVersion={onSelectLoaderVersion}
                onPlay={handlePlay}
                onStop={handleStop}
                onCancel={handleCancelInstall}
                onConfigure={() => openSection("settings")}
              />
            )}
            {activeSection === "settings" && (
              <SettingsSection
                groups={launcherSettings}
                onCycleSetting={cycleSetting}
                onUpdateSetting={updateSetting}
                themeId={themeId}
                onThemeChange={handleThemeChange}
                onStartOnboarding={startOnboarding}
                animationsEnabled={animations.enabled}
                onToggleAnimations={animations.toggle}
              />
            )}
            {activeSection === "accounts" && (
              <AccountsSection
                accounts={launcherAccounts}
                activeAccountId={activeAccountId}
                onChanged={reloadAccounts}
              />
            )}
            {activeSection === "modsCatalog" && (
              <ModsCatalogSection
                instances={launcherInstances}
                activeInstanceId={activeInstanceId}
                onSelectInstance={handleSelectInstance}
              />
            )}
            </div>
            )}
          </div>
        </div>
      </section>
      {onboardingOpen && <OnboardingTour onFinish={finishOnboarding} />}
    </main>
  );
}

function LaunchSplash() {
  return (
    <main className="launch-splash">
      <img src="/poshat-logo.png" alt="" draggable={false} />
      <div>
        <strong>Poshat Launcher</strong>
        <span>Подготавливаем лаунчер</span>
      </div>
      <i aria-hidden="true"><b /></i>
    </main>
  );
}

function ShortcutLaunchScreen({ name, launchState, progress, error, onClose, onOpenLauncher }) {
  const status =
    launchState === "installing"
      ? (progress?.label || "Проверяем локальные файлы")
      : launchState === "launching"
        ? "Запускаем игру"
        : launchState === "running"
          ? "Игра запущена"
          : "Подготавливаем запуск";

  return (
    <main className="relative flex h-screen overflow-hidden bg-[#090c14] p-5 text-white">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400" />
      <button
        type="button"
        onClick={onClose}
        title="Закрыть"
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center text-zinc-500 transition hover:text-white"
      >
        <X size={17} />
      </button>

      <section className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex min-w-0 items-center gap-4 pr-8">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.05]">
            {error ? (
              <AlertTriangle size={25} className="text-rose-400" />
            ) : (
              <Gamepad2 size={27} className="text-violet-300" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-violet-300">POSHAT LAUNCHER</p>
            <h1 className="mt-1 truncate text-lg font-semibold">Запуск {name}</h1>
            <p className={`mt-1 truncate text-sm ${error ? "text-rose-300" : "text-zinc-400"}`}>
              {error || `${status}. Пожалуйста, подождите.`}
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onOpenLauncher}
              className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-[#090c14] transition hover:bg-zinc-200"
            >
              Открыть лаунчер
            </button>
          </div>
        ) : (
          <div className="mt-6 flex items-center gap-3">
            <LoaderCircle size={16} className="shrink-0 animate-spin text-cyan-300" />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-2/5 animate-pulse rounded-full bg-cyan-400" />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function findRow(groups, label) {
  for (const group of groups) {
    for (const row of group.rows) {
      if (row.label === label) return row;
    }
  }
  return null;
}
