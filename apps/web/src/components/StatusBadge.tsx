import type { StrategyStatus } from '@cryptorsi/shared';

interface StatusBadgeProps {
  status: StrategyStatus;
}

const statusConfig: Record<StrategyStatus, { label: string; className: string }> = {
  draft: {
    label: 'Draft',
    className: 'bg-bg-tertiary text-text-secondary',
  },
  active: {
    label: 'Activa',
    className: 'bg-success/15 text-success',
  },
  paused: {
    label: 'Pausada',
    className: 'bg-warning/15 text-warning',
  },
  archived: {
    label: 'Archivada',
    className: 'bg-danger/15 text-danger',
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
