import { Box } from "lucide-react";
import LoaderIcons from "@/components/Launcher/LoaderIcons";

const LOADER_LABEL = {
  vanilla: "Vanilla",
  fabric: "Fabric",
  quilt: "Quilt",
  forge: "Forge",
  neoforge: "NeoForge",
};

const LOADER_ACCENT = {
  vanilla: "from-emerald-400/30 to-cyan-400/20",
  fabric: "from-violet-400/30 to-fuchsia-400/20",
  quilt: "from-fuchsia-400/30 to-pink-400/20",
  forge: "from-orange-400/30 to-red-400/20",
  neoforge: "from-amber-400/30 to-orange-400/20",
};

export function InstanceCard({ item, active, onClick }) {
  const loaderId = item.loader || "vanilla";
  const loaderLabel = LOADER_LABEL[loaderId] || item.loader || "Vanilla";
  const accent = LOADER_ACCENT[loaderId] || LOADER_ACCENT.vanilla;
  const LoaderIcon = LoaderIcons[loaderId] || LoaderIcons.vanilla;

  return (
    <button
      onClick={onClick}
      className={`group w-full rounded-2xl border p-3 text-left transition hover:border-white/20 hover:bg-white/[0.07] ${
        active
          ? "border-violet-300/35 bg-violet-400/10 shadow-[0_12px_40px_rgba(139,92,246,0.12)]"
          : "border-white/10 bg-white/[0.035]"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-white overflow-hidden`}
        >
          {item.iconData ? (
            <img
              src={`data:image/png;base64,${item.iconData}`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <LoaderIcon size={18} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xs font-semibold text-white">{item.name}</h3>
          <p className="truncate text-[10px] text-zinc-500">
            MC {item.mcVersion} · {loaderLabel}
          </p>
        </div>
      </div>
    </button>
  );
}
