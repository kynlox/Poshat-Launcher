import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Play,
  FolderOpen,
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
  Video,
  Pin,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  X,
} from "lucide-react";
import { SectionTitle } from "@/components/Launcher/SectionTitle";
import LoaderIcons from "@/components/Launcher/LoaderIcons";
import { CreateInstanceModal } from "@/components/Launcher/CreateInstanceModal";
import { EditInstanceModal } from "@/components/Launcher/EditInstanceModal";
import InstanceIconPicker, { svgToPngBase64 } from "@/components/Launcher/InstanceIconPicker";
import { useInstalledVersions } from "@/hooks/useInstalledVersions";
import { useConfirm, useToast } from "@/components/ui/UIProvider";

const PHOTO_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff";
const VIDEO_ACCEPT = "video/mp4,video/webm,video/x-matroska,video/quicktime,video/x-msvideo,video/ogg,video/ogv";
const MAX_VIDEO_SECONDS = 3 * 60 * 60;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const LOADER_LABEL = {
  vanilla: "Vanilla",
  fabric: "Fabric",
  quilt: "Quilt",
  forge: "Forge",
  neoforge: "NeoForge",
};

// Цветовой акцент по загрузчику — позволяет глазами быстро отличать карточки
// в большой библиотеке. Совпадает с палитрой бейджей.
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

function VideoCover({ videoPath, itemId, revision = 0, className, muted = true, autoPlay = true, loop = true, controls = false, playsInline = true, preload = "metadata", onClick, onLoadedMetadata, onPause, onPlay, onTimeUpdate, videoRef }) {
  const sourceUrl = useMemo(() => {
    if (!videoPath) return null;
    const assetUrl = convertFileSrc(videoPath);
    return `${assetUrl}${assetUrl.includes("?") ? "&" : "?"}revision=${revision}`;
  }, [videoPath, revision]);
  if (!sourceUrl) return null;
  return (
    <video
      ref={videoRef}
      src={sourceUrl}
      className={className}
      muted={muted}
      autoPlay={autoPlay}
      loop={loop}
      controls={controls}
      playsInline={playsInline}
      preload={preload}
      onClick={onClick}
      onLoadedMetadata={onLoadedMetadata}
      onPause={onPause}
      onPlay={onPlay}
      onTimeUpdate={onTimeUpdate}
    />
  );
}

function FullscreenVideoCover({ startTime = 0, shouldPlay = false, ...props }) {
  const startTimeAppliedRef = useRef(false);

  const handleLoadedMetadata = useCallback((event) => {
    if (startTimeAppliedRef.current) return;
    startTimeAppliedRef.current = true;

    const video = event.currentTarget;
    if (startTime > 0) {
      const safeStartTime = Number.isFinite(video.duration)
        ? Math.min(startTime, video.duration)
        : startTime;
      video.currentTime = safeStartTime;
    }
    if (shouldPlay) video.play().catch(() => {});
  }, [startTime, shouldPlay]);

  return <VideoCover {...props} autoPlay={false} preload="auto" onLoadedMetadata={handleLoadedMetadata} />;
}

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
  // recent — по lastPlayed, потом createdAt, потом name
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

