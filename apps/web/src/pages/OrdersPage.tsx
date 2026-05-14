import { useEffect, useState, useCallback } from 'react';
import { tradingApi, type Order } from '../api/trading.ts';
import { EmptyState } from '../components/EmptyState.tsx';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symbolFilter, setSymbolFilter] = useState('');
  const [sideFilter, setSideFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchOrders = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (symbolFilter) params.symbol = symbolFilter;
      if (sideFilter) params.side = sideFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await tradingApi.getOrders(Object.keys(params).length > 0 ? params : undefined);
      setOrders(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar ordenes');
    } finally {
      setLoading(false);
    }
  }, [symbolFilter, sideFilter, statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-primary">Ordenes</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Simbolo..."
          value={symbolFilter}
          onChange={(e) => setSymbolFilter(e.target.value.toUpperCase())}
          className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
        <select
          value={sideFilter}
          onChange={(e) => setSideFilter(e.target.value)}
          className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
        >
          <option value="">Todas</option>
          <option value="BUY">Buy</option>
          <option value="SELL">Sell</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
        >
          <option value="">Todos los estados</option>
          <option value="NEW">New</option>
          <option value="FILLED">Filled</option>
          <option value="PARTIALLY_FILLED">Partial</option>
          <option value="CANCELED">Canceled</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          title="Sin ordenes"
          description="Las ordenes ejecutadas se mostraran aqui."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-secondary text-left">
                <th className="px-4 py-3 font-medium text-text-secondary">Date</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Symbol</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Side</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Type</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Status</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Quote Amount</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Executed Qty</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Avg Price</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Exchange</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border hover:bg-bg-hover">
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(o.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-text-primary">{o.symbol}</td>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${o.side === 'BUY' ? 'text-success' : 'text-danger'}`}>
                      {o.side}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{o.type}</td>
                  <td className="px-4 py-3">
                    <OrderStatusPill status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-text-primary">
                    {o.quoteAmount !== null ? `$${o.quoteAmount.toFixed(2)}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-text-primary">
                    {o.executedQuantity !== null ? o.executedQuantity.toFixed(6) : '-'}
                  </td>
                  <td className="px-4 py-3 text-text-primary">
                    {o.avgPrice !== null ? `$${o.avgPrice.toFixed(2)}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{o.exchange}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrderStatusPill({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    NEW: { label: 'New', className: 'bg-info/15 text-info' },
    FILLED: { label: 'Filled', className: 'bg-success/15 text-success' },
    PARTIALLY_FILLED: { label: 'Partial', className: 'bg-warning/15 text-warning' },
    CANCELED: { label: 'Canceled', className: 'bg-bg-tertiary text-text-secondary' },
    REJECTED: { label: 'Rejected', className: 'bg-danger/15 text-danger' },
    PENDING_CANCEL: { label: 'Pending', className: 'bg-warning/15 text-warning' },
    EXPIRED: { label: 'Expired', className: 'bg-bg-tertiary text-text-secondary' },
  };
  const c = config[status] ?? { label: status, className: 'bg-bg-tertiary text-text-secondary' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}
