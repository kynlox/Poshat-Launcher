export const THEMES = [
  {
    id: "dark",
    label: "Тёмная",
    vars: {
      "--bg-primary": "#0a0d16",
      "--bg-secondary": "#0c1020",
      "--bg-card": "#0c0f17",
      "--text-primary": "#ffffff",
      "--text-secondary": "#d4d4d8",
      "--text-muted": "#a1a1aa",
      "--accent": "violet",
      "--accent-hue": "250",
    },
  },
  {
    id: "midnight",
    label: "Полночь",
    vars: {
      "--bg-primary": "#050810",
      "--bg-secondary": "#070b16",
      "--bg-card": "#0a0e1a",
      "--text-primary": "#ffffff",
      "--text-secondary": "#d4d4d8",
      "--text-muted": "#a1a1aa",
      "--accent": "blue",
      "--accent-hue": "220",
    },
  },
  {
    id: "emerald",
    label: "Изумруд",
    vars: {
      "--bg-primary": "#060f0a",
      "--bg-secondary": "#08120e",
      "--bg-card": "#0a1610",
      "--text-primary": "#ffffff",
      "--text-secondary": "#d4d4d8",
      "--text-muted": "#a1a1aa",
      "--accent": "emerald",
      "--accent-hue": "160",
    },
  },
  {
    id: "sunset",
    label: "Закат",
    vars: {
      "--bg-primary": "#120a06",
      "--bg-secondary": "#140c08",
      "--bg-card": "#160e0a",
      "--text-primary": "#ffffff",
      "--text-secondary": "#d4d4d8",
      "--text-muted": "#a1a1aa",
      "--accent": "orange",
      "--accent-hue": "25",
    },
  },
  {
    id: "rose",
    label: "Роза",
    vars: {
      "--bg-primary": "#120610",
      "--bg-secondary": "#140812",
      "--bg-card": "#160a14",
      "--text-primary": "#ffffff",
      "--text-secondary": "#d4d4d8",
      "--text-muted": "#a1a1aa",
      "--accent": "rose",
      "--accent-hue": "330",
    },
  },
  {
    id: "light",
    label: "Светлая",
    vars: {
      "--bg-primary": "#f0f2f5",
      "--bg-secondary": "#e8eaed",
      "--bg-card": "#ffffff",
      "--text-primary": "#18181b",
      "--text-secondary": "#3f3f46",
      "--text-muted": "#52525b",
      "--accent": "violet",
      "--accent-hue": "250",
    },
  },
];

export function applyTheme(themeId) {
  const theme = THEMES.find((item) => item.id === themeId) || THEMES[0];
  if (typeof document === "undefined") return theme.id;

  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.id === "light" ? "light" : "dark";
  Object.entries(theme.vars).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });
  return theme.id;
}
