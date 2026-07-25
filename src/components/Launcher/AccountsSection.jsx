import { memo, useCallback, useState } from "react";
import {
  Check,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { SectionTitle } from "@/components/Launcher/SectionTitle";
import { useConfirm, useToast } from "@/components/ui/UIProvider";
import { getAccountHeadUrl, handleAccountHeadError } from "@/utils/accountHead";

const TYPE_META = {
  offline: { label: "Оффлайн", accent: "from-emerald-400 to-lime-300", Icon: UserRound },
  elyby: { label: "Ely.by", accent: "from-violet-400 to-fuchsia-300", Icon: KeyRound },
};

function metaFor(type) {
  return TYPE_META[type] || { label: type, accent: "from-zinc-400 to-white", Icon: UserRound };
}

const LOGIN_METHODS = [
  { id: "offline", title: "Оффлайн", description: "Локальный ник без авторизации. Не пустит на премиум-серверы." },
  { id: "elyby", title: "Ely.by", description: "Логин/пароль. Подойдёт для серверов с поддержкой Ely.by." },
];

export const AccountsSection = memo(function AccountsSection({ accounts, activeAccountId, onChanged }) {
  const api = typeof window !== "undefined" ? window.poshatAPI : null;
  const toast = useToast();
  const confirm = useConfirm();
  const [isAddMenuOpen, setAddMenuOpen] = useState(false);
  const [addMethod, setAddMethod] = useState(null); // null | 'offline' | 'elyby'

  const activeAccount =
    accounts.find((a) => a.id === activeAccountId) || accounts[0] || null;

  const handleSetActive = async (id) => {
    if (!api || id === activeAccountId) return;
    try {
      await api.accounts.setActive(id);
      onChanged?.();
    } catch (e) {
      toast.err(`Не удалось сменить активный аккаунт: ${e?.message || e}`);
    }
  };

  const handleRemove = async (id) => {
    if (!api) return;
    const acc = accounts.find((a) => a.id === id);
    const ok = await confirm({
      title: "Удалить аккаунт?",
      message: acc
        ? `«${acc.name}» — токены и сессия будут стёрты безвозвратно.`
        : "Токены и сессия будут стёрты безвозвратно.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.accounts.remove(id);
      onChanged?.();
    } catch (e) {
      toast.err(`Не удалось удалить аккаунт: ${e?.message || e}`);
    }
  };

  const closeAddFlow = () => {
    setAddMethod(null);
    setAddMenuOpen(false);
  };

  const onAddDone = () => {
    closeAddFlow();
    onChanged?.();
  };

  return (
    <section className="space-y-3">
      <SectionTitle
        eyebrow="Аккаунты"
        title="Профили и авторизация"
        description="Поддерживаются оффлайн-ники и Ely.by. Токены хранятся локально и обновляются автоматически."
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-3xl border border-white/10 bg-theme-card/80 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Список аккаунтов</h3>
              <p className="text-xs text-zinc-500">
                {accounts.length
                  ? "Кликни по карточке, чтобы сделать активным"
                  : "Аккаунтов пока нет — добавь первый"}
              </p>
            </div>
            <button
              onClick={() => setAddMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-xs font-bold text-[#090b12] transition hover:scale-[1.02]"
            >
              <Plus size={16} /> Добавить
            </button>
          </div>

          {accounts.length === 0 && !isAddMenuOpen && (
            <div className="rounded-3xl border border-dashed border-white/15 p-6 text-center text-sm text-zinc-500">
              Нажми <span className="text-white">«Добавить»</span>, чтобы создать первый профиль.
            </div>
          )}

          <div className="space-y-2">
            {accounts.map((account) => {
              const active = account.id === activeAccountId;
              const meta = metaFor(account.type);
              const Icon = meta.Icon;
              return (
                <div
                  key={account.id}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 transition ${
                    active
                      ? "border-violet-300/35 bg-violet-400/10"
                      : "border-white/10 bg-white/[0.035] hover:bg-white/[0.055]"
                  }`}
                >
                  <button
                    onClick={() => handleSetActive(account.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl">
                      <div
                        className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${meta.accent} text-[#080b12]`}
                      >
                        <Icon size={22} />
                      </div>
                      <img
                        src={getAccountHeadUrl(account)}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={(e) => handleAccountHeadError(e, account)}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{account.name}</p>
                      <p className="text-xs text-zinc-500">
                        {meta.label}
                        {account.expired && account.type !== "offline" && (
                          <span className="ml-2 text-amber-300">токен истёк</span>
                        )}
                      </p>
                    </div>
                  </button>
                  {active && (
                    <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                      Активен
                    </span>
                  )}
                  <button
                    onClick={() => handleRemove(account.id)}
                    className="rounded-2xl bg-red-400/10 p-2.5 text-red-200 transition hover:bg-red-400/20"
                    aria-label="Удалить"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          {activeAccount && (
            <ActiveCard account={activeAccount} />
          )}

          {isAddMenuOpen && !addMethod && (
            <div className="rounded-[32px] border border-violet-300/20 bg-theme-card/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Добавить аккаунт</h3>
                  <p className="text-xs text-zinc-500">Выбери способ входа</p>
                </div>
                <button
                  onClick={closeAddFlow}
                  className="rounded-2xl bg-white/8 p-2.5 text-zinc-300 hover:bg-white/12"
                  aria-label="Закрыть"
                >
                  <X size={17} />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {LOGIN_METHODS.map((m) => {
                  const meta = metaFor(m.id);
                  const Icon = meta.Icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setAddMethod(m.id)}
                      className="flex items-start gap-4 rounded-3xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.065]"
                    >
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${meta.accent} text-[#080b12]`}
                      >
                        <Icon size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-white">{m.title}</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">{m.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {addMethod === "offline" && (
            <OfflineForm api={api} onDone={onAddDone} onCancel={closeAddFlow} />
          )}
          {addMethod === "elyby" && (
            <ElyByForm api={api} onDone={onAddDone} onCancel={closeAddFlow} />
          )}
        </div>
      </div>
    </section>
  );
});

function ActiveCard({ account }) {
  const meta = metaFor(account.type);
  const Icon = meta.Icon;
  let added = "—";
  if (account.addedAt) {
    try { added = new Date(account.addedAt).toLocaleDateString(); } catch { added = "—"; }
  }
  return (
    <div className="rounded-3xl border border-white/10 bg-theme-card/80 p-4">
      <div className="mb-4 flex items-center gap-3">
        <div
          className={`relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-[24px] bg-gradient-to-br ${meta.accent} text-[#080b12]`}
        >
          <Icon size={28} />
          <img
            src={getAccountHeadUrl(account)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => handleAccountHeadError(e, account)}
          />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">
            Активный профиль
          </p>
          <h3 className="truncate text-2xl font-bold text-white">{account.name}</h3>
          <p className="text-sm text-zinc-500">{meta.label}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-2xl bg-white/[0.035] p-3 text-zinc-400">
          UUID
          <br />
          <span
            className="block truncate font-mono text-[11px] text-white"
          >
            {account.uuid ? `${account.uuid.slice(0, 8)}…` : "—"}
          </span>
        </div>
        <div className="rounded-2xl bg-white/[0.035] p-3 text-zinc-400">
          Добавлен
          <br />
          <span className="text-white">{added}</span>
        </div>
        <div className="rounded-2xl bg-white/[0.035] p-3 text-zinc-400">
          Токен
          <br />
          <span className={account.expired ? "text-amber-300" : "text-white"}>
            {account.type === "offline"
              ? "не требуется"
              : account.expired
              ? "истёк"
              : "ок"}
          </span>
        </div>
      </div>
    </div>
  );
}

function OfflineForm({ api, onDone, onCancel }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      await api.accounts.addOffline(name);
      onDone();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[32px] border border-emerald-300/20 bg-theme-card/95 p-5">
      <FormHeader title="Оффлайн-аккаунт" subtitle="Введи ник (2-16 символов: латиница, цифры, _)" onCancel={onCancel} />
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Player123"
        className="mb-3 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none focus:border-emerald-300/40"
      />
      {error && <p className="mb-3 text-xs text-red-300">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || !name.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-bold text-[#080b12] transition hover:scale-[1.01] disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        Создать
      </button>
    </div>
  );
}

function ElyByForm({ api, onDone, onCancel }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!api) return;
    setBusy(true);
    setError(null);
    try {
      await api.accounts.elybyLogin(username, password);
      onDone();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[32px] border border-violet-300/20 bg-theme-card/95 p-5">
      <FormHeader title="Ely.by" subtitle="Email/ник и пароль от ely.by" onCancel={onCancel} />
      <input
        autoFocus
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Email или ник"
        className="mb-2 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none focus:border-violet-300/40"
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        type="password"
        placeholder="Пароль"
        className="mb-3 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none focus:border-violet-300/40"
      />
      {error && <p className="mb-3 text-xs text-red-300">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || !username || !password}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-400 px-4 py-3 text-sm font-bold text-[#080b12] transition hover:scale-[1.01] disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        Войти
      </button>
    </div>
  );
}

function FormHeader({ title, subtitle, onCancel }) {
  return (
    <div className="mb-4 flex items-start justify-between">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-zinc-500">{subtitle}</p>
      </div>
      <button
        onClick={onCancel}
        className="rounded-2xl bg-white/8 p-2.5 text-zinc-300 hover:bg-white/12"
        aria-label="Закрыть"
      >
        <X size={17} />
      </button>
    </div>
  );
}
