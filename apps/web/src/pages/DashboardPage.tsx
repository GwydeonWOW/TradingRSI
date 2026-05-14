import { MetricCard } from '../components/MetricCard.tsx';

const metrics = [
  {
    title: 'PnL Total',
    value: '+$1,234.56',
    subtitle: 'Ultimas 24h',
    variant: 'success' as const,
  },
  {
    title: 'Balance',
    value: '$10,500.00',
    subtitle: 'USDT disponible',
    variant: 'default' as const,
  },
  {
    title: 'Posiciones Abiertas',
    value: '3',
    subtitle: '2 en beneficio',
    variant: 'default' as const,
  },
  {
    title: 'Senales Hoy',
    value: '12',
    subtitle: '5 ejecutadas, 7 pendientes',
    variant: 'warning' as const,
  },
];

export function DashboardPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-primary">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <MetricCard
            key={m.title}
            title={m.title}
            value={m.value}
            subtitle={m.subtitle}
            variant={m.variant}
          />
        ))}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-3 text-sm font-medium text-text-secondary">Ultimas Ordenes</h2>
          <p className="text-sm text-text-muted">Sin datos disponibles</p>
        </div>
        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-3 text-sm font-medium text-text-secondary">Senales Recientes</h2>
          <p className="text-sm text-text-muted">Sin datos disponibles</p>
        </div>
      </div>
    </div>
  );
}
