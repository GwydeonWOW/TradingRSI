import type { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  value: ReactNode;
  subtitle?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

const variantBorderClasses: Record<NonNullable<MetricCardProps['variant']>, string> = {
  default: 'border-l-border',
  success: 'border-l-success',
  warning: 'border-l-warning',
  danger: 'border-l-danger',
};

const variantValueClasses: Record<NonNullable<MetricCardProps['variant']>, string> = {
  default: 'text-text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export function MetricCard({ title, value, subtitle, variant = 'default' }: MetricCardProps) {
  return (
    <div
      className={`rounded-lg border border-border border-l-4 bg-bg-secondary p-4 ${variantBorderClasses[variant]}`}
    >
      <p className="text-sm text-text-secondary">{title}</p>
      <p className={`mt-1 text-2xl font-semibold ${variantValueClasses[variant]}`}>{value}</p>
      {subtitle && <p className="mt-1 text-xs text-text-muted">{subtitle}</p>}
    </div>
  );
}
