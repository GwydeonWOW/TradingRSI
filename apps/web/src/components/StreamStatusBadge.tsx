interface StreamStatusBadgeProps {
  klineConnected: boolean;
  userStreamConnected: boolean;
  subscriptionsCount: number;
}

export function StreamStatusBadge({ klineConnected, userStreamConnected, subscriptionsCount }: StreamStatusBadgeProps) {
  const allConnected = klineConnected && userStreamConnected;
  const klineOnly = klineConnected && !userStreamConnected;

  if (allConnected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-sm font-medium text-success">
        <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
        Streams Activos
        <span className="ml-1 text-xs opacity-75">({subscriptionsCount})</span>
      </span>
    );
  }

  if (klineOnly) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-sm font-medium text-success">
        <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
        Kline Activo
        <span className="ml-1 text-xs opacity-75">({subscriptionsCount})</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-3 py-1 text-sm font-medium text-danger">
      <span className="h-2 w-2 rounded-full bg-current" />
      Streams Desconectados
    </span>
  );
}
