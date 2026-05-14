import { EmptyState } from '../components/EmptyState.tsx';

export function StrategiesPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">Estrategias</h1>
        <button
          type="button"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Crear Estrategia
        </button>
      </div>
      <EmptyState
        title="Sin estrategias"
        description="Crea tu primera estrategia para comenzar a operar."
      />
    </div>
  );
}
