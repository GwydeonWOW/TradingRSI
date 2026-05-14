import { EmptyState } from '../components/EmptyState.tsx';

export function BacktestsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">Backtesting</h1>
        <button
          type="button"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Nuevo Backtest
        </button>
      </div>
      <EmptyState
        title="Sin backtests"
        description="Ejecuta un backtest para validar tus estrategias con datos historicos."
      />
    </div>
  );
}
