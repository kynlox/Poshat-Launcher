import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  name: string;
}

interface State {
  error: Error | null;
}

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[poshat] Section "${this.props.name}" crashed:`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <section className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border border-red-400/20 bg-red-400/[0.04] p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">
          {this.props.name}
        </p>
        <p className="text-sm text-zinc-300">Этот раздел временно недоступен</p>
        <p className="max-w-md text-center text-xs text-zinc-500">
          {this.state.error.message || String(this.state.error)}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#090b12] transition hover:bg-zinc-200"
        >
          Попробовать снова
        </button>
      </section>
    );
  }
}
