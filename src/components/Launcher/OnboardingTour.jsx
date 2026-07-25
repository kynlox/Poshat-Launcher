import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";

const STEPS = [
  {
    target: "home",
    title: "Главная",
    text: "Здесь ты видишь быстрый обзор: текущую сборку, версию Java и Minecraft. Кнопка «Играть» запускает последнюю активную сборку.",
  },
  {
    target: "sidebar",
    title: "Навигация",
    text: "Боковая панель — основные разделы: Главная, Сборки, Компоненты, Аккаунты и Настройки. Сверни её кнопкой внизу, если нужно больше места.",
  },
  {
    target: "instances",
    title: "Сборки",
    text: "Управляй сборками: создавай новые, ставь обложки (фото или видео), закрепляй избранные, создавай ярлыки на рабочем столе. Клик по карточке — подробности и запуск.",
  },
  {
    target: "modsCatalog",
    title: "Компоненты",
    text: "Каталог модов через Modrinth: ищи, фильтруй по версии и загрузчику, устанавливай и удаляй одним кликом. Поддерживаются Fabric, Forge, NeoForge и Quilt.",
  },
  {
    target: "play",
    title: "Запуск игры",
    text: "Выбери версию Minecraft и загрузчик (Vanilla, Fabric, Quilt, Forge, NeoForge), затем нажми «Играть». Лаунчер сам скачает нужные файлы.",
  },
  {
    target: "account",
    title: "Аккаунты",
    text: "Добавляй оффлайн-ники или аккаунты Ely.by. Переключай их быстрым кликом внизу сайдбара. Токены хранятся локально.",
  },
  {
    target: "settings",
    title: "Настройки",
    text: "Тема оформления, память Java, разрешение окна, фильтры версий и папки кэша — всё настроить можно здесь.",
  },
];

export function OnboardingTour({ onFinish }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const item = STEPS[step];

  useEffect(() => {
    const update = () => {
      const target = document.querySelector(`[data-tour="${item.target}"]`);
      if (!target) return setRect(null);
      const box = target.getBoundingClientRect();
      setRect({ top: box.top - 5, left: box.left - 5, width: box.width + 10, height: box.height + 10 });
    };
    const frame = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    const onKey = (event) => event.key === "Escape" && onFinish?.();
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      document.removeEventListener("keydown", onKey);
    };
  }, [item.target, onFinish]);

  const tooltip = rect
    ? {
        left: Math.max(12, Math.min(rect.left, window.innerWidth - 312)),
        top: rect.top + rect.height + 12 < window.innerHeight - 170
          ? rect.top + rect.height + 12
          : Math.max(12, rect.top - 160),
      }
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Обучение">
      {rect && <div className="tour-highlight" style={rect} />}
      {!rect && <div className="absolute inset-0 bg-black/60" />}
      <div className="tour-tooltip launcher-theme" style={tooltip}>
        <button type="button" onClick={() => onFinish?.()} className="absolute right-2 top-2 rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white" aria-label="Пропустить">
          <X size={15} />
        </button>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">Шаг {step + 1} из {STEPS.length}</p>
        <h2 className="mt-1 text-base font-bold text-white">{item.title}</h2>
        <p className="mt-1.5 text-xs leading-5 text-zinc-300">{item.text}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={() => onFinish?.()} className="text-[11px] font-semibold text-zinc-400 transition hover:text-white">Пропустить</button>
          <div className="flex gap-1.5">
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)} className="tour-button-secondary"><ArrowLeft size={13} /> Назад</button>
            )}
            <button type="button" onClick={() => step === STEPS.length - 1 ? onFinish?.() : setStep(step + 1)} className="tour-button-primary">
              {step === STEPS.length - 1 ? <><Check size={13} /> Готово</> : <>Далее <ArrowRight size={13} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
