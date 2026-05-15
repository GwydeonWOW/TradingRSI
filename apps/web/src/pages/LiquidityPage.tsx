import { useState, useEffect, useCallback } from 'react';
import { liquidityApi, type LiquidityResult } from '../api/liquidity.ts';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'] as const;

function stateColor(state: string): string {
  switch (state) {
    case 'excellent': return 'text-success';
    case 'good': return 'text-success';
    case 'acceptable': return 'text-warning';
    case 'weak': return 'text-danger';
    case 'critical': return 'text-danger';
    default: return 'text-text-muted';
  }
}

function stateBg(state: string): string {
  switch (state) {
    case 'excellent': return 'bg-success/10';
    case 'good': return 'bg-success/10';
    case 'acceptable': return 'bg-warning/10';
    case 'weak': return 'bg-danger/10';
    case 'critical': return 'bg-danger/10';
    default: return 'bg-bg-tertiary';
  }
}

function stateLabel(state: string): string {
  switch (state) {
    case 'excellent': return 'Excelente';
    case 'good': return 'Bueno';
    case 'acceptable': return 'Aceptable';
    case 'weak': return 'Debil';
    case 'critical': return 'Critico';
    default: return state;
  }
}

function decisionBadge(decision: string): { text: string; class: string } {
  switch (decision) {
    case 'ALLOW': return { text: 'PERMITIDO', class: 'bg-success/10 text-success border-success/30' };
    case 'REDUCE': return { text: 'REDUCIR', class: 'bg-warning/10 text-warning border-warning/30' };
    case 'BLOCK': return { text: 'BLOQUEADO', class: 'bg-danger/10 text-danger border-danger/30' };
    default: return { text: decision, class: 'bg-bg-tertiary text-text-muted border-border' };
  }
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 65 ? 'bg-success' : score >= 50 ? 'bg-warning' : 'bg-danger';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, score)}%` }} />
    </div>
  );
}

function LiquidityCard({ symbol }: { symbol: string }) {
  const [data, setData] = useState<LiquidityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const res = await liquidityApi.getCurrent(symbol);
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    const interval = setInterval(fetch, 60000);
    return () => clearInterval(interval);
  }, [fetch]);

  if (loading) return <div className="rounded-lg border border-border bg-bg-secondary p-6"><LoadingSpinner /></div>;

  if (error || !data) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-6">
        <p className="text-sm font-medium text-text-primary">{symbol}</p>
        <p className="mt-2 text-sm text-danger">{error ?? 'Sin datos'}</p>
      </div>
    );
  }

  const badge = decisionBadge(data.decision);

  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold text-text-primary">{symbol}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`text-3xl font-bold ${stateColor(data.state)}`}>{data.score}</span>
            <span className="text-sm text-text-muted">/100</span>
          </div>
        </div>
        <div className="text-right">
          <span className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${badge.class}`}>
            {badge.text}
          </span>
          <p className={`mt-1 text-xs font-medium ${stateColor(data.state)}`}>
            {stateLabel(data.state)}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            Confianza: {(data.confidence * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      <ScoreBar score={data.score} />

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded bg-bg-primary p-2">
          <p className="text-text-muted">Ejecucion</p>
          <p className={`font-semibold ${stateColor(data.execution.state)}`}>{data.execution.score}</p>
        </div>
        <div className="rounded bg-bg-primary p-2">
          <p className="text-text-muted">Actividad</p>
          <p className={`font-semibold ${stateColor(data.activity.state)}`}>{data.activity.score}</p>
        </div>
        <div className="rounded bg-bg-primary p-2">
          <p className="text-text-muted">Fragilidad</p>
          <p className={`font-semibold ${stateColor(data.fragility.state)}`}>{data.fragility.score}</p>
        </div>
        <div className="rounded bg-bg-primary p-2">
          <p className="text-text-muted">Datos</p>
          <p className={`font-semibold ${stateColor(data.dataQuality.state)}`}>{data.dataQuality.score}</p>
        </div>
      </div>

      {data.execution.metrics && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs">
          <div className="flex justify-between">
            <span className="text-text-muted">Spread</span>
            <span className="font-medium text-text-primary">{(data.execution.metrics['spreadBps'] ?? 0).toFixed(1)} bps</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Slippage</span>
            <span className="font-medium text-text-primary">{(data.execution.metrics['slippageBps'] ?? 0).toFixed(1)} bps</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Depth 25bps</span>
            <span className="font-medium text-text-primary">${((data.execution.metrics['depth25bpsQuote'] ?? 0) / 1000).toFixed(0)}K</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Vol 24h</span>
            <span className="font-medium text-text-primary">${((data.activity.metrics['quoteVolume24h'] ?? 0) / 1e6).toFixed(0)}M</span>
          </div>
        </div>
      )}

      {data.reasons.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1 text-xs font-medium text-text-muted">Razones</p>
          <ul className="space-y-0.5">
            {data.reasons.slice(0, 4).map((r, i) => (
              <li key={i} className="text-xs text-text-secondary">&bull; {r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function LiquidityPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Liquidity Health</h1>
          <p className="mt-1 text-sm text-text-muted">
            Indicador de salud de liquidez en tiempo real. Determina si es recomendable operar.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success">
            80-100: Permitido
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
            50-79: Reducir
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-1 text-xs font-medium text-danger">
            0-49: Bloqueado
          </span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {SYMBOLS.map((symbol) => (
          <LiquidityCard key={symbol} symbol={symbol} />
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-bg-secondary p-4">
        <h2 className="text-sm font-medium text-text-primary">Como funciona</h2>
        <p className="mt-2 text-xs text-text-muted">
          El Liquidity Health Score mide la calidad de liquidez en tiempo real combinando: spread, profundidad del
          order book, slippage estimado, volumen, volatilidad y latencia. Un score bajo indica que el mercado no
          tiene suficiente liquidez para ejecutar ordenes con bajo coste. El bot usa este indicador para permitir,
          reducir o bloquear nuevas entradas.
        </p>
      </div>
    </div>
  );
}
