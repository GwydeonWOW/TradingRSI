export function SettingsPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-primary">Configuracion</h1>

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-2 text-sm font-medium text-text-primary">Exchange / Binance</h2>
          <p className="text-sm text-text-muted">Conexion con Binance Demo no configurada.</p>
        </div>

        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-2 text-sm font-medium text-text-primary">Seguridad y 2FA</h2>
          <p className="text-sm text-text-muted">2FA pendiente de activacion.</p>
        </div>

        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-2 text-sm font-medium text-text-primary">Riesgo Global</h2>
          <p className="text-sm text-text-muted">Parametros de riesgo no configurados.</p>
        </div>

        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-2 text-sm font-medium text-text-primary">Notificaciones</h2>
          <p className="text-sm text-text-muted">Sin canales configurados.</p>
        </div>

        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-2 text-sm font-medium text-text-primary">Sistema</h2>
          <p className="text-sm text-text-muted">Entorno: simulation</p>
        </div>
      </div>
    </div>
  );
}
