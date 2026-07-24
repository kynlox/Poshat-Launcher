export function SectionTitle({ eyebrow, title, description }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 px-0.5">
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">
          {eyebrow}
        </p>
        <h2 className="text-2xl font-bold tracking-tight text-white lg:text-[28px]">
          {title}
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-400">
          {description}
        </p>
      </div>
    </div>
  );
}
