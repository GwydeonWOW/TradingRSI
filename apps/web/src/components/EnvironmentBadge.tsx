interface EnvironmentBadgeProps {
  environment: string;
  variant?: 'neutral' | 'blue' | 'yellow' | 'red';
}

const variantClasses: Record<NonNullable<EnvironmentBadgeProps['variant']>, string> = {
  neutral: 'bg-bg-tertiary text-text-secondary',
  blue: 'bg-info/20 text-info',
  yellow: 'bg-warning/20 text-warning',
  red: 'bg-danger/20 text-danger',
};

export function EnvironmentBadge({ environment, variant = 'neutral' }: EnvironmentBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${variantClasses[variant]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {environment}
    </span>
  );
}
