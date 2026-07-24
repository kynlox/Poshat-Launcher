import { memo, useEffect, useRef, useState } from "react";
import {
  Home,
  Layers3,
  Library,
  Settings,
  UserRound,
  Puzzle,
  Plus,
  ChevronLeft,
  ChevronRight,
  Pin,
  Play,
  Square,
} from "lucide-react";
import { sections } from "@/data/launcherData";
import { SidebarItem } from "@/components/Launcher/SidebarItem";
import LoaderIcons from "@/components/Launcher/LoaderIcons";
import { getAccountHeadUrl, handleAccountHeadError } from "@/utils/accountHead";

const LOADER_ACCENT = {
  vanilla: "from-emerald-400/30 to-cyan-400/20",
  fabric: "from-violet-400/30 to-fuchsia-400/20",
  quilt: "from-fuchsia-400/30 to-pink-400/20",
  forge: "from-orange-400/30 to-red-400/20",
  neoforge: "from-orange-500/30 to-red-500/20",
};

const ICON_MAP = { Home, UserRound, Layers3, Puzzle, Library, Settings };

const ACCENT_BY_TYPE = {
  offline: "from-emerald-300 to-lime-300",
  elyby: "from-violet-300 to-fuchsia-300",
};

const LABEL_BY_TYPE = {
  offline: "Оффлайн",
  elyby: "Ely.by",
};

