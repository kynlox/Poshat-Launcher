import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error — у пакета нет типов, нам и не надо
import JavaScriptObfuscator from "javascript-obfuscator";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Алиас "@/..." → "src/..." нужен потому, что скопированные из Electron-проекта
// React-компоненты импортят так: `import x from "@/components/Launcher/Foo"`.
// Без алиаса Vite не разрешает путь.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =========================================================================
// JS-обфускация для production-сборки.
// =========================================================================
// Натравливаем javascript-obfuscator на каждый собранный JS-чанк ПОСЛЕ того,
// как Vite уже всё сбандлил и минифицировал. На выходе:
//
//   - все строки превращены в \uXXXX (выглядит как «арабские каракули»)
//     и сложены в зашифрованный RC4-stringArray
//   - имена переменных → hex-мусор (_0x4f2a и т.д.)
//   - вместо чисел — арифм. выражения, разорванные строки склеиваются на лету
//   - controlFlowFlattening разворачивает if/for в switch/case с диспетчером
//   - dead code injection пихает фейковые ветки, чтобы трасса не сходилась
//   - selfDefending: код проверяет, не отформатировали ли его / не патчили ли,
//     и при модификации валит выполнение (или зацикливается).
//
// disableConsoleOutput выключает console.* в проде — никаких следов.
// debugProtection ВЫКЛЮЧЕН: в release WebView2 без DevTools и так,
// а с ним некоторые WebView2-сборки виснут.
//
// Стоимость: бандл +50-80%, первый запуск +200-400 мс, билд +30-60 сек.
// Для лаунчера это терпимо.
function obfuscatorPlugin(): Plugin {
  return {
    name: "poshat-js-obfuscator",
    apply: "build",
    enforce: "post",
    renderChunk(code, chunk) {
      if (!chunk.fileName.endsWith(".js")) return null;
      // ВАЖНО: настройки подобраны под БАЛАНС защита/перформанс.
      //
      // ВЫКЛЮЧЕНО (вызывало зависания UI на каждое действие):
      //   - controlFlowFlattening: превращает if/for в switch-диспетчер,
      //     замедляет код в 5-10×. На каждое onClick — фриз.
      //   - deadCodeInjection: раздувает бандл фейковыми ветками + тормозит.
      //   - selfDefending: runtime-проверки целостности кода — стоят CPU
      //     постоянно. Защита от модификации остаётся на стороне Rust (LTO+strip).
      //   - stringArrayEncoding: ['rc4'] → ['base64']: RC4 дешифрует каждое
      //     обращение к строке (а их тысячи). Base64 в десятки раз быстрее,
      //     и визуально результат тот же — нечитаемые строки.
      //   - stringArrayWrappersCount: 3→1: меньше прыжков на каждый lookup.
      //
      // ОСТАЛОСЬ (нулевая стоимость runtime + сильная визуальная обфускация):
      //   - unicodeEscapeSequence: все строки как \uXXXX («арабские» символы),
      //     compile-time трансформация, рантайм 0 мс.
      //   - identifierNamesGenerator: hex: переменные _0xABCD, тоже compile-time.
      //   - stringArray + base64: строки в зашифрованном массиве, по индексу.
      //   - splitStrings: длинные строки разрезаны и склеиваются конкатенацией.
      //   - transformObjectKeys: ключи объектов через computed property access.
      //   - numbersToExpressions: 42 → 0x2a^0x1, мелочь но добавляет шума.
      //   - disableConsoleOutput: убирает console.* в проде, не тормозит.
      const result = JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        debugProtection: false,
        disableConsoleOutput: true,
        identifierNamesGenerator: "hexadecimal",
        log: false,
        numbersToExpressions: true,
        renameGlobals: false,
        selfDefending: false,
        simplify: true,
        splitStrings: true,
        splitStringsChunkLength: 10,
        stringArray: true,
        stringArrayCallsTransform: false,
        stringArrayEncoding: ["base64"],
        stringArrayIndexShift: true,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        stringArrayWrappersCount: 1,
        stringArrayWrappersChainedCalls: false,
        stringArrayWrappersType: "variable",
        stringArrayThreshold: 1,
        transformObjectKeys: true,
        unicodeEscapeSequence: true,
        target: "browser",
      });
      return { code: result.getObfuscatedCode(), map: null };
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => ({
  // Resolve the application root from this config file instead of process.cwd().
  // This also keeps Windows builds working when the project is opened through
  // a junction or a sandbox-projected working directory.
  root: __dirname,

  plugins: [
    react(),
    // Обфускатор только для production-сборки (tauri build).
    // На `tauri dev` тяжёлая обработка ломала бы HMR и съедала бы CPU зря.
    ...(mode === "production" ? [obfuscatorPlugin()] : []),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  build: {
    // Тяжёлая обфускация увеличивает чанки — поднимаем лимит предупреждения.
    chunkSizeWarningLimit: 4000,
    // sourcemap намеренно выключен — иначе вся работа обфускатора впустую,
    // дебаггер из .map восстановит исходники.
    sourcemap: false,
    minify: "esbuild",
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
