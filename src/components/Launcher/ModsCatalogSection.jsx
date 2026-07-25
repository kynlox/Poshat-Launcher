import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Check,
  ChevronDown,
  Download,
  FolderOpen,
  Heart,
  Image,
  Layers,
  Loader2,
  Package,
  Palette,
  Search,
  Trash2,
} from "lucide-react";
import { EmptyState } from "@/components/Launcher/EmptyState";
import { ProjectDetailView } from "@/components/Launcher/ProjectDetailView";
import { useConfirm, useToast } from "@/components/ui/UIProvider";

// Подразделы каталога — соответствуют project_type у Modrinth.
const TABS = [
  { id: "mod", label: "Моды", icon: Package, folder: "mods" },
  { id: "shader", label: "Шейдеры", icon: Palette, folder: "shaderpacks" },
  { id: "resourcepack", label: "Ресурспаки", icon: Image, folder: "resourcepacks" },
  { id: "datapack", label: "Датапаки", icon: Layers, folder: "datapacks" },
];

const CATALOG_SOURCE = "modrinth";

function formatDownloads(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function ModsCatalogSection({
  instances,
  activeInstanceId,
  onSelectInstance,
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState("mod");
  const [query, setQuery] = useState("");
  const [restrictToInstance, setRestrictToInstance] = useState(true);
  const [results, setResults] = useState([]);
  const [installedFiles, setInstalledFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [installingId, setInstallingId] = useState(null);
  const [showInstalled, setShowInstalled] = useState(false);
  const [sortBy, setSortBy] = useState("relevance");
  // null = список, объект = страничка мода открыта
  const [detailProject, setDetailProject] = useState(null);

  const api = typeof window !== "undefined" ? window.poshatAPI : null;
  const activeInstance = instances.find((i) => i.id === activeInstanceId) || null;

  // Берём фильтры по версии/загрузчику только если пользователь сам выбрал
  // эту опцию И инстанс задан — иначе показываем «всё». Для шейдеров/паков
  // loader всегда пропускаем, как и в catalogService.
  const filterMc = restrictToInstance && activeInstance ? activeInstance.mcVersion : null;
  const filterLoader =
    restrictToInstance && activeInstance && tab === "mod" ? activeInstance.loader : null;

  // Дебаунс поиска: пока юзер печатает, не дёргаем апи.
  const reqIdRef = useRef(0);
  const runSearch = useCallback(async () => {
    if (!api) return;
    const myId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await api.catalog.search({
        source: CATALOG_SOURCE,
        projectType: tab,
        query: query.trim(),
        mcVersion: filterMc,
        loader: filterLoader,
        limit: 30,
        sort: sortBy,
      });
      if (reqIdRef.current !== myId) return;
      setResults(Array.isArray(data) ? data : []);
    } catch (e) {
      if (reqIdRef.current !== myId) return;
      setError(e && e.message ? e.message : String(e));
      setResults([]);
    } finally {
      if (reqIdRef.current === myId) setLoading(false);
    }
  }, [api, tab, query, filterMc, filterLoader, sortBy]);

  useEffect(() => {
    const t = setTimeout(runSearch, 300);
    return () => clearTimeout(t);
  }, [runSearch]);

  const reloadInstalled = useCallback(async () => {
    if (!api || !activeInstanceId) {
      setInstalledFiles([]);
      return;
    }
    try {
      const list = await api.catalog.installed({ instanceId: activeInstanceId, projectType: tab });
      setInstalledFiles(Array.isArray(list) ? list : []);
    } catch {
      setInstalledFiles([]);
    }
  }, [api, activeInstanceId, tab]);

  useEffect(() => {
    reloadInstalled();
  }, [reloadInstalled]);

  const handleInstall = async (item) => {
    if (!api || !activeInstance) {
      toast.err("Выбери сборку — туда поставим файл.");
      return;
    }
    setInstallingId(item.id);
    try {
      const result = await api.catalog.install({
        source: CATALOG_SOURCE,
        projectId: item.id,
        instanceId: activeInstance.id,
        projectType: tab,
        mcVersion: activeInstance.mcVersion,
        loader: activeInstance.loader,
      });
      await reloadInstalled();
      toast.ok(`Установлено: ${result.fileName || item.name}`);
    } catch (e) {
      toast.err(`Не удалось установить: ${e && e.message ? e.message : e}`);
    } finally {
      setInstallingId(null);
    }
  };

  const handleRemoveFile = async (fileName) => {
    if (!api || !activeInstance) return;
    const ok = await confirm({
      title: "Удалить файл?",
      message: `«${fileName}» — удалится из папки сборки.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.catalog.remove({
        instanceId: activeInstance.id,
        projectType: tab,
        fileName,
      });
      await reloadInstalled();
    } catch (e) {
      toast.err(`Не удалось удалить: ${e && e.message ? e.message : e}`);
    }
  };

  // Если открыта страничка мода — рендерим её вместо списка
  if (detailProject) {
    return (
      <ProjectDetailView
        projectId={detailProject.id}
        projectType={tab}
        initialName={detailProject.name}
        initialIcon={detailProject.iconUrl}
        activeInstance={activeInstance}
        onBack={() => {
          setDetailProject(null);
          reloadInstalled();
        }}
      />
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-violet-300/80">Каталог</p>
          <h2 className="mt-0.5 text-2xl font-bold text-white">Компоненты</h2>
        </div>
      </div>

      {/* БОЛЬШОЙ блок «куда скачивать» */}
      <div className="mods-target-panel rounded-3xl border border-white/10 bg-gradient-to-br from-violet-400/10 via-[#0c0f17]/80 to-cyan-400/5 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-400/20 text-violet-200">
              <FolderOpen size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Куда скачивать</h3>
              <p className="text-[11px] text-zinc-400">
                {activeInstance
                  ? <>файлы попадут в <code className="text-violet-200">{activeInstance.name}/minecraft/{TABS.find((t) => t.id === tab)?.folder}/</code></>
                  : "выбери сборку — без неё установить нельзя"}
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={restrictToInstance}
              onChange={(e) => setRestrictToInstance(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Фильтр под сборку
          </label>
        </div>

        {instances.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/15 bg-white/[0.025] p-5 text-center text-sm text-zinc-400">
            Нет сборок. Создай сборку в разделе «Сборки», чтобы ставить туда компоненты.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
            {instances.map((instance) => {
              const active = instance.id === activeInstanceId;
              return (
                <button
                  key={instance.id}
                  onClick={() => onSelectInstance(instance.id)}
                  className={`group relative overflow-hidden rounded-2xl border p-3.5 text-left transition ${
                    active
                      ? "border-violet-300/50 bg-gradient-to-br from-violet-400/20 to-cyan-400/10 shadow-[0_0_0_1px_rgba(167,139,250,0.25)]"
                      : "border-white/10 bg-white/[0.035] hover:border-white/25 hover:bg-white/[0.06]"
                  }`}
                >
                  {active && (
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-violet-400/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-100">
                      <Check size={10} /> цель
                    </span>
                  )}
                  <p className="truncate pr-12 text-sm font-bold text-white">{instance.name}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200">
                      {instance.loader || "vanilla"}
                    </span>
                    <span className="text-[11px] text-zinc-400">{instance.mcVersion}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Подразделы — крупные кнопки */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                active
                  ? "border-violet-300/40 bg-violet-400/15 text-white shadow-[0_0_0_1px_rgba(167,139,250,0.2)]"
                  : "border-white/10 bg-theme-card/60 text-zinc-300 hover:border-white/25 hover:bg-white/[0.05]"
              }`}
            >
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Поиск + счётчик */}
      <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-theme-card/80 p-3 sm:flex-row sm:items-center">
        <span className="hidden shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#090b12] sm:inline-flex">
          Modrinth
        </span>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-300 focus:outline-none"
        >
          <option value="relevance">По релевантности</option>
          <option value="downloads">По скачиваниям</option>
          <option value="follows">По популярности</option>
          <option value="newest">По новизне</option>
          <option value="updated">По обновлению</option>
        </select>

        <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 transition focus-within:border-violet-300/40">
          <Search size={15} className="text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Поиск ${TABS.find((t) => t.id === tab)?.label.toLowerCase()}…`}
            className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="rounded-full px-1.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
        <span className="shrink-0 px-2 text-[11px] text-zinc-500">
          {loading ? "поиск…" : `${results.length} результатов`}
        </span>
      </div>

      {error && (
        <p className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200">
          {error}
        </p>
      )}

      {/* Установленные файлы — компактный пилл-тоггл */}
      {activeInstance && installedFiles.length > 0 && (
        <div>
          <button
            onClick={() => setShowInstalled((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              showInstalled
                ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-100"
                : "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200 hover:bg-emerald-400/10"
            }`}
          >
            <Check size={12} className="text-emerald-300" />
            Уже установлено
            <span className="rounded-full bg-emerald-400/25 px-1.5 py-0.5 text-[10px] text-emerald-50">
              {installedFiles.length}
            </span>
            <ChevronDown
              size={13}
              className={`transition ${showInstalled ? "rotate-180" : ""}`}
            />
          </button>
          {showInstalled && (
            <div className="mt-2 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3">
              <div className="flex max-h-[180px] flex-wrap gap-1.5 overflow-y-auto">
                {installedFiles.map((fileName) => (
                  <span
                    key={fileName}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-100"
                  >
                    <Check size={11} className="text-emerald-300" />
                    <span className="max-w-[240px] truncate">{fileName}</span>
                    <button
                      onClick={() => handleRemoveFile(fileName)}
                      className="ml-0.5 rounded-full p-0.5 text-emerald-200/70 hover:bg-rose-500/20 hover:text-rose-200"
                    >
                      <Trash2 size={11} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Результаты — сетка 2 колонки */}
      <div>
        {loading && results.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-400">
            <Loader2 className="animate-spin" size={16} /> Поиск…
          </div>
        )}
        {!loading && results.length === 0 && !error && (
          <EmptyState label="Ничего не нашлось — поменяй запрос или сними фильтр под сборку." />
        )}
        {/* Список — одна колонка, плотные карточки в стиле Modrinth */}
        <div className="flex flex-col gap-2">
          {results.map((item) => {
            const installedMatch = installedFiles.some((f) => {
              const fn = f.toLowerCase();
              const slug = String(item.slug || item.id).toLowerCase();
              return fn === slug || fn.startsWith(slug + "-") || fn.startsWith(slug + "_") || fn.startsWith(slug + ".");
            });
            const isInstalling = installingId === item.id;
            return (
              <article
                key={`${item.source}-${item.id}`}
                role="button"
                tabIndex={0}
                onClick={() => setDetailProject(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDetailProject(item);
                  }
                }}
                className={`group flex cursor-pointer items-stretch gap-3 rounded-xl border px-3 py-2.5 transition ${
                  installedMatch
                    ? "border-emerald-400/25 bg-emerald-400/[0.04] hover:border-emerald-400/40 hover:bg-emerald-400/[0.07]"
                    : "border-white/8 bg-theme-card/60 hover:border-violet-300/35 hover:bg-white/[0.035]"
                }`}
              >
                {/* Иконка слева, квадрат как у modrinth */}
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-violet-400/20 to-cyan-400/10 text-white">
                  {item.iconUrl ? (
                    <img
                      src={item.iconUrl}
                      alt=""
                      className="h-16 w-16 object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Box size={26} className="text-violet-200/70" />
                  )}
                </div>

                {/* Центр: заголовок + автор + описание */}
                <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                      <h4 className="truncate text-[15px] font-bold leading-tight text-white">
                        {item.name}
                      </h4>
                      {item.author && (
                        <span className="text-[11px] text-zinc-500">
                          от <span className="text-zinc-300">{item.author}</span>
                        </span>
                      )}
                      {installedMatch && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-200">
                          <Check size={9} /> есть
                        </span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-1 text-[12px] text-zinc-400">
                      {item.summary || "—"}
                    </p>
                  </div>

                  {/* Низ: категории слева */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {(item.categories || []).slice(0, 4).map((cat) => (
                      <span
                        key={cat}
                        className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Правая колонка: статы + кнопка */}
                <div className="flex w-[120px] shrink-0 flex-col items-end justify-between gap-2 py-0.5">
                  <div className="flex flex-col items-end gap-0.5 text-[11px] text-zinc-400">
                    <span className="inline-flex items-center gap-1">
                      <Download size={11} className="text-violet-300/80" />
                      <span className="font-semibold text-zinc-200">
                        {formatDownloads(item.downloads)}
                      </span>
                    </span>
                    {item.follows ? (
                      <span className="inline-flex items-center gap-1">
                        <Heart size={11} className="text-rose-300/80" />
                        <span className="font-semibold text-zinc-200">
                          {formatDownloads(item.follows)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider text-zinc-600">
                        Modrinth
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleInstall(item);
                    }}
                    disabled={isInstalling || !activeInstance}
                    className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                      !activeInstance
                        ? "bg-white/10 text-zinc-500"
                        : isInstalling
                        ? "bg-white/15 text-zinc-300"
                        : "bg-violet-400/20 text-violet-100 hover:bg-violet-400/30"
                    }`}
                  >
                    {isInstalling ? (
                      <Loader2 className="animate-spin" size={12} />
                    ) : (
                      <Download size={12} />
                    )}
                    {isInstalling ? "Качаю…" : "Скачать"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
