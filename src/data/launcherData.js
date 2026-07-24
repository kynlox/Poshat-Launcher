export const sections = [
  { id: "home", label: "Главная", icon: "Home" },
  { id: "instances", label: "Сборки", icon: "Layers3" },
  { id: "modsCatalog", label: "Компоненты", icon: "Puzzle" },
  { id: "accounts", label: "Аккаунты", icon: "UserRound" },
  { id: "settings", label: "Настройки", icon: "Settings" },
];

export const loaderOptions = [
  { id: "vanilla", label: "Vanilla" },
  { id: "fabric", label: "Fabric" },
  { id: "quilt", label: "Quilt" },
  { id: "forge", label: "Forge" },
  { id: "neoforge", label: "NeoForge" },
];

export const settingsGroups = [
  {
    title: "Производительность",
    rows: [
      {
        label: "Память Java",
        value: 4,
        type: "range",
        min: 1,
        max: 16,
        step: 1,
        unit: "GB",
        icon: "HardDrive",
        settingKey: "javaMemoryGb",
      },
      {
        label: "Профиль запуска",
        value: "Balanced",
        options: ["Eco", "Balanced", "Performance"],
        icon: "Cpu",
      },
      {
        label: "Проверка совместимости",
        value: "Вкл.",
        options: ["Вкл.", "Выкл."],
        icon: "CheckCircle2",
      },
    ],
  },
  {
    title: "Версии",
    rows: [
      {
        label: "Релизы",
        value: true,
        type: "toggle",
        icon: "CheckCircle2",
        filterKey: "release",
      },
      {
        label: "Снапшоты",
        value: false,
        type: "toggle",
        icon: "CheckCircle2",
        filterKey: "snapshot",
      },
      {
        label: "Beta",
        value: false,
        type: "toggle",
        icon: "CheckCircle2",
        filterKey: "old_beta",
      },
      {
        label: "Alpha",
        value: false,
        type: "toggle",
        icon: "CheckCircle2",
        filterKey: "old_alpha",
      },
    ],
  },
];
