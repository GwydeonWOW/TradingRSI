import { EmptyState } from '../components/EmptyState.tsx';

export function AuditPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-primary">Auditoria - Eventos</h1>
      <EmptyState
        title="Sin eventos de auditoria"
        description="Los eventos del sistema se registraraan aqui automaticamente."
      />
    </div>
  );
}
