export function StatCard({ icon: Icon, label, value, detail }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.045] p-2 shadow-[0_16px_45px_rgba(0,0,0,0.25)] lg:rounded-3xl lg:p-4">
      <div className="mb-2 flex items-center justify-between lg:mb-4">
        <div className="rounded-lg bg-white/10 p-1.5 text-white lg:rounded-2xl lg:p-2">
          <Icon size={14} />
        </div>
        <span className="rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300 lg:px-2.5 lg:py-1 lg:text-xs">
          OK
        </span>
      </div>
      <p className="text-[10px] text-zinc-500 lg:text-xs">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-white lg:mt-1 lg:text-xl">{value}</p>
      <p className="mt-0.5 hidden text-xs text-zinc-500 lg:mt-1 lg:block">{detail}</p>
    </div>
  );
}
