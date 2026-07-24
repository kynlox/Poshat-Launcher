import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Poshat UI crashed", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex h-screen items-center justify-center bg-[#0a0d16] p-6 text-white">
        <section className="w-full max-w-xl rounded-3xl border border-red-400/20 bg-red-400/[0.06] p-6 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">
            Ошибка интерфейса
          </p>
          <h1 className="mt-2 text-xl font-bold">Poshat Launcher не смог открыть экран</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Перезапустите интерфейс. Если ошибка повторится, приложите текст ниже к отчёту.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-xs text-red-100">
            {this.state.error.message || String(this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#090b12] transition hover:bg-zinc-200"
          >
            Перезапустить интерфейс
          </button>
        </section>
      </main>
    );
  }
}
