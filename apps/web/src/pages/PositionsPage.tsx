import { EmptyState } from '../components/EmptyState.tsx';

export function PositionsPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-primary">Posiciones</h1>
      <EmptyState
        title="Sin posiciones abiertas"
        description="Las posiciones activas se mostraraan aqui."
      />
    </div>
  );
}
