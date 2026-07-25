// Шим `window.poshatAPI` — drop-in замена Electron preload-контракта на Tauri.
//
// Полный UI (page.jsx + 22 компонента) переехал из Electron-сборки как есть.
// Он зовёт `window.poshatAPI.xxx` в десятках мест: settings/accounts/instances/
// install/launch/catalog/loaders/versions/offlineNickname. Большая часть этих
// бэк-сервисов ещё НЕ портирована на Rust — мы делаем это поэтапно.
//
// Чтобы UI не падал при первом монтировании, заглушки возвращают БЕЗОПАСНЫЕ
// пустые значения: list() → [], active() → null. Действия (install, launch, ...)
// отвергают Promise с человечным русским текстом — UI поймает его и покажет
// через стилизованный toast.err из UIProvider.
//
// Когда соответствующая фаза будет портирована — заглушку заменяем реальным
// invoke(...). UI трогать не надо.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";

// -------- типы --------
export interface VersionFilters {
  release: boolean;
  snapshot: boolean;
  old_beta: boolean;
  old_alpha: boolean;
}

export interface Settings {
  versionFilters: VersionFilters;
  javaMemoryGb: number;
  mcWindowWidth: number;
  mcWindowHeight: number;
  /** "default" | "g1" | "zgc" | "shenandoah" */
  gcType: string;
  extraJvmArgs: string;
  launcherWindowWidth: number;
  launcherWindowHeight: number;
  instancesSort: "recent" | "created" | "name";
  themeId: string;
  pinnedInstances: string[];
  sidebarCollapsed: boolean;
  onboardingCompleted: boolean;
}

export interface LastSelection {
  mcVersion: string | null;
  loader: string;
  loaderVersion: string | null;
}

export interface Roots {
  root: string;
  instances: string;
  shared: string;
  runtime: string;
  java: string;
  storeFile: string;
}

export interface VersionEntry {
  id: string;
  type: string;
  releaseTime: string | null;
  url: string | null;
  sha1: string | null;
}

export interface VersionListArgs {
  types?: string[];
  order?: "asc" | "desc";
  force?: boolean;
}

// Возвращается из loaders.list(loader, mc).
export interface LoaderVersion {
  version: string;
  stable: boolean;
  tag?: string | null;
}

// Возвращается из install.run(...). taskId нужен, чтобы потом отменить
// конкретную установку. resolvedVersionId — id профиля, под которым
// версия легла в `<shared>/versions/` (для лоадера это что-то вроде
// "fabric-loader-0.16.0-1.21.4").
export interface InstallResult {
  taskId: string;
  resolvedVersionId: string;
}

// Комбо-объект, который UI получает из settings.get(). Это снапшот всего стора.
export interface StoreSnapshot {
  settings: Settings;
  lastSelection: LastSelection;
  offlineNickname: string;
  lastInstanceId: string | null;
}

// Комбо-патч в settings.set(patch). Любое поле опционально.
export interface StorePatch {
  settings?: Partial<Settings>;
  lastSelection?: Partial<LastSelection>;
  offlineNickname?: string;
  lastInstanceId?: string | null;
}

