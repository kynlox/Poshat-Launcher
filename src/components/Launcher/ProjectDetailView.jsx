import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Box,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  Users,
  Calendar,
  Package as PackageIcon,
} from "lucide-react";
import { useToast } from "@/components/ui/UIProvider";
const MarkdownView = lazy(() => import("@/components/ui/MarkdownView").then(m => ({ default: m.MarkdownView })));
import { Lightbox } from "@/components/ui/Lightbox";
import { openUrl } from "@tauri-apps/plugin-opener";

function formatDownloads(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

const REL_LABEL = { release: "Релиз", beta: "Beta", alpha: "Alpha" };
const REL_COLOR = {
  release: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  beta: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  alpha: "border-rose-400/30 bg-rose-400/10 text-rose-200",
};

// Подразделы детальной странички — тот же визуал, что и TABS в каталоге.
const DETAIL_TABS = [
  { id: "description", label: "Описание", icon: FileText },
  { id: "gallery", label: "Галерея", icon: ImageIcon },
  { id: "versions", label: "Версии", icon: ListChecks },
];

/**
 * Страничка мода/шейдера/паки. Открывается из ModsCatalogSection поверх списка.
 *
 * Сверху: hero (иконка, название, автор, статы, кнопка "Установить под инстанс").
 * Дальше: галерея, описание (Modrinth markdown).
 * Снизу: таблица всех версий с ручной кнопкой "Скачать".
 */
const SOURCE = "modrinth";

export function ProjectDetailView({
  projectId,
  projectType,
  initialName,
  initialIcon,
  activeInstance,
  onBack,
}) {
  const api = typeof window !== "undefined" ? window.poshatAPI : null;
  const toast = useToast();
  const [project, setProject] = useState(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [projectError, setProjectError] = useState(null);

  const [versions, setVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [versionsError, setVersionsError] = useState(null);

  const [installingId, setInstallingId] = useState(null);
  const [autoInstalling, setAutoInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState(null);
  const [filterToInstance, setFilterToInstance] = useState(false);
  const [installedFiles, setInstalledFiles] = useState([]);
  // Какой подраздел сейчас открыт: описание / галерея / версии.
  const [activeTab, setActiveTab] = useState("description");
  // Ручные фильтры на вкладке «Версии»: что юзер сам вписал/выбрал.
  // Пустые строки == «не фильтруем».
  const [mcVersionFilter, setMcVersionFilter] = useState("");
  const [loaderFilter, setLoaderFilter] = useState("");
  // По умолчанию показываем только Release (как Modrinth). Тоггл "Показать все"
  // включает snapshot/beta/alpha. Это самое частое поведение — релизы наверху,
  // нестабильные версии нужны только продвинутым пользователям.
  const [showAllReleases, setShowAllReleases] = useState(false);
  // Lightbox state: открываем поверх вьюхи. При закрытии освобождаем.
  const [lightbox, setLightbox] = useState(null); // { items, startIndex } | null
  // Open-стейты кастомных дропдаунов (нативные select/datalist не вписываются в тёмный UI).
  const [mcOpen, setMcOpen] = useState(false);
  const [loaderOpen, setLoaderOpen] = useState(false);
  const mcBoxRef = useRef(null);
  const loaderBoxRef = useRef(null);

  // Закрываем выпадашки кликом вне их области.
  useEffect(() => {
    if (!mcOpen && !loaderOpen) return;
    const onDown = (e) => {
      if (mcOpen && mcBoxRef.current && !mcBoxRef.current.contains(e.target)) {
        setMcOpen(false);
      }
      if (loaderOpen && loaderBoxRef.current && !loaderBoxRef.current.contains(e.target)) {
        setLoaderOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [mcOpen, loaderOpen]);

  const reloadInstalled = useCallback(async () => {
    if (!api || !activeInstance?.id) {
      setInstalledFiles([]);
      return;
    }
    try {
      const list = await api.catalog.installed({
        instanceId: activeInstance.id,
        projectType,
      });
      setInstalledFiles(Array.isArray(list) ? list : []);
    } catch {
      setInstalledFiles([]);
    }
  }, [api, activeInstance?.id, projectType]);

  useEffect(() => {
    reloadInstalled();
  }, [reloadInstalled]);

  // Загрузка проекта
  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    setLoadingProject(true);
    setProjectError(null);
    api.catalog
      .project({ source: SOURCE, projectId })
      .then((p) => {
        if (cancelled) return;
        setProject(p);
      })
      .catch((e) => {
        if (cancelled) return;
        setProjectError(e && e.message ? e.message : String(e));
      })
      .finally(() => !cancelled && setLoadingProject(false));
    return () => {
      cancelled = true;
    };
  }, [api, projectId]);

  // Загрузка версий
  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    setLoadingVersions(true);
    setVersionsError(null);
    api.catalog
      .versions({ source: SOURCE, projectId, projectType })
      .then((list) => {
        if (cancelled) return;
        setVersions(Array.isArray(list) ? list : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setVersionsError(e && e.message ? e.message : String(e));
      })
      .finally(() => !cancelled && setLoadingVersions(false));
    return () => {
      cancelled = true;
    };
  }, [api, projectId, projectType]);

  // Полный фильтр учитывает: чекбокс «под инстанс» + ручные поля «MC» и «Загрузчик»
  // + тоггл «показывать снапшоты/beta/alpha». Любое поле/опция работает
  // независимо, пустое не фильтрует.
  const filteredVersions = useMemo(() => {
    const mcInst = filterToInstance && activeInstance ? activeInstance.mcVersion : null;
    const ldInst = filterToInstance && activeInstance ? activeInstance.loader : null;
    const mcManual = mcVersionFilter.trim().toLowerCase();
    const ldManual = loaderFilter.trim().toLowerCase();

    return versions.filter((v) => {
      // Фильтр по типу релиза: по умолчанию пускаем только "release".
      if (!showAllReleases) {
        const rel = String(v.releaseType || "release").toLowerCase();
        if (rel !== "release") return false;
      }

      const gv = (v.gameVersions || []).map((x) => String(x).toLowerCase());
      const lds = (v.loaders || []).map((x) => String(x).toLowerCase());

      if (mcInst && !gv.includes(mcInst.toLowerCase())) return false;
      // mcManual: подстрочный поиск, чтоб '1.20' матчил '1.20.1', '1.20.4' и т.д.
      if (mcManual && !gv.some((g) => g.includes(mcManual))) return false;

      if (projectType === "mod") {
        if (ldInst && ldInst !== "vanilla" && !lds.includes(ldInst.toLowerCase())) return false;
        if (ldManual && !lds.includes(ldManual)) return false;
      }
      return true;
    });
  }, [versions, filterToInstance, activeInstance, projectType, mcVersionFilter, loaderFilter, showAllReleases]);

  // Считаем нестабильные версии, чтобы тоггл показывал «+N» и было понятно,
  // что прячется за выключенным фильтром.
  const prereleaseCount = useMemo(
    () => versions.filter((v) => {
      const rel = String(v.releaseType || "release").toLowerCase();
      return rel !== "release";
    }).length,
    [versions],
  );

  // Списки уникальных значений для подсказок (datalist) и select'а.
  const mcVersionOptions = useMemo(() => {
    const set = new Set();
    for (const v of versions) for (const g of v.gameVersions || []) set.add(g);
    return Array.from(set).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  }, [versions]);

  const loaderOptions = useMemo(() => {
    const set = new Set();
    for (const v of versions) for (const l of v.loaders || []) set.add(l);
    return Array.from(set).sort();
  }, [versions]);

  // Подсказки MC в выпадашке: фильтруем по тому что юзер уже напечатал.
  const mcSuggestions = useMemo(() => {
    const q = mcVersionFilter.trim().toLowerCase();
    if (!q) return mcVersionOptions;
    return mcVersionOptions.filter((v) => v.toLowerCase().includes(q));
  }, [mcVersionOptions, mcVersionFilter]);

  // Авто-установка под инстанс (использует обычный /install)
  const handleAutoInstall = async () => {
    if (!api || !activeInstance) {
      toast.err("Сначала выбери сборку.");
      return;
    }
    setAutoInstalling(true);
    setInstallMessage(null);
    try {
      const result = await api.catalog.install({
        source: SOURCE,
        projectId,
        instanceId: activeInstance.id,
        projectType,
        mcVersion: activeInstance.mcVersion,
        loader: activeInstance.loader,
      });
      setInstallMessage({
        type: "ok",
        text: `Установлено: ${result.fileName}`,
      });
      await reloadInstalled();
    } catch (e) {
      setInstallMessage({
        type: "err",
        text: e && e.message ? e.message : String(e),
      });
    } finally {
      setAutoInstalling(false);
    }
  };

  // Установка конкретной версии
  const handleInstallVersion = async (v) => {
    if (!api || !activeInstance) {
      toast.err("Сначала выбери сборку.");
      return;
    }
    setInstallingId(v.id);
    setInstallMessage(null);
    try {
      const result = await api.catalog.installVersion({
        source: SOURCE,
        projectId,
        versionId: v.id,
        instanceId: activeInstance.id,
        projectType,
      });
      setInstallMessage({
        type: "ok",
        text: `Установлено: ${result.fileName}`,
      });
      await reloadInstalled();
    } catch (e) {
      setInstallMessage({
        type: "err",
        text: e && e.message ? e.message : String(e),
      });
    } finally {
      setInstallingId(null);
    }
  };

  // Set имён установленных файлов — нужен для подсветки версий и счётчика "установлено".
  const installedSet = useMemo(
    () => new Set(installedFiles.map((f) => String(f).toLowerCase())),
    [installedFiles],
  );

  // Сколько вариантов мода установлено сейчас. Идея: если в имени файла встречается
  // slug или fileName какой-нибудь версии — считаем что это «наш» мод. Так подсвечивает
  // и старые версии, не только последнюю.
  const installedVersionCount = useMemo(() => {
    if (installedFiles.length === 0) return 0;
    const slug = (project?.slug || project?.id || "").toLowerCase();
    const versionFiles = new Set(
      versions.map((v) => (v.fileName || "").toLowerCase()).filter(Boolean),
    );
    let n = 0;
    for (const f of installedFiles) {
      const low = String(f).toLowerCase();
      if (versionFiles.has(low)) {
        n++;
        continue;
      }
      if (slug && low.includes(slug)) n++;
    }
    return n;
  }, [installedFiles, versions, project]);

  const name = project?.name || initialName || "Проект";
  const iconUrl = project?.iconUrl || initialIcon || null;

  return (
    <section className="space-y-3">
      {/* Хедер: назад + название источника */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.08]"
        >
          <ArrowLeft size={14} /> К каталогу
        </button>
        <span className="rounded-md bg-white/8 px-2 py-1 text-[10px] font-semibold uppercase text-zinc-400">
          Modrinth
        </span>
        {project?.pageUrl && (
          <button
            type="button"
            onClick={() =>
              openUrl(project.pageUrl).catch((e) =>
                toast.err(`Не удалось открыть ссылку: ${e?.message || e}`),
              )
            }
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
          >
            <ExternalLink size={12} /> Открыть на сайте
          </button>
        )}
      </div>

      {/* Hero */}
      <div className="project-detail-panel rounded-3xl border border-white/10 bg-gradient-to-br from-violet-400/10 via-[#0c0f17]/80 to-cyan-400/5 p-4">
        <div className="flex items-start gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-400/25 to-cyan-400/15 text-white">
            {iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={iconUrl}
                alt=""
                className="h-20 w-20 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Box size={32} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold text-white">{name}</h1>
            <p className="mt-1 line-clamp-2 text-sm text-zinc-300">
              {project?.summary || (loadingProject ? "Загрузка…" : "—")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
              {project?.author && (
                <span className="inline-flex items-center gap-1.5">
                  <Users size={12} /> {project.author}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Download size={12} /> {formatDownloads(project?.downloads || 0)}
              </span>
              {project?.license && (
                <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px]">
                  {project.license}
                </span>
              )}
              {(project?.categories || []).slice(0, 4).map((c) => (
                <span
                  key={c}
                  className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px]"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
          <button
            onClick={handleAutoInstall}
            disabled={autoInstalling || !activeInstance}
            className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold transition ${
              !activeInstance
                ? "bg-white/15 text-zinc-500"
                : autoInstalling
                ? "bg-white/15 text-zinc-300"
                : "bg-white text-[#090b12] hover:scale-[1.02]"
            }`}
          >
            {autoInstalling ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <Download size={14} />
            )}
            {autoInstalling
              ? "Качаю…"
              : activeInstance
              ? `Установить в «${activeInstance.name}»`
              : "Выбери сборку"}
          </button>
          {activeInstance && (
            <span className="text-xs text-zinc-500">
              авто-выбор версии под {activeInstance.loader} {activeInstance.mcVersion}
            </span>
          )}
        </div>

        {installMessage && (
          <p
            className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
              installMessage.type === "ok"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                : "border-rose-400/30 bg-rose-400/10 text-rose-100"
            }`}
          >
            {installMessage.text}
          </p>
        )}
      </div>

      {projectError && (
        <p className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200">
          {projectError}
        </p>
      )}

      {/* Подразделы — тот же визуал, что в каталоге компонентов */}
      <div className="grid grid-cols-3 gap-2">
        {DETAIL_TABS.map((t) => {
          const Icon = t.icon;
          const active = t.id === activeTab;
          const galleryEmpty =
            t.id === "gallery" && (!project?.gallery || project.gallery.length === 0);
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              disabled={galleryEmpty}
              className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                active
                  ? "border-violet-300/40 bg-violet-400/15 text-white shadow-[0_0_0_1px_rgba(167,139,250,0.2)]"
                  : galleryEmpty
                  ? "cursor-not-allowed border-white/5 bg-theme-card/40 text-zinc-600"
                  : "border-white/10 bg-theme-card/60 text-zinc-300 hover:border-white/25 hover:bg-white/[0.05]"
              }`}
            >
              <Icon size={16} /> {t.label}
              {t.id === "versions" && versions.length > 0 && (
                <span className="ml-1 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">
                  {versions.length}
                </span>
              )}
              {t.id === "gallery" && project?.gallery && (
                <span className="ml-1 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">
                  {project.gallery.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Подсветка: видим сколько версий мода реально лежит в инстансе */}
      {activeInstance && installedVersionCount > 0 && (
        <p className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-100">
          <Check size={12} /> В «{activeInstance.name}» установлено: {installedVersionCount}{" "}
          {installedVersionCount === 1 ? "файл" : "файлов"}
        </p>
      )}

      {/* ОПИСАНИЕ */}
      {activeTab === "description" && (
        <div className="rounded-2xl border border-white/10 bg-theme-card/80 p-5">
          {loadingProject ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
              <Loader2 className="animate-spin" size={16} /> Загрузка описания…
            </div>
          ) : project?.descriptionHtml || project?.descriptionMd ? (
            <Suspense fallback={<div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500"><Loader2 className="animate-spin" size={16} /></div>}>
              <MarkdownView
                html={project.descriptionHtml || null}
                md={project.descriptionMd || null}
                onImageClick={({ items, startIndex }) => setLightbox({ items, startIndex })}
              />
            </Suspense>
          ) : (
            <p className="text-sm text-zinc-500">У этого проекта нет описания.</p>
          )}
        </div>
      )}

      {/* ГАЛЕРЕЯ */}
      {activeTab === "gallery" && project?.gallery && project.gallery.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-theme-card/60 p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {project.gallery.map((img, idx) => (
              <button
                key={idx}
                onClick={() =>
                  setLightbox({
                    items: project.gallery.map((g) => ({
                      url: g.url,
                      title: g.title || g.description || "",
                    })),
                    startIndex: idx,
                  })
                }
                className="group relative aspect-video overflow-hidden rounded-xl border border-white/10 transition hover:border-violet-300/40 hover:shadow-[0_8px_28px_rgba(167,139,250,0.18)]"
              >
                <img
                  src={img.url}
                  alt={img.title || ""}
                  className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                {img.title && (
                  <span className="theme-force-dark pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2.5 py-1.5 text-left text-[10px] font-semibold text-white">
                    <span className="line-clamp-1">{img.title}</span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ВЕРСИИ */}
      {activeTab === "versions" && (
        <div className="rounded-2xl border border-white/10 bg-theme-card/80 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <h3 className="text-sm font-semibold text-white">
              {showAllReleases ? "Все версии" : "Релизы"}{" "}
              <span className="text-xs font-normal text-zinc-500">
                · {filteredVersions.length}/{versions.length}
              </span>
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {/* Тоггл «показать снапшоты/beta/alpha». По умолчанию выключен
                  → видны только release, как на странице мода в Modrinth. */}
              <button
                type="button"
                onClick={() => setShowAllReleases((v) => !v)}
                className={`group inline-flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  showAllReleases
                    ? "border-violet-300/40 bg-violet-400/15 text-violet-50"
                    : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
                }`}
              >
                <span
                  className={`flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition ${
                    showAllReleases
                      ? "justify-end bg-violet-400/80"
                      : "justify-start bg-white/15"
                  }`}
                >
                  <span className="h-3 w-3 rounded-full bg-white" />
                </span>
                <span>
                  Показывать все версии
                  {prereleaseCount > 0 && !showAllReleases && (
                    <span className="ml-1 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[9px] text-amber-100">
                      +{prereleaseCount}
                    </span>
                  )}
                </span>
              </button>

              {activeInstance && (
                <label className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-zinc-300">
                  <input
                    type="checkbox"
                    checked={filterToInstance}
                    onChange={(e) => setFilterToInstance(e.target.checked)}
                    className="h-3 w-3 accent-violet-400"
                  />
                  только под {activeInstance.loader} {activeInstance.mcVersion}
                </label>
              )}
            </div>
          </div>

          {/* Ручной фильтр: MC + загрузчик. Кастомные дропдауны в стиле лаунчера. */}
          <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
            {/* MC: input + кастомная выпадашка с подсказками */}
            <div
              ref={mcBoxRef}
              className="relative flex min-w-[200px] flex-1"
            >
              <div
                className={`flex w-full items-center gap-2 rounded-xl border bg-white/[0.03] px-3 py-2 transition ${
                  mcOpen
                    ? "border-violet-300/50 shadow-[0_0_0_1px_rgba(167,139,250,0.2)]"
                    : "border-white/10 focus-within:border-violet-300/40 hover:border-white/20"
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  MC
                </span>
                <input
                  type="text"
                  value={mcVersionFilter}
                  onChange={(e) => {
                    setMcVersionFilter(e.target.value);
                    setMcOpen(true);
                  }}
                  onFocus={() => setMcOpen(true)}
                  placeholder="любая (напр. 1.20.1)"
                  className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
                />
                {mcVersionFilter && (
                  <button
                    onClick={() => {
                      setMcVersionFilter("");
                      setMcOpen(false);
                    }}
                    className="rounded-full px-1.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-white"
                  >
                    ✕
                  </button>
                )}
                <button
                  onClick={() => setMcOpen((v) => !v)}
                  className="text-zinc-400 transition hover:text-white"
                >
                  <ChevronDown
                    size={14}
                    className={`transition ${mcOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
              {mcOpen && mcSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-theme-card/95 p-1 shadow-2xl backdrop-blur">
                  {mcSuggestions.map((v) => {
                    const selected = v === mcVersionFilter;
                    return (
                      <button
                        key={v}
                        onClick={() => {
                          setMcVersionFilter(v);
                          setMcOpen(false);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                          selected
                            ? "bg-violet-400/20 text-violet-50"
                            : "text-zinc-200 hover:bg-white/[0.06]"
                        }`}
                      >
                        <span className="font-semibold">{v}</span>
                        {selected && <Check size={12} className="text-violet-200" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {mcOpen && mcSuggestions.length === 0 && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1.5 rounded-xl border border-white/10 bg-theme-card/95 p-3 text-center text-[11px] text-zinc-500 shadow-2xl backdrop-blur">
                  Нет таких MC-версий
                </div>
              )}
            </div>

            {projectType === "mod" && (
              <div
                ref={loaderBoxRef}
                className="relative flex min-w-[200px] flex-1"
              >
                <button
                  onClick={() => setLoaderOpen((v) => !v)}
                  className={`flex w-full items-center gap-2 rounded-xl border bg-white/[0.03] px-3 py-2 text-left transition ${
                    loaderOpen
                      ? "border-violet-300/50 shadow-[0_0_0_1px_rgba(167,139,250,0.2)]"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Загрузчик
                  </span>
                  <span
                    className={`flex-1 truncate text-sm ${
                      loaderFilter ? "text-zinc-100" : "text-zinc-600"
                    }`}
                  >
                    {loaderFilter || "любой"}
                  </span>
                  {loaderFilter && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        setLoaderFilter("");
                      }}
                      className="cursor-pointer rounded-full px-1.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-white"
                    >
                      ✕
                    </span>
                  )}
                  <ChevronDown
                    size={14}
                    className={`text-zinc-400 transition ${loaderOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {loaderOpen && (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-theme-card/95 p-1 shadow-2xl backdrop-blur">
                    <button
                      onClick={() => {
                        setLoaderFilter("");
                        setLoaderOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                        !loaderFilter
                          ? "bg-violet-400/20 text-violet-50"
                          : "text-zinc-300 hover:bg-white/[0.06]"
                      }`}
                    >
                      <span>любой</span>
                      {!loaderFilter && <Check size={12} className="text-violet-200" />}
                    </button>
                    {loaderOptions.length === 0 && (
                      <p className="px-2.5 py-2 text-[11px] text-zinc-500">
                        У этого мода нет известных загрузчиков
                      </p>
                    )}
                    {loaderOptions.map((l) => {
                      const selected = l === loaderFilter;
                      return (
                        <button
                          key={l}
                          onClick={() => {
                            setLoaderFilter(l);
                            setLoaderOpen(false);
                          }}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                            selected
                              ? "bg-violet-400/20 text-violet-50"
                              : "text-zinc-200 hover:bg-white/[0.06]"
                          }`}
                        >
                          <span className="font-semibold capitalize">{l}</span>
                          {selected && <Check size={12} className="text-violet-200" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {(mcVersionFilter || loaderFilter) && (
              <button
                onClick={() => {
                  setMcVersionFilter("");
                  setLoaderFilter("");
                }}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/[0.08]"
              >
                Сбросить
              </button>
            )}

            {activeInstance && (
              <button
                onClick={() => {
                  setMcVersionFilter(activeInstance.mcVersion || "");
                  setLoaderFilter(
                    projectType === "mod" && activeInstance.loader !== "vanilla"
                      ? activeInstance.loader || ""
                      : "",
                  );
                }}
                className="rounded-xl border border-violet-300/30 bg-violet-400/10 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:bg-violet-400/20"
              >
                Под «{activeInstance.name}»
              </button>
            )}
          </div>

          {loadingVersions && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-400">
              <Loader2 className="animate-spin" size={16} /> Загрузка версий…
            </div>
          )}
          {versionsError && (
            <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-2.5 text-xs text-rose-200">
              {versionsError}
            </p>
          )}
          {!loadingVersions && filteredVersions.length === 0 && !versionsError && (
            <p className="rounded-xl border border-dashed border-white/15 bg-white/[0.025] p-4 text-center text-xs text-zinc-400">
              {filterToInstance && activeInstance
                ? `Нет версий под ${activeInstance.loader} ${activeInstance.mcVersion}. Сними галочку выше, чтобы видеть все.`
                : "Версий не найдено."}
            </p>
          )}

          <div className="space-y-1.5">
            {filteredVersions.map((v) => {
              const isInstalling = installingId === v.id;
              // Точное совпадение — самая надёжная подсветка: именно эта версия лежит в инстансе.
              const exactInstalled =
                !!v.fileName && installedSet.has(v.fileName.toLowerCase());
              return (
                <div
                  key={v.id}
                  className={`flex items-center gap-3 rounded-xl border p-2.5 transition ${
                    exactInstalled
                      ? "border-emerald-400/40 bg-emerald-400/[0.08] hover:bg-emerald-400/[0.12]"
                      : "border-white/10 bg-white/[0.025] hover:bg-white/[0.05]"
                  }`}
                >
                  <span
                    className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      REL_COLOR[v.releaseType] || REL_COLOR.release
                    }`}
                  >
                    {REL_LABEL[v.releaseType] || v.releaseType}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">
                        {v.versionNumber}
                      </p>
                      {exactInstalled && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-100">
                          <Check size={10} /> установлено
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate text-[11px] text-zinc-500">
                      <span className="inline-flex items-center gap-1">
                        <Calendar size={10} /> {formatDate(v.publishedAt)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Download size={10} /> {formatDownloads(v.downloads)}
                      </span>
                      {(v.loaders || []).length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <PackageIcon size={10} /> {v.loaders.join(", ")}
                        </span>
                      )}
                      {(v.gameVersions || []).length > 0 && (
                        <span className="truncate">
                          MC: {v.gameVersions.slice(0, 3).join(", ")}
                          {v.gameVersions.length > 3 ? "…" : ""}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => handleInstallVersion(v)}
                    disabled={isInstalling || !activeInstance || !v.canAutoDownload}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      !activeInstance || !v.canAutoDownload
                        ? "bg-white/15 text-zinc-500"
                        : isInstalling
                        ? "bg-white/15 text-zinc-300"
                        : exactInstalled
                        ? "bg-emerald-400/25 text-emerald-50 hover:bg-emerald-400/40"
                        : "bg-white text-[#090b12] hover:scale-[1.03]"
                    }`}
                  >
                    {isInstalling ? (
                      <Loader2 className="animate-spin" size={12} />
                    ) : exactInstalled ? (
                      <Check size={12} />
                    ) : v.canAutoDownload ? (
                      <Download size={12} />
                    ) : (
                      <Check size={12} />
                    )}
                    {isInstalling
                      ? "Качаю…"
                      : exactInstalled
                      ? "Уже стоит"
                      : v.canAutoDownload
                      ? "Скачать"
                      : "Недоступно"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lightbox для галереи и для картинок из описания. Рендерится поверх. */}
      {lightbox && (
        <Lightbox
          items={lightbox.items}
          startIndex={lightbox.startIndex}
          onClose={() => setLightbox(null)}
        />
      )}
    </section>
  );
}