export const Sidebar = memo(function Sidebar({
  activeSection,
  onSectionChange,
  accounts,
  selectedAccountId,
  onSelectAccount,
  pinnedInstances = [],
  onTogglePin,
  onPlayInstance,
  runningInstanceId,
  launchState,
  collapsed = false,
  onCollapsedChange,
}) {
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!showAccountDropdown) return;
    const handle = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowAccountDropdown(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showAccountDropdown]);

  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) || accounts[0] || null;

  const accAccent = selectedAccount
    ? ACCENT_BY_TYPE[selectedAccount.type] || "from-zinc-300 to-white"
    : "from-zinc-500 to-zinc-700";
  const accLabel = selectedAccount
    ? LABEL_BY_TYPE[selectedAccount.type] || selectedAccount.type
    : "нет аккаунта";
  const accName = selectedAccount?.name || "Нет аккаунта";

  const launchBusy =
    launchState === "installing" || launchState === "launching";

  return (
    <aside
      data-tour="sidebar"
      className="launcher-sidebar relative z-20 flex shrink-0 flex-col rounded-2xl border border-white/10 p-1 shadow-[0_18px_55px_rgba(0,0,0,0.32)] transition-all duration-200"
      style={{
        width: collapsed ? 52 : 122,
        background: `color-mix(in srgb, var(--bg-card) 80%, transparent)`,
      }}
    >
      <button
        data-tour="home"
        onClick={() => { setShowAccountDropdown(false); onSectionChange("home"); }}
        className={`mb-1.5 flex items-center rounded-xl py-1 text-left transition hover:bg-white/[0.035] ${collapsed ? "justify-center px-0" : "gap-1.5 px-1"}`}
        title={collapsed ? "Главная" : undefined}
      >
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
          <img
            src="/poshat-logo.png"
            alt="Poshat"
            className="h-full w-full object-contain drop-shadow-[0_10px_28px_rgba(120,90,255,0.55)]"
            draggable={false}
          />
        </div>
        {!collapsed && (
          <div className="hidden min-w-0 sm:block">
            <h1 className="truncate text-[11px] font-bold tracking-tight">Poshat</h1>
            <p className="truncate text-[9px] text-zinc-500">Launcher</p>
          </div>
        )}
      </button>

      <nav className="space-y-px">
        {sections.map((section) => {
          const Icon = ICON_MAP[section.icon];
          return (
            <SidebarItem
              key={section.id}
              icon={Icon}
              label={section.label}
              active={activeSection === section.id}
              onClick={() => { setShowAccountDropdown(false); onSectionChange(section.id); }}
              collapsed={collapsed}
              tourId={section.id}
            />
          );
        })}
      </nav>

      {!collapsed && pinnedInstances.length > 0 && (
        <div className="mt-2 border-t border-white/10 pt-2">
          <p className="mb-1.5 flex items-center gap-1 px-2.5 text-[9px] uppercase tracking-[0.18em] text-amber-300/80">
            <Pin size={8} className="fill-current" />
            Закреплённые
          </p>
          <div className="space-y-0.5">
            {pinnedInstances.map((item) => {
              if (!item) return null;
              const running = item.id === runningInstanceId;
              const loaderId = item.loader || "vanilla";
              const accent = LOADER_ACCENT[loaderId] || LOADER_ACCENT.vanilla;
              return (
                <div
                  key={item.id}
                  className="group flex items-center gap-1.5 rounded-lg px-2 py-1 transition hover:bg-white/[0.05]"
                >
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gradient-to-br ${accent} text-white overflow-hidden`}
                  >
                    {item.iconData ? (
                      <img src={`data:image/png;base64,${item.iconData}`} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (() => { const Icon = LoaderIcons[loaderId] || LoaderIcons.vanilla; return <Icon size={10} />; })()
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-zinc-300">
                    {item.name}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onPlayInstance?.(item); }}
                    disabled={launchBusy && !running}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-white opacity-0 transition hover:bg-white/20 group-hover:opacity-100 disabled:opacity-30"
                  >
                    {running ? <Square size={8} className="fill-current" /> : <Play size={8} className="fill-current ml-px" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onTogglePin?.(item.id); }}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-amber-300 opacity-0 transition hover:bg-amber-400/20 group-hover:opacity-100"
                    title="Открепить"
                  >
                    <Pin size={7} className="fill-current" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div ref={dropdownRef} className="relative mt-auto">
        {showAccountDropdown && (
          <div
            className={`absolute z-50 overflow-hidden rounded-xl border border-white/10 shadow-2xl ${collapsed ? "bottom-0 left-full ml-2 w-48" : "bottom-full left-0 mb-2 w-full"}`}
            style={{ background: "var(--bg-card)" }}
          >
            <div className="max-h-[200px] overflow-y-auto p-1">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => {
                    onSelectAccount(acc.id);
                    setShowAccountDropdown(false);
                  }}
                  className={`flex w-full items-center gap-1.5 rounded-lg p-1.5 text-left transition hover:bg-white/[0.06] ${acc.id === selectedAccountId ? "bg-white/[0.08]" : ""}`}
                >
                  <div
                    className={`relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br ${ACCENT_BY_TYPE[acc.type] || "from-zinc-300 to-white"} text-[#080b12]`}
                  >
                    <UserRound size={12} />
                    <img src={getAccountHeadUrl(acc)} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => handleAccountHeadError(e, acc)} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-white">{acc.name}</p>
                    <p className="truncate text-[9px] text-zinc-500">{LABEL_BY_TYPE[acc.type] || acc.type}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t border-white/10 p-1">
              <button
                onClick={() => { onSectionChange("accounts"); setShowAccountDropdown(false); }}
                className="flex w-full items-center gap-1.5 rounded-lg p-1.5 text-left text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-white/20">
                  <Plus size={12} />
                </div>
                <span className="hidden text-[10px] font-semibold sm:block">Добавить</span>
              </button>
            </div>
          </div>
        )}
        <button
          data-tour="account"
          onClick={() => {
            setShowAccountDropdown(!showAccountDropdown);
          }}
          className="flex w-full items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.045] p-1.5 text-left transition hover:bg-white/[0.075] sm:rounded-xl sm:p-2"
        >
          <div
            className={`relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br ${accAccent} text-[#080b12] sm:h-7 sm:w-7`}
          >
            <UserRound size={13} />
            {selectedAccount && (
              <img src={getAccountHeadUrl(selectedAccount)} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => handleAccountHeadError(e, selectedAccount)} />
            )}
          </div>
          {!collapsed && (
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-[11px] font-semibold text-white">{accName}</p>
              <p className="truncate text-[9px] text-zinc-500">{accLabel}</p>
            </div>
          )}
        </button>

        <button
          onClick={() => {
            setShowAccountDropdown(false);
            onCollapsedChange?.(!collapsed);
          }}
          className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg border border-white/5 py-1 text-[9px] text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-300"
          aria-label={collapsed ? "Развернуть боковую панель" : "Свернуть боковую панель"}
          title={collapsed ? "Развернуть" : undefined}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          {!collapsed && <span>Свернуть</span>}
        </button>
      </div>
    </aside>
  );
});
