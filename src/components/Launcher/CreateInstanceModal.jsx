import { useEffect, useMemo, useState } from "react";
import { Check, X, Search } from "lucide-react";
import { useVersions } from "@/hooks/useVersions";
import { useLoaderVersions } from "@/hooks/useLoaderVersions";
import { useInstalledVersions } from "@/hooks/useInstalledVersions";

const LOADERS = ["vanilla", "fabric", "quilt", "forge", "neoforge"];
const LOADER_LABEL = {
  vanilla: "Vanilla",
  fabric: "Fabric",
  quilt: "Quilt",
  forge: "Forge",
  neoforge: "NeoForge",
};

export function CreateInstanceModal({ open, onClose, onCreate, filterTypes, instances = [] }) {
  const [name, setName] = useState("");
  const [mcVersion, setMcVersion] = useState(null);
  const [loader, setLoader] = useState("vanilla");
  const [loaderVersion, setLoaderVersion] = useState(null);
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setMcVersion(null);
      setLoader("vanilla");
      setLoaderVersion(null);
      setQuery("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  // Блокируем скролл фона
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Esc закрывает модалку
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const { data: versions, loading: versionsLoading } = useVersions(
    open ? filterTypes : null,
    "desc",
  );
  const { installed } = useInstalledVersions(open ? 10000 : 0);
  const { data: loaderVersions, loading: loaderLoading } = useLoaderVersions(
    open && loader !== "vanilla" ? loader : null,
    mcVersion,
  );

  const filteredVersions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return versions;
    return versions.filter((v) => v.id.toLowerCase().includes(q));
  }, [versions, query]);

  const duplicateName = useMemo(() => {
    const normalized = name.trim().toLocaleLowerCase();
    return !!normalized && instances.some(
      (item) => String(item.name || "").trim().toLocaleLowerCase() === normalized,
    );
  }, [instances, name]);

  if (!open) return null;

  const canSubmit =
    name.trim().length > 0 &&
    !duplicateName &&
    !!mcVersion &&
    (loader === "vanilla" || !!loaderVersion) &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        mcVersion,
        loader,
        loaderVersion: loader === "vanilla" ? null : loaderVersion,
      });
      onClose();
    } catch (e) {
      setError(e && e.message ? e.message : String(e));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/[0.005] px-3 py-3 sm:px-4 sm:py-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="theme-dialog-panel launcher-theme flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#10141f] via-[#0c0f17] to-[#0a0d16] p-4 shadow-[0_40px_120px_rgba(0,0,0,0.6)] sm:max-h-[calc(100dvh-2.5rem)] sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">
              Новая сборка
            </p>
            <h2 className="text-xl font-semibold">Создать сборку</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl bg-white/5 p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="launcher-scroll min-h-0 overflow-y-auto overscroll-contain px-px pb-1 [scrollbar-gutter:stable]">
        <label className="mb-4 block">
          <span className="mb-1 block text-xs text-zinc-500">Название</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Fabric Performance"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none focus:border-violet-300/40"
          />
          {duplicateName && (
            <span className="mt-1 block text-[11px] text-rose-300">
              Сборка с таким названием уже существует
            </span>
          )}
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-zinc-500">Версия Minecraft</span>
              <label className="flex w-[140px] items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-zinc-400">
                <Search size={11} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск"
                  className="min-w-0 flex-1 bg-transparent text-[11px] text-white outline-none placeholder:text-zinc-500"
                />
              </label>
            </div>
            <div className="launcher-scroll max-h-[260px] space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
              {versionsLoading && (
                <p className="px-1 text-[11px] text-zinc-500">Загрузка…</p>
              )}
              {!versionsLoading &&
                filteredVersions.slice(0, 200).map((v) => {
                  const active = v.id === mcVersion;
                  const isInstalled = installed.has(v.id);
                  let rowCls;
                  if (active) rowCls = "bg-violet-400/15 text-white";
                  else if (isInstalled)
                    rowCls = "bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15";
                  else rowCls = "text-zinc-400 hover:bg-white/[0.05]";
                  return (
                    <button
                      key={v.id}
                      onClick={() => {
                        setMcVersion(v.id);
                        setLoaderVersion(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${rowCls}`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {isInstalled && (
                          <Check size={10} className="shrink-0 text-emerald-300" />
                        )}
                        <span className="truncate">{v.id}</span>
                      </span>
                      <span className="text-[10px] text-zinc-500">{v.type}</span>
                    </button>
                  );
                })}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-xs text-zinc-500">Загрузчик</span>
            <div className="mb-3 grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-3">
              {LOADERS.map((id) => {
                const active = id === loader;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      setLoader(id);
                      setLoaderVersion(null);
                    }}
                    className={`rounded-lg px-2 py-1.5 text-xs transition ${
                      active
                        ? "bg-violet-400/15 text-white"
                        : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]"
                    }`}
                  >
                    {LOADER_LABEL[id]}
                  </button>
                );
              })}
            </div>
            {loader !== "vanilla" && (
              <>
                <span className="mb-1 block text-[11px] text-zinc-500">
                  Версия {LOADER_LABEL[loader]}
                </span>
                <div className="launcher-scroll max-h-[200px] space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
                  {!mcVersion && (
                    <p className="px-1 text-[11px] text-zinc-500">
                      Сначала выбери версию игры
                    </p>
                  )}
                  {mcVersion && loaderLoading && (
                    <p className="px-1 text-[11px] text-zinc-500">Загрузка…</p>
                  )}
                  {mcVersion && !loaderLoading && loaderVersions.length === 0 && (
                    <p className="px-1 text-[11px] text-zinc-500">
                      Нет версий {LOADER_LABEL[loader]} для {mcVersion}
                    </p>
                  )}
                  {mcVersion &&
                    loaderVersions.slice(0, 200).map((v) => {
                      const active = v.loaderVersion === loaderVersion;
                      return (
                        <button
                          key={v.loaderVersion}
                          onClick={() => setLoaderVersion(v.loaderVersion)}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                            active
                              ? "bg-violet-400/15 text-white"
                              : "text-zinc-400 hover:bg-white/[0.05]"
                          }`}
                        >
                          <span className="truncate">{v.loaderVersion}</span>
                          {v.stable && (
                            <span className="text-[10px] text-emerald-300">
                              stable
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-3 text-[11px] text-rose-300">{error}</p>
        )}
        </div>

        <div className="-mx-4 -mb-4 mt-4 flex shrink-0 justify-end gap-2 border-t border-white/10 bg-[var(--bg-card)] px-4 py-3 sm:-mx-5 sm:-mb-5 sm:px-5">
          <button
            onClick={onClose}
            className="rounded-xl bg-white/5 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/10"
          >
            Отмена
          </button>
          <button
            disabled={!canSubmit}
            onClick={submit}
            className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
              canSubmit
                ? "bg-white text-[#090b12] hover:bg-zinc-200"
                : "bg-white/20 text-zinc-500"
            }`}
          >
            {submitting ? "Создание…" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}
