import { MetricCard } from '../components/MetricCard.tsx';

export function MarketPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-primary">Datos de Mercado</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="BTC/USDT" value="$62,500.00" variant="default" />
        <MetricCard title="ETH/USDT" value="$3,420.00" variant="default" />
        <MetricCard title="SOL/USDT" value="$145.80" variant="default" />
        <MetricCard title="BNB/USDT" value="$580.00" variant="default" />
      </div>

      <div className="mt-8 rounded-lg border border-border bg-bg-secondary p-4">
        <h2 className="mb-3 text-sm font-medium text-text-secondary">Watchlist</h2>
        <p className="text-sm text-text-muted">Sin pares configurados.</p>
      </div>
    </div>
  );
}
