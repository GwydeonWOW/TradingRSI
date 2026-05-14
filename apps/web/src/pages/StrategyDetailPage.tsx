import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { strategiesApi } from '../api/strategies.ts';
import type { StrategyDetail } from '../api/strategies.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';
import { MetricCard } from '../components/MetricCard.tsx';

export function StrategyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [strategy, setStrategy] = useState<StrategyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchStrategy();
  }, [id]);

  async function fetchStrategy() {
    setLoading(true);
    setError(null);
    try {
      const result = await strategiesApi.get(id!);
      setStrategy(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar estrategia');
    } finally {
      setLoading(false);
    }
  }

  async function handleActivate() {
    try {
      await strategiesApi.activate(id!);
      fetchStrategy();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al activar');
    }
  }

  async function handlePause() {
    try {
      await strategiesApi.pause(id!);
      fetchStrategy();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al pausar');
    }
  }

  async function handleDuplicate() {
    try {
      const result = await strategiesApi.duplicate(id!);
      navigate(`/strategies/${result.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al duplicar');
    }
  }

  async function handleArchive() {
    try {
      await strategiesApi.update(id!, { status: 'archived' });
      fetchStrategy();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al archivar');
    }
  }

  if (loading) return <LoadingSpinner />;

  if (error || !strategy) {
    return (
      <div>
        <button
          type="button"
          onClick={() => navigate('/strategies')}
          className="mb-4 text-sm text-accent hover:text-accent-hover"
        >
          &larr; Volver a estrategias
        </button>
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error ?? 'Estrategia no encontrada'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/strategies')}
        className="mb-4 text-sm text-accent hover:text-accent-hover"
      >
        &larr; Volver a estrategias
      </button>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-text-primary">{strategy.name}</h1>
            <StatusBadge status={strategy.status} />
          </div>
          {strategy.description && (
            <p className="mt-1 text-sm text-text-secondary">{strategy.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate(`/strategies/${strategy.id}/editor`)}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Editar
          </button>
          {(strategy.status === 'draft' || strategy.status === 'paused') && (
            <button
              type="button"
              onClick={handleActivate}
              className="rounded-md bg-success/15 px-3 py-1.5 text-sm font-medium text-success hover:bg-success/25"
            >
              Activar
            </button>
          )}
          {strategy.status === 'active' && (
            <button
              type="button"
              onClick={handlePause}
              className="rounded-md bg-warning/15 px-3 py-1.5 text-sm font-medium text-warning hover:bg-warning/25"
            >
              Pausar
            </button>
          )}
          <button
            type="button"
            onClick={handleDuplicate}
            className="rounded-md bg-bg-tertiary px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-bg-hover"
          >
            Duplicar
          </button>
          {strategy.status !== 'archived' && (
            <button
              type="button"
              onClick={handleArchive}
              className="rounded-md bg-danger/15 px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/25"
            >
              Archivar
            </button>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Operaciones" value="-" subtitle="Placeholder" />
        <MetricCard title="PnL" value="-" subtitle="Placeholder" />
        <MetricCard title="Win Rate" value="-" subtitle="Placeholder" />
        <MetricCard title="Version activa" value={strategy.currentVersion != null ? `v${strategy.currentVersion}` : '-'} />
      </div>

      {/* Config summary */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {/* General info */}
        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-3 text-sm font-medium text-text-secondary">Configuracion General</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">Modo</dt>
              <dd className="text-text-primary">{strategy.mode}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Entorno</dt>
              <dd className="text-text-primary">{strategy.environment}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Simbolos</dt>
              <dd className="text-text-primary">{strategy.symbols.join(', ')}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Creada</dt>
              <dd className="text-text-primary">
                {new Date(strategy.createdAt).toLocaleDateString('es-ES')}
              </dd>
            </div>
          </dl>
        </div>

        {/* Version config JSON */}
        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-3 text-sm font-medium text-text-secondary">Configuracion (JSON)</h2>
          <pre className="overflow-auto rounded bg-bg-primary p-3 text-xs text-text-muted">
            {/* Show config if we had it, placeholder for now */}
            {JSON.stringify({ symbols: strategy.symbols, mode: strategy.mode, environment: strategy.environment }, null, 2)}
          </pre>
        </div>
      </div>

      {/* Version history */}
      <div className="mb-6 rounded-lg border border-border bg-bg-secondary p-4">
        <h2 className="mb-3 text-sm font-medium text-text-secondary">Historial de Versiones</h2>
        {strategy.versions.length === 0 ? (
          <p className="text-sm text-text-muted">Sin versiones</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border">
              <tr>
                <th className="pb-2 font-medium text-text-muted">Version</th>
                <th className="pb-2 font-medium text-text-muted">Fecha</th>
                <th className="pb-2 font-medium text-text-muted">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {strategy.versions.map((v) => (
                <tr key={v.id}>
                  <td className="py-2 text-text-primary">v{v.version}</td>
                  <td className="py-2 text-text-secondary">
                    {new Date(v.createdAt).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-2">
                    <button type="button" className="text-xs text-accent hover:text-accent-hover">
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent orders placeholder */}
      <div className="rounded-lg border border-border bg-bg-secondary p-4">
        <h2 className="mb-3 text-sm font-medium text-text-secondary">Ordenes Recientes</h2>
        <p className="text-sm text-text-muted">Sin datos disponibles</p>
      </div>
    </div>
  );
}