// -------- основной шим --------
export const poshatAPI = {
  app: {
    startupInstance: (): Promise<string | null> =>
      invoke<string | null>("get_startup_instance_id"),
    hide: (): Promise<void> => invoke<void>("hide_main_window"),
    showMain: (): Promise<void> => invoke<void>("show_main_window"),
    exit: (): Promise<void> => invoke<void>("exit_app"),
  },
  // settings.get() = комбо-снапшот всего стора. Собираем 3 параллельных запроса.
  // settings.set(patch) — диспатчим патч по подкомандам.
  // lastInstanceId пока no-op (нужен только когда появится instancesService).
  settings: {
    async get(): Promise<StoreSnapshot> {
      const [settings, lastSelection, offlineNickname, lastInstanceId] = await Promise.all([
        invoke<Settings>("get_settings"),
        invoke<LastSelection>("get_last_selection"),
        invoke<string>("get_offline_nickname"),
        invoke<string | null>("get_last_instance_id"),
      ]);
      return { settings, lastSelection, offlineNickname, lastInstanceId };
    },
    async set(patch: StorePatch): Promise<StoreSnapshot> {
      const tasks: Promise<unknown>[] = [];
      if (patch.settings) {
        tasks.push(invoke("set_settings", { patch: patch.settings }));
      }
      if (patch.lastSelection) {
        tasks.push(invoke("set_last_selection", { patch: patch.lastSelection }));
      }
      if (patch.offlineNickname !== undefined) {
        tasks.push(invoke("set_offline_nickname", { name: patch.offlineNickname }));
      }
      if (patch.lastInstanceId !== undefined) {
        tasks.push(invoke("set_last_instance_id", { id: patch.lastInstanceId }));
      }
      await Promise.all(tasks);
      return await poshatAPI.settings.get();
    },
  },

  roots: {
    get: (): Promise<Roots> => invoke<Roots>("get_roots"),
  },

  lastSelection: {
    get: (): Promise<LastSelection> => invoke<LastSelection>("get_last_selection"),
    set: (patch: Partial<LastSelection>): Promise<LastSelection> =>
      invoke<LastSelection>("set_last_selection", { patch }),
  },

  offlineNickname: {
    get: (): Promise<string> => invoke<string>("get_offline_nickname"),
    set: (name: string): Promise<string> =>
      invoke<string>("set_offline_nickname", { name }),
  },

  versions: {
    list: (args?: VersionListArgs): Promise<VersionEntry[]> =>
      invoke<VersionEntry[]>("versions_list", {
        types: args?.types ?? null,
        order: args?.order ?? null,
        force: args?.force ?? null,
      }),
    latest: (): Promise<VersionEntry | null> =>
      invoke<VersionEntry | null>("versions_latest"),
    refresh: (): Promise<VersionEntry[]> =>
      invoke<VersionEntry[]>("versions_refresh"),
    installed: (): Promise<string[]> => invoke<string[]>("versions_installed"),
  },

  // ---------- install / loaders ----------
  loaders: {
    // Бэк возвращает [{ version, stable, tag? }]. UI исторически читает
    // .loaderVersion (Electron-контракт), поэтому переименовываем поле
    // на лету. Так Rust-код остаётся с логичным `version`, а UI не трогаем.
    list: async (
      loader: string,
      mcVersion: string,
    ): Promise<Array<{ loaderVersion: string; stable: boolean; tag?: string | null }>> => {
      const raw = await invoke<LoaderVersion[]>("loaders_list", { loader, mcVersion });
      return raw.map((r) => ({
        loaderVersion: r.version,
        stable: r.stable,
        tag: r.tag ?? null,
      }));
    },
  },

  install: {
    // Аргументы — те же, что были в Electron-API: { mcVersion, loader,
    // loaderVersion, nickname?, instanceId? }. Если ник не передан, бэк
    // возьмёт дефолтный из store. instanceId переключает game_dir на
    // папку инстанса; без него лоадеры и версии ставятся в shared.
    run: (args: {
      mcVersion: string;
      loader?: string;
      loaderVersion?: string | null;
      nickname?: string;
      instanceId?: string | null;
    }): Promise<InstallResult> =>
      invoke<InstallResult>("install_run", {
        mcVersion: args.mcVersion,
        loader: args.loader ?? "vanilla",
        loaderVersion: args.loaderVersion ?? null,
        nickname: args.nickname ?? "",
        instanceId: args.instanceId ?? null,
      }),
    // Бэк держит реестр TaskHandle по taskId; нет такого id → возвращает
    // false. UI это игнорирует — просто захочет, чтобы экран отмены закрылся.
    cancel: (taskId: string): Promise<boolean> =>
      invoke<boolean>("install_cancel", { taskId }),
  },

  launch: {
    // UI шлёт { mcVersion, loader, loaderVersion, resolvedVersionId,
    //          javaPath, memoryGb, instanceId? }.
    // На бэке нужны mcVersion+loader+loaderVersion+memoryGb+nickname+instanceId.
    // resolvedVersionId / javaPath игнорим: lyceris собирает их сама
    // по тому же game_dir, что использовала при установке.
    run: (args: {
      mcVersion: string;
      loader?: string;
      loaderVersion?: string | null;
      memoryGb?: number;
      nickname?: string;
      instanceId?: string | null;
    }): Promise<{ pid: number }> =>
      invoke<{ pid: number }>("launch_run", {
        mcVersion: args.mcVersion,
        loader: args.loader ?? "vanilla",
        loaderVersion: args.loaderVersion ?? null,
        memoryGb: args.memoryGb ?? 4,
        nickname: args.nickname ?? "",
        instanceId: args.instanceId ?? null,
      }),
    kill: (pid: number): Promise<void> => invoke<void>("launch_kill", { pid }),
  },

  // Каталог модов/шейдеров/паков. Все payloads пробрасываем как есть в
  // Tauri-команду — бэк сам разберёт по полям (UI передаёт camelCase,
  // serde на стороне Rust уже его маппит).
  catalog: {
    search: (payload: {
      source: string;
      query?: string;
      projectType: string;
      mcVersion?: string | null;
      loader?: string | null;
      limit?: number;
      sort?: string;
    }): Promise<unknown[]> => invoke<unknown[]>("catalog_search", { payload }),
    install: (payload: {
      source: string;
      projectId: string;
      instanceId: string;
      projectType: string;
      mcVersion?: string | null;
      loader?: string | null;
    }): Promise<unknown> => invoke<unknown>("catalog_install", { payload }),
    installVersion: (payload: {
      source: string;
      projectId: string;
      versionId: string;
      instanceId: string;
      projectType: string;
    }): Promise<unknown> => invoke<unknown>("catalog_install_version", { payload }),
    project: (payload: { source: string; projectId: string }): Promise<unknown> =>
      invoke<unknown>("catalog_project", { payload }),
    versions: (payload: {
      source: string;
      projectId: string;
      projectType: string;
      mcVersion?: string | null;
      loader?: string | null;
    }): Promise<unknown[]> => invoke<unknown[]>("catalog_versions", { payload }),
    installed: (payload: {
      instanceId: string;
      projectType: string;
    }): Promise<string[]> => invoke<string[]>("catalog_installed", { payload }),
    remove: (payload: {
      instanceId: string;
      projectType: string;
      fileName: string;
    }): Promise<boolean> => invoke<boolean>("catalog_remove", { payload }),
    checkUpdates: (payload: {
      instanceId: string;
    }): Promise<unknown[]> => invoke<unknown[]>("catalog_check_updates", { payload }),
    verifyFiles: (payload: {
      instanceId: string;
    }): Promise<unknown[]> => invoke<unknown[]>("catalog_verify_files", { payload }),
    updateMod: (payload: {
      instanceId: string;
      fileName: string;
      versionId: string;
      projectType: string;
    }): Promise<unknown> => invoke<unknown>("catalog_update_mod", { payload }),
  },

  instances: {
    list: (): Promise<unknown[]> => invoke<unknown[]>("instances_list"),
    get: (id: string): Promise<unknown> => invoke<unknown>("instances_get", { id }),
    create: (payload: {
      name: string;
      mcVersion: string;
      loader?: string;
      loaderVersion?: string | null;
      memoryGb?: number;
    }): Promise<unknown> => invoke<unknown>("instances_create", { payload }),
    update: (id: string, patch: Record<string, unknown>): Promise<unknown> =>
      invoke<unknown>("instances_update", { id, patch }),
    rename: (id: string, name: string): Promise<unknown> =>
      invoke<unknown>("instances_rename", { id, name }),
    delete: (id: string): Promise<boolean> => invoke<boolean>("instances_delete", { id }),
    duplicate: (id: string): Promise<unknown> => invoke<unknown>("instances_duplicate", { id }),
    exportPack: async (id: string, name?: string): Promise<unknown> => {
      const path = await save({
        defaultPath: `${name || "instance"}.mrpack`,
        filters: [{ name: "Modrinth pack", extensions: ["mrpack"] }],
      });
      if (!path) return null;
      return invoke<unknown>("instances_export_pack", { id, outPath: path });
    },
    importPack: async (): Promise<unknown | null> => {
      const path = await open({
        multiple: false,
        filters: [{ name: "Modrinth pack", extensions: ["mrpack", "zip"] }],
      });
      if (!path || Array.isArray(path)) return null;
      return invoke<unknown>("instances_import_pack", { path });
    },
    cancelExport: (): Promise<boolean> => invoke<boolean>("instances_cancel_export"),
    cancelImport: (): Promise<boolean> => invoke<boolean>("instances_cancel_import"),
    setLast: (id: string | null): Promise<void> =>
      invoke<void>("set_last_instance_id", { id }).then(() => undefined),
    openFolder: (id: string): Promise<void> => invoke<void>("instances_open_folder", { id }),
    createShortcut: (id: string, name?: string, iconBase64?: string): Promise<unknown> =>
      invoke<unknown>("instances_create_shortcut", {
        id,
        shortcutName: name ?? null,
        iconBase64: iconBase64 ?? null,
      }),
    setIcon: (id: string, icon: string): Promise<string> =>
      invoke<string>("instances_set_icon", { id, icon }),
    getIcon: (id: string): Promise<string | null> =>
      invoke<string | null>("instances_get_icon", { id }),
    setCover: (id: string, cover: string): Promise<string> =>
      invoke<string>("instances_set_cover", { id, cover }),
    getCover: (id: string): Promise<string | null> =>
      invoke<string | null>("instances_get_cover", { id }),
    diskSize: (id: string): Promise<number> =>
      invoke<number>("instances_disk_size", { id }),
    togglePin: (id: string): Promise<string[]> =>
      invoke<string[]>("instances_toggle_pin", { id }),
    getPinned: (): Promise<string[]> =>
      invoke<string[]>("instances_get_pinned"),
  },

  accounts: {
    list: (): Promise<unknown[]> => invoke<unknown[]>("accounts_list"),
    active: (): Promise<unknown | null> =>
      invoke<unknown | null>("accounts_active"),
    setActive: (id: string | null): Promise<void> =>
      invoke<void>("accounts_set_active", { id }).then(() => undefined),
    remove: (id: string): Promise<void> =>
      invoke<boolean>("accounts_remove", { id }).then(() => undefined),
    addOffline: (name: string): Promise<unknown> =>
      invoke<unknown>("accounts_add_offline", { name }),
    elybyLogin: (username: string, password: string): Promise<unknown> =>
      invoke<unknown>("accounts_elyby_login", { username, password }),
    elybyRefresh: (id: string): Promise<unknown> =>
      invoke<unknown>("accounts_elyby_refresh", { id }),
  },

  // Системные действия раздела «Настройки».
  // openRootFolder — проводник на корне ~/.poshatlauncher.
  // clearCache — удаляет shared/. Инстансы не трогает, пользовательские саве сохраняются.
  system: {
    openRootFolder: (): Promise<void> => invoke<void>("open_root_folder"),
    clearSharedCache: (): Promise<number> => invoke<number>("clear_shared_cache"),
  },

  // События. В Electron preload API был СИНХРОННЫМ: const off = api.on(...),
  // а потом в cleanup React-эффекта вызывали off(). Tauri listen() — async,
  // возвращает Promise<UnlistenFn>. Чтобы не править весь UI, оборачиваем:
  // возвращаем sync-функцию, которая внутри ждёт промис и вызывает unlisten.
  // Поддерживаем гонку: если cleanup сработал ДО того как listener успел
  // зарегистрироваться — ставим флаг и отписываемся сразу при появлении fn.
  on(event: string, handler: (payload: unknown) => void): () => void {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    listen(event, (e) => {
      if (!disposed) handler(e.payload);
    })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((err) => {
        console.error(`[poshatAPI.on] failed to listen ${event}`, err);
      });
    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };
  },
};

declare global {
  interface Window {
    poshatAPI: typeof poshatAPI;
  }
}
window.poshatAPI = poshatAPI;
