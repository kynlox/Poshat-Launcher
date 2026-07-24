export function FabricIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" className={className} fill="none">
      <path d="M8 4v16h2.5c2 0 3.5-0.7 3.5-2.5 0-1.2-0.8-2-2-2.3 1-0.5 1.8-1.5 1.8-2.7 0-1.5-1.2-2.5-3.3-2.5H8z" fill="#DBB87A"/>
      <path d="M10 6h0.3c1.2 0 2 0.5 2 1.3 0 0.8-0.7 1.3-1.8 1.3H10V6z" fill="#0c0f17"/>
    </svg>
  );
}

export function ForgeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" className={className} fill="none">
      <path d="M5 19h14v1.5c0 0.8-0.7 1.5-1.5 1.5h-11c-0.8 0-1.5-0.7-1.5-1.5V19z" fill="#1E1E1E"/>
      <path d="M6 18L8 8h8l2 10" stroke="#1E1E1E" strokeWidth="2"/>
      <path d="M9 8L10 4h4l1 4" fill="#1E1E1E"/>
      <path d="M12 4v1.5" stroke="#1E1E1E" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function QuiltIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" className={className} fill="none">
      <path d="M12 2L22 12L12 22L2 12L12 2z" fill="#AA72CF"/>
      <path d="M12 7L17 12L12 17L7 12L12 7z" fill="#0c0f17"/>
      <path d="M12 7L17 12L12 17L7 12L12 7z" stroke="#AA72CF" strokeWidth="1"/>
    </svg>
  );
}

export function NeoForgeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" className={className} fill="none">
      <path d="M5 19h14v1.5c0 0.8-0.7 1.5-1.5 1.5h-11c-0.8 0-1.5-0.7-1.5-1.5V19z" fill="#FF6723"/>
      <path d="M6 18L8 8h8l2 10" stroke="#FF6723" strokeWidth="2"/>
      <path d="M9 8L10 4h4l1 4" fill="#FF6723"/>
      <path d="M10 11L12 13L14 11" stroke="#0c0f17" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function VanillaIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" className={className} fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2" fill="#5D9B3C"/>
      <rect x="5" y="5" width="14" height="6" fill="#8B6D3F"/>
      <rect x="7" y="4" width="2" height="3" fill="#5D9B3C" rx="1"/>
      <rect x="11" y="3" width="2" height="4" fill="#5D9B3C" rx="1"/>
      <rect x="15" y="4" width="2" height="3" fill="#5D9B3C" rx="1"/>
      <rect x="9" y="5" width="2" height="2" fill="#4A8230" rx="1"/>
      <rect x="13" y="4" width="2" height="3" fill="#4A8230" rx="1"/>
    </svg>
  );
}

const LoaderIcons = { fabric: FabricIcon, forge: ForgeIcon, quilt: QuiltIcon, neoforge: NeoForgeIcon, vanilla: VanillaIcon };

export default LoaderIcons;
