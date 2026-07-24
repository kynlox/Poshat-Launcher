import { memo, useEffect, useMemo, useState } from "react";
import {
  Play,
  FolderOpen,
  FolderInput,
  Trash2,
  Plus,
  Loader2,
  Square,
  Settings,
  Search,
  ArrowDownUp,
  Check,
  Link2,
  Image,
  Download,
} from "lucide-react";
import { SectionTitle } from "@/components/Launcher/SectionTitle";
import LoaderIcons from "@/components/Launcher/LoaderIcons";
import { CreateInstanceModal } from "@/components/Launcher/CreateInstanceModal";
import { EditInstanceModal } from "@/components/Launcher/EditInstanceModal";
import InstanceIconPicker, { svgToPngBase64 } from "@/components/Launcher/InstanceIconPicker";
import { useInstalledVersions } from "@/hooks/useInstalledVersions";
import { useConfirm, useToast } from "@/components/ui/UIProvider";
import { poshatAPI } from "@/api/poshatAPI";

const PHOTO_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff";

const LOADER_LABEL = {
  vanilla: "Vanilla",
  fabric: "Fabric",
  quilt: "Quilt",
  forge: "Forge",
  neoforge: "NeoForge",
};

const LOADER_ACCENT = {
  vanilla: {
    bar: "bg-emerald-400/80",
    chip: "bg-emerald-400/15 text-emerald-200",
    icon: "from-emerald-400/30 to-cyan-400/20",
  },
  fabric: {
    bar: "bg-violet-400/80",
    chip: "bg-violet-400/15 text-violet-200",
    icon: "from-violet-400/30 to-fuchsia-400/20",
  },
  quilt: {
    bar: "bg-fuchsia-400/80",
    chip: "bg-fuchsia-400/15 text-fuchsia-200",
    icon: "from-fuchsia-400/30 to-pink-400/20",
  },
  forge: {
    bar: "bg-orange-400/80",
    chip: "bg-orange-400/15 text-orange-200",
    icon: "from-orange-400/30 to-red-400/20",
  },
  neoforge: {
    bar: "bg-amber-400/80",
    chip: "bg-amber-400/15 text-amber-200",
    icon: "from-amber-400/30 to-orange-400/20",
  },
};

const SORT_LABEL = {
  recent: "Сначала недавние",
  created: "Сначала новые",
  name: "По имени",
};
const SORT_ORDER = ["recent", "created", "name"];

