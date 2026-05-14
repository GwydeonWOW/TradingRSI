import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MetricCard } from '../components/MetricCard.tsx';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { BotStatusBadge } from '../components/BotStatusBadge.tsx';
import { botApi, type BotStatus, type BotEvent } from '../api/bot.ts';

function formatUptime(startedAt: number | null): string {
  if (!startedAt) return '0h 0m';
  const diff = Date.now() - startedAt;
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

function formatTime(ts: number | null): string {
  if (!ts) return '--';
  return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    bot_started: 'Bot iniciado',
    bot_stopped: 'Bot detenido',
    evaluation: 'Evaluacion',
    signal: 'Senal generada',
    order_placed: 'Orden colocada',
    error: 'Error',
    kill_switch: 'Kill Switch',
  };
  return labels[type] ?? type;
}

export function DashboardPage() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [events, setEvents] = useState<BotEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, eventsRes] = await Promise.all([
        botApi.getStatus(),
        botApi.getEvents(10),
      ]);
      setStatus(statusRes.data);
      setEvents(eventsRes.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) return <LoadingSpinner size="lg" />;

  if (error && !status) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-text-primary">Dashboard</h1>
        <EmptyState title="Error de conexion" description={error} />
      </div>
    );
  }

  const statusVariant = status?.status === 'running' ? 'success' : status?.status === 'error' ? 'danger' : status?.status === 'paused' ? 'warning' : 'default';

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-text-primary">Dashboard</h1>
        <div className="flex gap-3">
          {status?.status === 'running' ? (
            <Link
              to="/bot"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Ver Bot en Vivo
            </Link>
          ) : (
            <Link
              to="/bot"
              className="rounded-lg border border-border bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover"
            >
              Iniciar Bot
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Estado del Bot"
          value={status ? <BotStatusBadge status={status.status} /> : '--'}
          subtitle={status?.errorMessage ?? undefined}
          variant={statusVariant}
        />
        <MetricCard
          title="Entorno"
          value="Binance Demo"
          subtitle="Modo simulacion"
          variant="default"
        />
        <MetricCard
          title="Estrategia Activa"
          value={status?.strategyName ?? 'Ninguna'}
          variant={status?.activeStrategyId ? 'success' : 'default'}
        />
        <MetricCard
          title="Evaluaciones"
          value={status?.cycleCount ?? 0}
          subtitle="Ciclos totales"
          variant="default"
        />
        <MetricCard
          title="Ultima Senal"
          value={status?.lastSignalType ?? 'Ninguna'}
          subtitle={status?.lastEvaluationAt ? formatTime(status.lastEvaluationAt) : undefined}
          variant={
            status?.lastSignalType === 'BUY_SIGNAL' || status?.lastSignalType === 'SELL_SIGNAL'
              ? 'success'
              : 'default'
          }
        />
        <MetricCard
          title="Uptime"
          value={formatUptime(status?.startedAt ?? null)}
          subtitle={status?.startedAt ? `Desde ${new Date(status.startedAt).toLocaleTimeString('es-ES')}` : undefined}
          variant={status?.status === 'running' ? 'success' : 'default'}
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-text-secondary">Actividad Reciente</h2>
        <div className="rounded-lg border border-border bg-bg-secondary">
          {events.length === 0 ? (
            <div className="p-4 text-sm text-text-muted">Sin actividad reciente</div>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((event, i) => (
                <li key={`${event.timestamp}-${i}`} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        event.type === 'error' || event.type === 'kill_switch'
                          ? 'bg-danger'
                          : event.type === 'signal' || event.type === 'order_placed'
                            ? 'bg-success'
                            : 'bg-accent'
                      }`}
                    />
                    <span className="text-sm text-text-primary">{eventTypeLabel(event.type)}</span>
                  </div>
                  <span className="text-xs text-text-muted">
                    {new Date(event.timestamp).toLocaleTimeString('es-ES')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
