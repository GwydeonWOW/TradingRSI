import { EmptyState } from '../components/EmptyState.tsx';

export function OrdersPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-primary">Ordenes</h1>
      <EmptyState
        title="Sin ordenes"
        description="Las ordenes ejecutadas apareceraan aqui."
      />
    </div>
  );
}
