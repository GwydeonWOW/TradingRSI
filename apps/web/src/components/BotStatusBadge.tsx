import type { BotStatusType } from '../api/bot.ts';

interface BotStatusBadgeProps {
  status: BotStatusType;
}

const statusConfig: Record<BotStatusType, { label: string; className: string; pulse: boolean }> = {
  idle: {
    label: 'Inactivo',
    className: 'bg-bg-tertiary text-text-secondary',
    pulse: false,
  },
  running: {
    label: 'Ejecutando',
    className: 'bg-success/15 text-success',
    pulse: true,
  },
  paused: {
    label: 'Pausado',
    className: 'bg-warning/15 text-warning',
    pulse: false,
  },
  error: {
    label: 'Error',
    className: 'bg-danger/15 text-danger',
    pulse: false,
  },
};

export function BotStatusBadge({ status }: BotStatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${config.className}`}
    >
      <span
        className={`h-2 w-2 rounded-full bg-current ${config.pulse ? 'animate-pulse' : ''}`}
      />
      {config.label}
    </span>
  );
}
