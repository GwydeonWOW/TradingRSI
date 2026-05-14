import { MetricCard } from '../components/MetricCard.tsx';

export function BotPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-primary">Bot en Vivo</h1>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Estado" value="Detenido" variant="danger" />
        <MetricCard title="Estrategia Activa" value="--" variant="default" />
        <MetricCard title="Ultima Evaluacion" value="--" variant="default" />
        <MetricCard title="Uptime" value="0h 0m" variant="default" />
      </div>

      <div className="mt-8 rounded-lg border border-border bg-bg-secondary p-4">
        <h2 className="mb-3 text-sm font-medium text-text-secondary">Log de Actividad</h2>
        <p className="text-sm text-text-muted">El bot no se ha iniciado todavia.</p>
      </div>
    </div>
  );
}
