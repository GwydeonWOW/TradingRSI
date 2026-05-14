import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { tradingApi, type LiveReadinessResult } from '../api/trading.ts';

interface ChecklistItem {
  key: string;
  label: string;
  description: string;
  passed: boolean;
}

function mapChecklistItems(checks: LiveReadinessResult['checks']): ChecklistItem[] {
  return [
    {
      key: 'allowLiveTradingEnvSet',
      label: 'ALLOW_LIVE_TRADING habilitado',
      description: 'La variable de entorno ALLOW_LIVE_TRADING debe estar en true',
      passed: checks.allowLiveTradingEnvSet,
    },
    {
      key: 'strategyApprovedForLive',
      label: 'Estrategia aprobada para live',
      description: 'Al menos una estrategia debe haber sido promovida a live',
      passed: checks.strategyApprovedForLive,
    },
    {
      key: 'riskLimitsConfigured',
      label: 'Limites de riesgo configurados',
      description: 'Los limites de riesgo especificos para live deben estar configurados',
      passed: checks.riskLimitsConfigured,
    },
    {
      key: 'reconciliationActive',
      label: 'Reconciliacion activa',
      description: 'La reconciliacion debe haberse ejecutado en las ultimas 24 horas',
      passed: checks.reconciliationActive,
    },
    {
      key: 'testOrdersPassed',
      label: 'Ordenes de prueba validadas',
      description: 'Al menos una orden de prueba debe haber sido validada exitosamente',
      passed: checks.testOrdersPassed,
    },
    {
      key: 'auditLogHealthy',
      label: 'Log de auditoria saludable',
      description: 'El log de auditoria debe tener eventos recientes (ultima hora)',
      passed: checks.auditLogHealthy,
    },
    {
      key: 'binanceConnected',
      label: 'Conexion a Binance',
      description: 'Debe poder alcanzar la API de Binance',
      passed: checks.binanceConnected,
    },
    {
      key: 'credentialsValid',
      label: 'Credenciales validas',
      description: 'Las claves API deben funcionar para el endpoint de cuenta',
      passed: checks.credentialsValid,
    },
  ];
}

export function LiveReadinessPage() {
  const [data, setData] = useState<LiveReadinessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await tradingApi.getLiveReadiness();
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error verificando preparacion');
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const items = data ? mapChecklistItems(data.checks) : [];

  return (
    <div>
      {/* Warning banner */}
      <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
        <p className="text-sm font-medium text-warning">
          El trading en vivo esta bloqueado por defecto
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Todas las condiciones deben cumplirse antes de habilitar trading con dinero real.
        </p>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">Preparacion para Live Trading</h1>
        <div className="flex items-center gap-3">
          <Link
            to="/settings"
            className="text-sm text-accent hover:text-accent-hover"
          >
            Volver a Configuracion
          </Link>
          <button
            onClick={fetchData}
            disabled={checking}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {checking ? 'Verificando...' : 'Verificar de nuevo'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Cargando verificacion...</p>
      ) : data ? (
        <>
          {/* Overall status */}
          <div className={`mb-6 rounded-lg border p-4 ${
            data.allowed
              ? 'border-success/40 bg-success/10'
              : 'border-danger/40 bg-danger/10'
          }`}>
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-bold ${data.allowed ? 'text-success' : 'text-danger'}`}>
                {data.allowed ? 'LISTO PARA LIVE' : 'NO PREPARADO'}
              </span>
            </div>
            {!data.allowed && data.missing.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-danger">Elementos faltantes:</p>
                <ul className="mt-1 list-inside list-disc space-y-1">
                  {data.missing.map((item, i) => (
                    <li key={i} className="text-sm text-text-muted">{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Checklist */}
          <div className="rounded-lg border border-border bg-bg-secondary">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-medium text-text-primary">Checklist de Preparacion</h2>
            </div>
            <div className="divide-y divide-border">
              {items.map((item) => (
                <div key={item.key} className="flex items-start gap-3 px-4 py-3">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    item.passed
                      ? 'bg-success/20 text-success'
                      : 'bg-danger/20 text-danger'
                  }`}>
                    {item.passed ? '✓' : '✗'}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${item.passed ? 'text-text-primary' : 'text-danger'}`}>
                      {item.label}
                    </p>
                    <p className="text-xs text-text-muted">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
