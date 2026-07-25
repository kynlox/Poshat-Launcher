// Панель «Игра и Java» в разделе «Настройки».
//
// Сюда вынесены НАСТРОЯЩИЕ работающие настройки, которые применяются при
// запуске Minecraft:
//
//   1. Разрешение окна Minecraft (width × height → --width/--height)
//   2. Авто-переключение на «Логи» при запуске
//   3. Сборщик мусора Java (default / G1 / ZGC / Shenandoah)
//   4. Дополнительные JVM-аргументы (свободный текст, разбивается по whitespace)
//
// Источник правды — store.rs::Settings. UI читает через `api.settings.get()`
// при монтировании и пишет debounced'ом в `api.settings.set({ settings: ... })`.
// Все правки сразу персистятся в %APPDATA%/.poshatlauncher/store.json.

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Monitor,
  Settings2,
  Terminal,
  Recycle,
} from "lucide-react";

const GC_OPTIONS = [
  { id: "default", label: "По умолчанию", short: "—" },
  { id: "g1", label: "G1GC", short: "G1" },
  { id: "zgc", label: "ZGC", short: "ZGC" },
  { id: "shenandoah", label: "Shenandoah", short: "Shen." },
];

// Распространённые игровые разрешения как пресеты — клик ставит сразу пару.
// Список умышленно короткий: один-два mainstream + несколько 16:9 пресетов.
const RES_PRESETS = [
  { w: 854, h: 480, label: "854×480 (Minecraft по умолчанию)" },
  { w: 1280, h: 720, label: "1280×720 (HD)" },
  { w: 1600, h: 900, label: "1600×900" },
  { w: 1920, h: 1080, label: "1920×1080 (Full HD)" },
];