export function InstancesSection({
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
  onSetVideoCover,
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
  const [coverTab, setCoverTab] = useState("photo");

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
  const [videoRevisionMap, setVideoRevisionMap] = useState({});
  const [videoPausedMap, setVideoPausedMap] = useState({});
  const [videoMutedMap, setVideoMutedMap] = useState({});
  const [fullscreenPlayback, setFullscreenPlayback] = useState(null);
  const videoCardRefsMap = useRef({});
  const fullscreenVideoRef = useRef(null);
  const { installed } = useInstalledVersions(10000);

  const setVideoPaused = (itemId, paused) => {
    setVideoPausedMap((current) => (
      current[itemId] === paused ? current : { ...current, [itemId]: paused }
    ));
  };

  const toggleVideoPlayback = (itemId) => {
    const video = videoCardRefsMap.current[itemId];
    if (!video) return;
    if (video.paused) video.play().catch(() => setVideoPaused(itemId, true));
    else video.pause();
  };

  const toggleVideoMuted = (itemId) => {
    const video = videoCardRefsMap.current[itemId];
    if (!video) return;
    const nextMuted = !video.muted;

    if (!nextMuted) {
      Object.entries(videoCardRefsMap.current).forEach(([otherId, otherVideo]) => {
        if (!otherVideo || otherId === String(itemId)) return;
        otherVideo.muted = true;
      });
      setVideoMutedMap((current) => {
        const next = Object.fromEntries(Object.keys(videoCardRefsMap.current).map((id) => [id, true]));
        next[itemId] = false;
        return { ...current, ...next };
      });
    } else {
      setVideoMutedMap((current) => ({ ...current, [itemId]: true }));
    }
    video.muted = nextMuted;
  };

  const openFullscreen = (item) => {
    const cardVideo = videoCardRefsMap.current[item.id];
    const shouldPlay = !!cardVideo && !cardVideo.paused;
    const startTime = cardVideo?.currentTime || 0;
    cardVideo?.pause();
    setFullscreenPlayback({ item, startTime, shouldPlay, cardMuted: cardVideo?.muted ?? true });
  };

  const closeFullscreen = (resumeCard = true) => {
    if (!fullscreenPlayback) return;
    const { item, cardMuted } = fullscreenPlayback;
    const fullscreenVideo = fullscreenVideoRef.current;
    const cardVideo = videoCardRefsMap.current[item.id];
    const shouldResume = resumeCard && !!fullscreenVideo && !fullscreenVideo.paused;

    if (cardVideo && fullscreenVideo) {
      cardVideo.currentTime = fullscreenVideo.currentTime;
      cardVideo.muted = cardMuted;
    }
    fullscreenVideo?.pause();
    setFullscreenPlayback(null);

    if (cardVideo && shouldResume) {
      cardVideo.play().catch(() => setVideoPaused(item.id, true));
    } else if (cardVideo) {
      cardVideo.pause();
      setVideoPaused(item.id, true);
    }
  };

  useEffect(() => {
    if (isActive) return;

    const pausedIds = {};
    const mutedIds = {};
    Object.entries(videoCardRefsMap.current).forEach(([itemId, video]) => {
      if (!video) return;
      video.pause();
      video.muted = true;
      pausedIds[itemId] = true;
      mutedIds[itemId] = true;
    });
    setVideoPausedMap((current) => ({ ...current, ...pausedIds }));
    setVideoMutedMap((current) => ({ ...current, ...mutedIds }));

    if (fullscreenPlayback) closeFullscreen(false);
  }, [isActive]);

  // Синхронизируем editTarget / shortcutTarget с актуальными данными
  useEffect(() => {
    if (editTarget) {
      const fresh = items.find((i) => i.id === editTarget.id);
      if (fresh && fresh !== editTarget) setEditTarget(fresh);
    }
    if (shortcutTarget) {
      const fresh = items.find((i) => i.id === shortcutTarget.id);
      if (fresh && fresh !== shortcutTarget) {
        setShortcutTarget(fresh);
        setShortcutIcon(fresh.iconData || null);
      }
    }
  }, [items]);

  const openShortcutDialog = (item) => {
    setShortcutTarget(item);
    setShortcutName(item.name || "");
    setShortcutIcon(item.iconData || null);
    setShortcutActiveIconId(null);
  };

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

  const checkVideoDuration = (file) => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const vid = document.createElement("video");
      vid.preload = "metadata";
      vid.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        if (vid.duration > MAX_VIDEO_SECONDS) {
          reject(new Error(`Видео слишком длинное (макс. 3 часа, а у ${Math.round(vid.duration / 60)} мин.)`));
        } else {
          resolve(vid.duration);
        }
      };
      vid.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Не удалось прочитать видеофайл"));
      };
      vid.src = url;
    });
  };

  const handleVideoCoverUpload = async (item, file) => {
    if (!onSetVideoCover || !file) return;
    try {
      if (file.size > MAX_VIDEO_BYTES) {
        throw new Error("Видео слишком большое (макс. 50 МБ)");
      }
      await checkVideoDuration(file);
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
        reader.readAsDataURL(file);
      });
      await onSetVideoCover(item.id, file.name, b64);
      setVideoRevisionMap((current) => ({
        ...current,
        [item.id]: (current[item.id] || 0) + 1,
      }));
      toast.ok("Видео-обложка установлена");
    } catch (e) {
      toast.err(`Ошибка: ${e && e.message ? e.message : e}`);
    }
  };

  const handleVideoCoverClear = async (item) => {
    if (!onSetVideoCover) return;
    try {
      await onSetVideoCover(item.id, "", "");
      setVideoRevisionMap((current) => ({
        ...current,
        [item.id]: (current[item.id] || 0) + 1,
      }));
      toast.ok("Видео-обложка удалена");
    } catch (e) {
      toast.err(`Не удалось удалить: ${e && e.message ? e.message : e}`);
    }
  };

  const isVideoFile = (name) => {
    const ext = name.split(".").pop().toLowerCase();
    return ["mp4", "webm", "mkv", "avi", "mov", "ogv", "ogg"].includes(ext);
  };

  const isImageFile = (name) => {
    const ext = name.split(".").pop().toLowerCase();
    return ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "svg"].includes(ext);
  };

  const handleDrop = (item, e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (isVideoFile(file.name)) {
      setCoverTab("video");
      handleVideoCoverUpload(item, file);
    } else if (isImageFile(file.name)) {
      setCoverTab("photo");
      handleCoverUpload(item, file);
    } else {
      toast.err("Неподдерживаемый формат файла");
    }
  };
  const submitShortcut = async () => {
    if (!shortcutTarget || !onCreateShortcut) return;
    setShortcutBusy(true);
    try {
      // Иконка ярлыка — отдельная от иконки инстанса.
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
        <button
          onClick={() => setCreateOpen(true)}
          className="shrink-0 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-[#090b12] shadow-[0_18px_45px_rgba(255,255,255,0.12)] transition hover:scale-[1.02]"
        >
          <Plus size={16} /> Создать
        </button>
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
            const isVideoPaused = videoPausedMap[item.id] ?? true;
            const isVideoMuted = videoMutedMap[item.id] ?? false;

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
                {item.videoCoverPath ? (
                  <div className="absolute inset-0 pointer-events-none">
                    <VideoCover
                      videoPath={item.videoCoverPath}
                      itemId={item.id}
                      revision={videoRevisionMap[item.id] || 0}
                      className="h-full w-full object-cover opacity-25"
                      muted={isVideoMuted}
                      autoPlay={false}
                      preload="metadata"
                      onLoadedMetadata={(event) => {
                        const video = event.currentTarget;
                        if (video.currentTime === 0) video.currentTime = 0.04;
                      }}
                      videoRef={(el) => { videoCardRefsMap.current[item.id] = el; }}
                      onPause={() => setVideoPaused(item.id, true)}
                      onPlay={() => setVideoPaused(item.id, false)}
                    />
                  </div>
                ) : item.coverData ? (
                  <img
                    src={`data:image/png;base64,${item.coverData}`}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-15 pointer-events-none"
                  />
                ) : null}
                {item.videoCoverPath && (
                  <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleVideoPlayback(item.id);
                      }}
                      className="theme-force-dark pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
                      title={isVideoPaused ? "Продолжить обложку" : "Остановить обложку"}
                      aria-label={isVideoPaused ? "Продолжить видеообложку" : "Остановить видеообложку"}
                    >
                      {isVideoPaused ? <Play size={13} className="fill-current" /> : <Pause size={13} className="fill-current" />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleVideoMuted(item.id);
                      }}
                      className="theme-force-dark pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
                      title={isVideoMuted ? "Включить звук обложки" : "Выключить звук обложки"}
                      aria-label={isVideoMuted ? "Включить звук видеообложки" : "Выключить звук видеообложки"}
                    >
                      {isVideoMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openFullscreen(item);
                      }}
                      className="theme-force-dark pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70"
                      title="Полноэкранный режим"
                      aria-label="Открыть видеообложку в полноэкранном режиме"
                    >
                      <Maximize2 size={13} />
                    </button>
                  </div>
                )}
                {/* Цветная полоска слева — мгновенно отличает загрузчик. */}
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
                      setCoverTab("photo");
                    }}
                    className={`rounded-2xl px-3.5 py-2.5 transition ${
                      item.coverData || item.videoCoverPath
                        ? "bg-violet-500/15 text-violet-300 hover:bg-violet-500/25"
                        : "bg-white/8 text-zinc-300 hover:bg-white/12"
                    }`}
                  >
                    {item.videoCoverPath ? <Video size={16} /> : <Image size={16} />}
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

            {/* Tabs */}
            <div className="mb-4 flex gap-1 rounded-xl bg-white/5 p-1">
              <button
                onClick={() => setCoverTab("photo")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
                  coverTab === "photo"
                    ? "bg-violet-500/20 text-violet-200"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Image size={14} /> Фото
              </button>
              <button
                onClick={() => setCoverTab("video")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
                  coverTab === "video"
                    ? "bg-violet-500/20 text-violet-200"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Video size={14} /> Видео
              </button>
            </div>

            {/* Preview */}
            {coverTab === "photo" && coverTarget.coverData ? (
              <div className="mb-3 overflow-hidden rounded-2xl border border-white/10">
                <img
                  src={`data:image/png;base64,${coverTarget.coverData}`}
                  alt=""
                  className="h-32 w-full object-cover"
                />
              </div>
            ) : coverTab === "video" && coverTarget.videoCoverPath ? (
              <div className="mb-3 overflow-hidden rounded-2xl border border-white/10">
                <VideoCover
                  videoPath={coverTarget.videoCoverPath}
                  itemId={coverTarget.id}
                  revision={videoRevisionMap[coverTarget.id] || 0}
                  className="h-32 w-full object-cover"
                />
              </div>
            ) : (
              <div className="mb-3 flex h-32 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.025] text-xs text-zinc-500">
                {coverTab === "photo" ? "Фото не установлено" : "Видео не установлено"}
              </div>
            )}

            {/* Upload buttons */}
            <div className="flex gap-2">
              {coverTab === "photo" ? (
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
              ) : (
                <label className="flex-1 cursor-pointer rounded-xl bg-white/10 px-4 py-2.5 text-center text-sm text-white transition hover:bg-white/15">
                  Загрузить видео
                  <input
                    type="file"
                    accept={VIDEO_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleVideoCoverUpload(coverTarget, file);
                      setCoverTarget(null);
                    }}
                  />
                </label>
              )}
              {((coverTab === "photo" && coverTarget.coverData) || (coverTab === "video" && coverTarget.videoCoverPath)) && (
                <button
                  onClick={() => {
                    if (coverTab === "photo") handleCoverClear(coverTarget);
                    else handleVideoCoverClear(coverTarget);
                    setCoverTarget(null);
                  }}
                  className="rounded-xl bg-rose-500/15 px-4 py-2.5 text-sm text-rose-300 transition hover:bg-rose-500/25"
                >
                  Удалить
                </button>
              )}
            </div>

            <p className="mt-3 text-[10px] text-zinc-500">
              {coverTab === "photo"
                ? "Поддерживаются: PNG, JPEG, WebP, GIF, BMP"
                : "Поддерживаются: MP4, WebM, MKV, AVI, MOV · Макс. 3 часа · Файл хранится только на вашем ПК"}
            </p>
          </div>
        </div>
      )}

      {fullscreenPlayback && (
        <div
          className="theme-force-dark fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-5"
          onClick={() => closeFullscreen(true)}
        >
          <button
            onClick={() => closeFullscreen(true)}
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            title="Закрыть полноэкранный режим"
            aria-label="Закрыть полноэкранный режим"
          >
            <X size={20} />
          </button>
          <FullscreenVideoCover
            key={`${fullscreenPlayback.item.id}:${videoRevisionMap[fullscreenPlayback.item.id] || 0}`}
            videoPath={fullscreenPlayback.item.videoCoverPath}
            itemId={fullscreenPlayback.item.id}
            revision={videoRevisionMap[fullscreenPlayback.item.id] || 0}
            className="h-[calc(100vh-40px)] w-[calc(100vw-40px)] rounded-xl object-contain"
            controls={true}
            muted={false}
            loop={true}
            startTime={fullscreenPlayback.startTime}
            shouldPlay={fullscreenPlayback.shouldPlay}
            videoRef={(element) => { fullscreenVideoRef.current = element; }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </section>
  );
}
