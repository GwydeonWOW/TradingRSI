import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StrategyStatus } from '@cryptorsi/shared';
import { strategiesApi } from '../api/strategies.ts';
import type { StrategyListItem } from '../api/strategies.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';

type FilterStatus = 'all' | StrategyStatus;

const filters: Array<{ value: FilterStatus; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Activa' },
  { value: 'paused', label: 'Pausada' },
  { value: 'archived', label: 'Archivada' },
];

export function StrategiesPage() {
  const navigate = useNavigate();
  const [strategies, setStrategies] = useState<StrategyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');

  useEffect(() => {
    fetchStrategies();
  }, [filter]);

  async function fetchStrategies() {
    setLoading(true);
    setError(null);
    try {
      const result = await strategiesApi.list({
        status: filter === 'all' ? undefined : filter,
      });
      setStrategies(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar estrategias');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStatus(strategy: StrategyListItem) {
    try {
      if (strategy.status === 'active') {
        await strategiesApi.pause(strategy.id);
      } else {
        await strategiesApi.activate(strategy.id);
      }
      fetchStrategies();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar estado');
    }
  }

  async function handleDuplicate(id: string) {
    try {
      const result = await strategiesApi.duplicate(id);
      navigate(`/strategies/${result.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al duplicar');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">Estrategias</h1>
        <button
          type="button"
          onClick={() => navigate('/strategies/new')}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Nueva Estrategia
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && <LoadingSpinner />}

      {/* Content */}
      {!loading && !error && strategies.length === 0 && (
        <EmptyState
          title="Sin estrategias"
          description="Crea tu primera estrategia para comenzar a operar."
        />
      )}

      {!loading && !error && strategies.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-bg-tertiary">
              <tr>
                <th className="px-4 py-3 font-medium text-text-secondary">Nombre</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Estado</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Modo</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Version</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Simbolos</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Ultima actualizacion</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {strategies.map((s) => (
                <tr key={s.id} className="hover:bg-bg-hover">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/strategies/${s.id}`)}
                      className="font-medium text-text-primary hover:text-accent"
                    >
                      {s.name}
                    </button>
                    {s.description && (
                      <p className="mt-0.5 text-xs text-text-muted truncate max-w-48">{s.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{s.mode}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {s.currentVersion != null ? `v${s.currentVersion}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {s.symbols.length > 2
                      ? `${s.symbols.slice(0, 2).join(', ')} +${s.symbols.length - 2}`
                      : s.symbols.join(', ')}
                  </td>
                  <td className="px-4 py-3 text-text-muted text-xs">
                    {new Date(s.updatedAt).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/strategies/${s.id}`)}
                        className="rounded px-2 py-1 text-xs text-accent hover:bg-accent/10"
                      >
                        Ver
                      </button>
                      {(s.status === 'draft' || s.status === 'paused') && (
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(s)}
                          className="rounded px-2 py-1 text-xs text-success hover:bg-success/10"
                        >
                          Activar
                        </button>
                      )}
                      {s.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(s)}
                          className="rounded px-2 py-1 text-xs text-warning hover:bg-warning/10"
                        >
                          Pausar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDuplicate(s.id)}
                        className="rounded px-2 py-1 text-xs text-text-secondary hover:bg-bg-hover"
                      >
                        Duplicar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