export const GameJavaPanel = memo(function GameJavaPanel({ settings, onChange }) {
  // Локальные стейты позволяют редактировать числовые поля без мерцания
  // (если бы писали напрямую через onChange, каждый набранный символ
  // отрабатывал бы persist). Persist делаем по blur + дебаунс через эффект.
  const [width, setWidth] = useState(settings?.mcWindowWidth ?? 854);
  const [height, setHeight] = useState(settings?.mcWindowHeight ?? 480);
  const [jvmArgs, setJvmArgs] = useState(settings?.extraJvmArgs ?? "");

  const havePending = useRef(false);
  const pendingRef = useRef({});

  // Синхронизируем локальные стейты с настройками ТОЛЬКО при первом монтаже
  // или когда нет активных пользовательских правок (havePending). Иначе
  // persist-гонка: юзер меняет поле A, persist шлёт patch, родитель
  // пересоздаёт settings → эффект сбрасывает поле B, которое юзер
  // сейчас редактирует.
  useEffect(() => {
    if (!settings || havePending.current) return;
    setWidth(settings.mcWindowWidth ?? 854);
    setHeight(settings.mcWindowHeight ?? 480);
    setJvmArgs(settings.extraJvmArgs ?? "");
  }, [
    settings?.mcWindowWidth,
    settings?.mcWindowHeight,
    settings?.extraJvmArgs,
  ]);

  // Дебаунс + мерж патчей: несколько быстрых изменений в разных полях
  // (ширина → высота → JVM args) схлопываются в один persist. Без мержа
  // каждое поле затирало бы предыдущий debounce, теряя данные соседнего поля.
  const debounceRef = useRef(null);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);
  const persist = useCallback(
    (patch) => {
      Object.assign(pendingRef.current, patch);
      havePending.current = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const merged = { ...pendingRef.current };
        pendingRef.current = {};
        havePending.current = false;
        onChange?.(merged);
      }, 600);
    },
    [onChange],
  );

  // Мгновенный persist для тогглов/радио — там дебаунс не нужен.
  const persistNow = useCallback(
    (patch) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      onChange?.(patch);
    },
    [onChange],
  );

  const setWh = (w, h) => {
    setWidth(w);
    setHeight(h);
    // Меняем оба поля сразу — это пресет, нечего ждать.
    persistNow({ mcWindowWidth: w, mcWindowHeight: h });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-theme-card/80 p-3 lg:col-span-2 lg:rounded-3xl lg:p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <Settings2 size={14} className="text-violet-300" />
        Игра и Java
      </h3>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* 1) Разрешение окна Minecraft */}
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <div className="mb-2 flex items-center gap-2">
            <Monitor size={13} className="text-violet-300" />
            <span className="text-xs font-semibold text-white">
              Разрешение окна
            </span>
          </div>
          <div className="mb-2 flex items-center gap-2">
            <label className="flex-1">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">
                Ширина
              </span>
              <input
                type="number"
                min="320"
                max="7680"
                value={width}
                onChange={(e) => {
                  const n = Math.max(320, Math.min(7680, Number(e.target.value) || 854));
                  setWidth(n);
                  persist({ mcWindowWidth: n, mcWindowHeight: height });
                }}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white outline-none focus:border-violet-300/40"
              />
            </label>
            <span className="mt-4 text-zinc-500">×</span>
            <label className="flex-1">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">
                Высота
              </span>
              <input
                type="number"
                min="240"
                max="4320"
                value={height}
                onChange={(e) => {
                  const n = Math.max(240, Math.min(4320, Number(e.target.value) || 480));
                  setHeight(n);
                  persist({ mcWindowWidth: width, mcWindowHeight: n });
                }}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white outline-none focus:border-violet-300/40"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RES_PRESETS.map((p) => {
              const active = p.w === width && p.h === height;
              return (
                <button
                  key={`${p.w}x${p.h}`}
                  onClick={() => setWh(p.w, p.h)}
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                    active
                      ? "border-violet-300/40 bg-violet-400/15 text-violet-100"
                      : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
                  }`}
                >
                  {p.w}×{p.h}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2) Сборщик мусора Java */}
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <div className="mb-2 flex items-center gap-2">
            <Recycle size={13} className="text-violet-300" />
            <span className="text-xs font-semibold text-white">
              Сборщик мусора Java
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {GC_OPTIONS.map((opt) => {
              const active = (settings?.gcType || "default") === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => persistNow({ gcType: opt.id })}
                  className={`rounded-lg border px-2 py-1.5 text-center text-[11px] font-semibold transition ${
                    active
                      ? "border-violet-300/40 bg-violet-400/15 text-violet-100"
                      : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
                  }`}
                >
                  {opt.short}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">
            {GC_OPTIONS.find((o) => o.id === (settings?.gcType || "default"))?.label}
            {settings?.gcType && settings.gcType !== "default" && (
              <>
                {" · "}
                <code className="text-violet-200/90">
                  -XX:+Use{settings.gcType === "g1" ? "G1" : settings.gcType === "zgc" ? "Z" : "Shenandoah"}GC
                </code>
              </>
            )}
          </p>
        </div>

        {/* 4) Дополнительные JVM-аргументы */}
        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 lg:col-span-2">
          <div className="mb-2 flex items-center gap-2">
            <Terminal size={13} className="text-violet-300" />
            <span className="text-xs font-semibold text-white">
              Дополнительные JVM-аргументы
            </span>
            <span className="ml-auto text-[10px] text-zinc-500">
              {jvmArgs.trim() ? `${jvmArgs.trim().split(/\s+/).length} аргум.` : "пусто"}
            </span>
          </div>
          <textarea
            value={jvmArgs}
            onChange={(e) => {
              setJvmArgs(e.target.value);
              persist({ extraJvmArgs: e.target.value });
            }}
            rows={2}
            spellCheck={false}
            placeholder="-XX:+DisableExplicitGC -Dfile.encoding=UTF-8"
            className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 font-mono text-[12px] text-white outline-none focus:border-violet-300/40"
          />
          <p className="mt-1.5 text-[10px] text-zinc-500">
            Разделяй пробелами или новыми строками. Применяются ПОСЛЕ настроек GC.
          </p>
        </div>
      </div>
    </div>
  );
});