function formatDate(iso) {
  if (!iso) return "никогда";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;

    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "только что";
    if (diffMin < 60) return `${diffMin} мин. назад`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} ч. назад`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "вчера";
    if (diffDays < 7) return `${diffDays} дн. назад`;

    return d.toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

function sortItems(items, mode) {
  const copy = items.slice();
  if (mode === "name") {
    copy.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));
    return copy;
  }
  if (mode === "created") {
    copy.sort((a, b) => {
      const aT = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bT = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bT - aT;
    });
    return copy;
  }
  copy.sort((a, b) => {
    const aP = a.lastPlayed ? Date.parse(a.lastPlayed) : 0;
    const bP = b.lastPlayed ? Date.parse(b.lastPlayed) : 0;
    if (bP !== aP) return bP - aP;
    const aC = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bC = b.createdAt ? Date.parse(b.createdAt) : 0;
    if (bC !== aC) return bC - aC;
    return (a.name || "").localeCompare(b.name || "", "ru");
  });
  return copy;
}

export const InstancesSection = memo(function InstancesSection({
  items,
  activeInstanceId,
  runningInstanceId,
  launchState,
  installProgress,
  filterTypes,
  sortMode = "recent",
  onSortModeChange,
  onSelectInstance,
  onPlayInstance,
  onStopInstance,
  onCancelInstall,
  onOpenFolder,
  onDeleteInstance,
  onCreateInstance,
  onUpdateInstance,
  onCreateShortcut,
  onSetIcon,
  onSetCover,
  onImportInstance,
  isActive = true,
  pinnedIds = [],
  onTogglePin,
  diskSizes = {},
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [shortcutTarget, setShortcutTarget] = useState(null);
  const [shortcutName, setShortcutName] = useState("");
  const [shortcutIcon, setShortcutIcon] = useState(null);
  const [shortcutActiveIconId, setShortcutActiveIconId] = useState(null);
  const [shortcutBusy, setShortcutBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [coverTarget, setCoverTarget] = useState(null);
  const [exportBusy, setExportBusy] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [opProgress, setOpProgress] = useState(null);

  useEffect(() => {
    if (!opProgress) return;
    if (opProgress.phase === "done") {
      const t = setTimeout(() => setOpProgress(null), 1200);
      return () => clearTimeout(t);
    }
  }, [opProgress]);

  useEffect(() => {
    const api = window.poshatAPI;
    if (!api) return;
    const off1 = api.on("export:progress", (p) => setOpProgress({ ...p, op: "export" }));
    const off2 = api.on("import:progress", (p) => setOpProgress({ ...p, op: "import" }));
    return () => { off1(); off2(); };
  }, []);

  useEffect(() => {
    if (editTarget || shortcutTarget || coverTarget) {
      document.body.style.overflow = "hidden";
      const scroll = document.querySelector(".launcher-scroll");
      if (scroll) scroll.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
        if (scroll) scroll.style.overflow = "";
      };
    }
  }, [editTarget, shortcutTarget, coverTarget]);

  const { installed } = useInstalledVersions(10000);

  const convertToCoverPng = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const targetW = 512;
          const targetH = 256;
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d");
          const imgRatio = img.width / img.height;
          const targetRatio = targetW / targetH;
          let sx, sy, sw, sh;
          if (imgRatio > targetRatio) {
            sh = img.height;
            sw = sh * targetRatio;
            sx = (img.width - sw) / 2;
            sy = 0;
          } else {
            sw = img.width;
            sh = sw / targetRatio;
            sx = 0;
            sy = (img.height - sh) / 2;
          }
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
          const b64 = canvas.toDataURL("image/png").split(",")[1];
          resolve(b64);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleCoverUpload = async (item, file) => {
    if (!onSetCover || !file) return;
    try {
      const b64 = await convertToCoverPng(file);
      await onSetCover(item.id, b64);
      toast.ok("Обложка обновлена");
    } catch (e) {
      toast.err(`Не удалось загрузить обложку: ${e && e.message ? e.message : e}`);
    }
  };

  const handleCoverClear = async (item) => {
    if (!onSetCover) return;
    try {
      await onSetCover(item.id, "");
      toast.ok("Обложка удалена");
    } catch (e) {
      toast.err(`Не удалось удалить обложку: ${e && e.message ? e.message : e}`);
    }
  };

  const isImageFile = (name) => {
    const ext = name.split(".").pop().toLowerCase();
    return ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "svg"].includes(ext);
  };

  const handleDrop = (item, e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (isImageFile(file.name)) {
      handleCoverUpload(item, file);
    } else {
      toast.err("Неподдерживаемый формат файла. Только изображения.");
    }
  };

  const openShortcutDialog = (item) => {
    setShortcutTarget(item);
    setShortcutName(item.name || "");
    setShortcutIcon(item.iconData || null);
    setShortcutActiveIconId(null);
  };

  const handleExport = async (item) => {
    setExportBusy(item.id);
    try {
      const result = await poshatAPI.instances.exportPack(item.id, item.name);
      if (result) toast.ok(`Экспортировано: ${result.path}`);
    } catch (e) {
      toast.err(`Не удалось экспортировать: ${e && e.message ? e.message : e}`);
    } finally {
      setExportBusy(null);
    }
  };

  const submitShortcut = async () => {
    if (!shortcutTarget || !onCreateShortcut) return;
    setShortcutBusy(true);
    try {
      const iconB64 = shortcutIcon
        ? (shortcutIcon.includes(",") ? shortcutIcon.split(",")[1] : shortcutIcon)
        : "";
      const result = await onCreateShortcut(shortcutTarget.id, shortcutName.trim(), iconB64 || undefined);
      setShortcutTarget(null);
      toast.ok(`Ярлык создан:\n${result.path}`);
    } catch (e) {
      toast.err(`Не удалось создать ярлык: ${e && e.message ? e.message : e}`);
    } finally {
      setShortcutBusy(false);
    }
  };

  const handleDelete = async (item) => {
    if (item.id === runningInstanceId && launchState !== "idle") {
      toast.err("Сначала останови запущенную сборку.");
      return;
    }
    const ok = await confirm({
      title: "Удалить сборку?",
      message: `«${item.name}» — папка и сейвы внутри будут удалены безвозвратно.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (ok) onDeleteInstance(item.id);
  };

  const handleImport = async () => {
    try {
      setImportBusy(true);
      const result = await poshatAPI.instances.importPack();
      if (result) {
        toast.ok(`Импортировано: ${result.name || result.id}`);
        onImportInstance?.();
      }
    } catch (e) {
      if (e && e.message && e.message.includes("cancelled")) return;
      toast.err(`Не удалось импортировать: ${e && e.message ? e.message : e}`);
    } finally {
      setImportBusy(false);
    }
  };

  const launchBusy =
    launchState === "installing" ||
    launchState === "launching" ||
    launchState === "running";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items;
    if (q) {
      list = items.filter((item) => {
        const text = `${item.name || ""} ${item.mcVersion || ""} ${item.loader || ""}`.toLowerCase();
        return text.includes(q);
      });
    }
    return sortItems(list, sortMode);
  }, [items, query, sortMode]);

  const cycleSort = () => {
    const i = SORT_ORDER.indexOf(sortMode);
    onSortModeChange?.(SORT_ORDER[(i + 1) % SORT_ORDER.length]);
  };

  return (
    <section className="flex min-h-full flex-col space-y-4">
        <div className="flex items-start justify-between gap-3">
        <SectionTitle
          eyebrow="Библиотека"
          title="Сборки"
          description="Отдельные игровые профили со своими версиями, загрузчиками, модами и памятью. Каждый запускается из своей папки."
        />
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={handleImport}
            disabled={importBusy}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.1] disabled:opacity-50"
          >
            {importBusy ? <Loader2 size={16} className="animate-spin" /> : <FolderInput size={16} />}
            Импорт
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-[#090b12] shadow-[0_18px_45px_rgba(255,255,255,0.12)] transition hover:scale-[1.02]"
          >
            <Plus size={16} /> Создать
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex flex-1 min-w-[200px] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-300">
            <Search size={14} className="shrink-0 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по имени, версии или загрузчику"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
            />
          </label>
          <button
            type="button"
            onClick={cycleSort}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/[0.07]"
          >
            <ArrowDownUp size={13} className="text-zinc-500" />
            {SORT_LABEL[sortMode]}
          </button>
          <span className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-400">
            Всего: {items.length}
            {query && filtered.length !== items.length ? ` · найдено ${filtered.length}` : ""}
          </span>
        </div>
      )}

      {items.length === 0 && (
        <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-8 text-center">
          <p className="text-sm text-zinc-300">Сборок пока нет.</p>
          <p className="mt-1 text-xs text-zinc-500">
            Нажми «Создать», выбери версию и загрузчик — получишь изолированный профиль.
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/15"
          >
            <Plus size={14} /> Создать первую сборку
          </button>
        </div>
      )}

      {items.length > 0 && filtered.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 text-center text-sm text-zinc-400">
          По запросу «{query}» ничего не найдено.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-2 lg:auto-rows-fr">
          {filtered.map((item) => {
            const active = item.id === activeInstanceId;
            const running = item.id === runningInstanceId;
            const busy =
              running && (launchState === "installing" || launchState === "launching");
            const playLocked = launchBusy && !running;
            const loaderId = item.loader || "vanilla";
            const loaderLabel = LOADER_LABEL[loaderId] || item.loader || "Vanilla";
            const accent = LOADER_ACCENT[loaderId] || LOADER_ACCENT.vanilla;
            const isInstalled = installed.has(item.mcVersion);

            return (
              <div
                key={item.id}
                onClick={() => onSelectInstance(item.id)}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => { e.stopPropagation(); handleDrop(item, e); }}
                className={`group relative cursor-pointer overflow-hidden rounded-3xl border p-5 transition ${
                  active
                    ? "border-violet-300/35 bg-violet-400/10 shadow-[0_18px_55px_rgba(139,92,246,0.18)]"
                    : "border-white/10 bg-theme-card/80 hover:border-white/20"
                }`}
              >
                {item.coverData ? (
                  <img
                    src={`data:image/png;base64,${item.coverData}`}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-15 pointer-events-none"
                  />
                ) : null}

                <span
                  className={`absolute left-0 top-0 h-full w-1 ${accent.bar}`}
                  aria-hidden
                />

                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${accent.icon} text-white overflow-hidden`}
                  >
                    {item.iconData ? (
                      <img
                        src={`data:image/png;base64,${item.iconData}`}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
                      />
                    ) : null}
                    <div className={`flex items-center justify-center ${item.iconData ? "hidden" : ""}`}>
                      {(() => { const Icon = LoaderIcons[loaderId] || LoaderIcons.vanilla; return <Icon size={24} />; })()}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-white">
                        {item.name}
                      </h3>
                      {running && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                          играет
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-zinc-500">
                      Minecraft {item.mcVersion}
                      {item.loaderVersion ? ` · ${item.loaderVersion}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${accent.chip}`}
                      >
                        {(() => { const Icon = LoaderIcons[loaderId] || LoaderIcons.vanilla; return <Icon className="w-3.5 h-3.5" />; })()}
                        {loaderLabel}
                      </span>
                      {isInstalled && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                          <Check size={10} />
                          скачано
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-2xl bg-white/[0.035] p-3 text-zinc-400">
                    Память
                    <br />
                    <span className="text-white">
                      {item.memoryGb ? `${item.memoryGb} GB` : "по умолч."}
                    </span>
                  </div>
                  <div className="rounded-2xl bg-white/[0.035] p-3 text-zinc-400">
                    Запуск
                    <br />
                    <span className="text-white">{formatDate(item.lastPlayed)}</span>
                  </div>
                  <div className="rounded-2xl bg-white/[0.035] p-3 text-zinc-400">
                    {diskSizes[item.id] != null ? (
                      <>
                        Размер
                        <br />
                        <span className="text-white">{formatSize(diskSizes[item.id])}</span>
                      </>
                    ) : (
                      <>
                        Создан
                        <br />
                        <span className="text-white">{formatDate(item.createdAt)}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (running && busy && onCancelInstall) onCancelInstall();
                      else if (running) onStopInstance(item.id);
                      else if (!busy && !playLocked) onPlayInstance(item);
                    }}
                    disabled={playLocked}
                    className={`flex flex-1 min-w-[120px] items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition ${
                      running
                        ? "bg-rose-400 text-[#250406] hover:bg-rose-300"
                        : "bg-white text-[#090b12] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                    }`}
                  >
                    {busy ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : running ? (
                      <Square className="fill-current" size={16} />
                    ) : (
                      <Play className="fill-[#090b12]" size={16} />
                    )}
                    {busy
                      ? launchState === "installing"
                        ? `Установка ${installProgress ? Math.max(0, Math.min(100, Math.round(Number(installProgress.percent) || 0))) + "%" : ""} · Отмена`
                        : "Запуск…"
                      : running
                        ? "Остановить"
                        : "Играть"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTarget(item);
                    }}
                    className="rounded-2xl bg-white/8 px-3.5 py-2.5 text-zinc-300 transition hover:bg-white/12"
                  >
                    <Settings size={16} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenFolder(item.id);
                    }}
                    className="rounded-2xl bg-white/8 px-3.5 py-2.5 text-zinc-300 transition hover:bg-white/12"
                  >
                    <FolderOpen size={16} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openShortcutDialog(item);
                    }}
                    className="rounded-2xl bg-white/8 px-3.5 py-2.5 text-zinc-300 transition hover:bg-white/12"
                  >
                    <Link2 size={16} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCoverTarget(coverTarget?.id === item.id ? null : item);
                    }}
                    className={`rounded-2xl px-3.5 py-2.5 transition ${
                      item.coverData
                        ? "bg-violet-500/15 text-violet-300 hover:bg-violet-500/25"
                        : "bg-white/8 text-zinc-300 hover:bg-white/12"
                    }`}
                  >
                    <Image size={16} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExport(item);
                    }}
                    disabled={exportBusy === item.id}
                    className="rounded-2xl bg-white/8 px-3.5 py-2.5 text-zinc-300 transition hover:bg-white/12 disabled:opacity-50"
                    title="Экспортировать сборку"
                  >
                    {exportBusy === item.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Download size={16} />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item);
                    }}
                    className="rounded-2xl bg-rose-500/15 px-3.5 py-2.5 text-rose-300 transition hover:bg-rose-500/25"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateInstanceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={onCreateInstance}
        filterTypes={filterTypes}
        instances={items}
      />

      <EditInstanceModal
        open={!!editTarget}
        instance={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={onUpdateInstance}
        onSetIcon={onSetIcon}
        filterTypes={filterTypes}
        instances={items}
      />

      {shortcutTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/[0.005]" onClick={() => setShortcutTarget(null)}>
          <div className="launcher-theme w-full max-w-md rounded-3xl border border-white/10 bg-theme-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Ярлык</p>
            <h2 className="mb-3 text-lg font-semibold">Создать ярлык на рабочем столе</h2>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs text-zinc-500">Имя ярлыка</span>
              <input
                value={shortcutName}
                onChange={(e) => setShortcutName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-violet-300/40"
                autoFocus
              />
            </label>
            <InstanceIconPicker
              currentIconData={shortcutIcon}
              activeId={shortcutActiveIconId}
              onSelect={(url, iconId) => {
                if (url && url.includes("image/svg+xml")) {
                  const svg = decodeURIComponent(escape(atob(url.split(",")[1])));
                  svgToPngBase64(svg).then((b64) => {
                    setShortcutIcon(b64 ? `data:image/png;base64,${b64}` : null);
                    setShortcutActiveIconId(iconId || null);
                  }).catch(() => {});
                } else {
                  setShortcutIcon(url);
                  setShortcutActiveIconId(null);
                }
              }}
              onUpload={(b64) => {
                setShortcutIcon(b64 ? `data:image/png;base64,${b64}` : null);
                setShortcutActiveIconId(null);
              }}
              compact
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShortcutTarget(null)}
                className="rounded-xl bg-white/5 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/10"
              >
                Отмена
              </button>
              <button
                disabled={shortcutBusy || !shortcutName.trim()}
                onClick={submitShortcut}
                className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
                  shortcutBusy || !shortcutName.trim()
                    ? "bg-white/20 text-zinc-500"
                    : "bg-white text-[#090b12] hover:bg-zinc-200"
                }`}
              >
                {shortcutBusy ? "Создание…" : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}

      {coverTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/[0.005]"
          onClick={() => setCoverTarget(null)}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => { e.stopPropagation(); handleDrop(coverTarget, e); }}
        >
          <div className="launcher-theme w-full max-w-md rounded-3xl border border-white/10 bg-theme-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Обложка</p>
            <h2 className="mb-4 text-lg font-semibold">Обложка сборки</h2>

            {coverTarget.coverData ? (
              <div className="mb-3 overflow-hidden rounded-2xl border border-white/10">
                <img
                  src={`data:image/png;base64,${coverTarget.coverData}`}
                  alt=""
                  className="h-32 w-full object-cover"
                />
              </div>
            ) : (
              <div className="mb-3 flex h-32 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.025] text-xs text-zinc-500">
                Фото не установлено
              </div>
            )}

            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer rounded-xl bg-white/10 px-4 py-2.5 text-center text-sm text-white transition hover:bg-white/15">
                Загрузить фото
                <input
                  type="file"
                  accept={PHOTO_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCoverUpload(coverTarget, file);
                    setCoverTarget(null);
                  }}
                />
              </label>
              {coverTarget.coverData && (
                <button
                  onClick={() => {
                    handleCoverClear(coverTarget);
                    setCoverTarget(null);
                  }}
                  className="rounded-xl bg-rose-500/15 px-4 py-2.5 text-sm text-rose-300 transition hover:bg-rose-500/25"
                >
                  Удалить
                </button>
              )}
            </div>

            <p className="mt-3 text-[10px] text-zinc-500">
              Поддерживаются: PNG, JPEG, WebP, GIF, BMP
            </p>
          </div>
        </div>
      )}

      {opProgress && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-3xl border border-white/10 bg-[#10141f] px-8 py-7 shadow-2xl">
            <div className="relative h-16 w-16">
              <div className="absolute inset-0 rounded-full border-4 border-white/10" />
              <div
                className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-400 transition-all duration-300"
                style={{
                  clipPath: `polygon(0 0, 100% 0, 100% ${opProgress.percent || 0}%, 0 ${opProgress.percent || 0}%)`,
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
                {opProgress.percent || 0}%
              </div>
            </div>
            <div className="w-full text-center">
              <p className="text-sm font-semibold text-white">
                {opProgress.op === "export" ? "Экспорт сборки" : "Импорт сборки"}
              </p>
              <p className="mt-1 text-xs text-zinc-400">{opProgress.label || "…"}</p>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all duration-300"
                style={{ width: `${opProgress.percent || 0}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
});
