import { EmptyState } from '../components/EmptyState.tsx';

export function SignalsPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-primary">Senales y Decisiones</h1>
      <EmptyState
        title="Sin senales"
        description="Las senales generadas por las estrategias apareceraan aqui."
      />
    </div>
  );
}
