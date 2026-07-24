// Tailwind v3 — тот же конфиг, что и в Electron-сборке.
// content включает все исходники, чтобы JIT-проход подобрал классы во всех jsx-/tsx-/ts-файлах.
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
