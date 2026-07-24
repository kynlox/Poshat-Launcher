import { memo } from "react";

export const SidebarItem = memo(function SidebarItem({ icon: Icon, label, active, onClick, collapsed, tourId }) {
  const itemClass = active
    ? "sidebar-item-active bg-white text-[#0d1017] shadow-[0_8px_25px_rgba(255,255,255,0.12)]"
    : "sidebar-item-idle text-zinc-400 hover:bg-white/5 hover:text-white";

  return (
    <button
      data-tour={tourId}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`flex w-full items-center rounded-lg py-2 text-left text-[11px] font-medium transition ${
        collapsed
          ? "justify-center px-0"
          : "justify-start gap-2 px-2 sm:gap-2.5"
      } ${itemClass}`}
    >
      <Icon size={18} strokeWidth={1.9} className="shrink-0" />
      {!collapsed && <span className="hidden truncate sm:inline">{label}</span>}
    </button>
  );
});
