# CryptoRSI v2 — Plan técnico avanzado

**Nueva plataforma para trading algorítmico con Binance Demo, preparada para futura producción**  
**Fecha:** 14/05/2026  
**Proyecto base de referencia:** [`GwydeonWOW/CryptoRSI`](https://github.com/GwydeonWOW/CryptoRSI)  
**Entregable:** Plan técnico de producto, arquitectura, datos, autenticación 2FA, cifrado de información sensible, seguridad, ejecución, roadmap y criterios de aceptación.

> **Decisión principal**  
> Crear una nueva web y un nuevo backend basados en los aprendizajes de CryptoRSI, **no migrar el código actual**. La versión actual queda como referencia funcional: RSI, snapshots, simulación, tokens, backtests y dashboard. La nueva versión nace con estrategias configurables desde UI, motor de ejecución Binance Demo, auditoría completa y guardarraíles para futura producción.

> **Aviso**  
> Este documento es técnico. No constituye asesoramiento financiero ni recomendación de inversión.

---

## Índice

1. [Objetivo y alcance](#1-objetivo-y-alcance)
2. [Diagnóstico de la versión actual](#2-diagnóstico-de-la-versión-actual)
3. [Principios de diseño de CryptoRSI v2](#3-principios-de-diseño-de-cryptorsi-v2)
4. [Decisiones de stack tecnológico](#4-decisiones-de-stack-tecnológico)
5. [Arquitectura objetivo](#5-arquitectura-objetivo)
6. [Configuración: `.env` mínimo vs estrategia en UI](#6-configuración-env-mínimo-vs-estrategia-en-ui)
7. [Modelo de dominio](#7-modelo-de-dominio)
8. [Modelo de base de datos](#8-modelo-de-base-de-datos)
9. [Integración con Binance Demo, Testnet y Producción](#9-integración-con-binance-demo-testnet-y-producción)
10. [Motor de estrategias](#10-motor-de-estrategias)
11. [Motor de riesgo](#11-motor-de-riesgo)
12. [Motor de ejecución](#12-motor-de-ejecución)
13. [WebSockets y sincronización](#13-websockets-y-sincronización)
14. [Frontend, navegación y estructura de páginas](#14-frontend-navegación-y-estructura-de-páginas)
15. [API interna](#15-api-interna)
16. [Observabilidad, auditoría, autenticación y seguridad](#16-observabilidad-auditoría-autenticación-y-seguridad)
17. [Testing, backtesting y validación](#17-testing-backtesting-y-validación)
18. [Roadmap por fases](#18-roadmap-por-fases)
19. [Estructura de repositorio propuesta](#19-estructura-de-repositorio-propuesta)
20. [Criterios para activar producción](#20-criterios-para-activar-producción)
21. [Anexos técnicos](#21-anexos-técnicos)
22. [Fuentes](#22-fuentes)

---

# 1. Objetivo y alcance

CryptoRSI v2 debe ser una plataforma nueva, diseñada desde cero, pero inspirada en la aplicación actual. El objetivo no es parchear el bot existente, sino construir una base preparada para operar primero en **Binance Demo**, después en un entorno controlado de testnet si interesa, y finalmente en producción solo cuando existan garantías técnicas, de seguridad y de control operativo.

## 1.1 Objetivos de producto

- Configurar estrategias desde la interfaz, sin editar variables de entorno para cada ajuste operativo.
- Ejecutar señales en tres modos: `simulation`, `binance_demo` y, en el futuro, `binance_live`.
- Mantener trazabilidad completa: estrategia, versión, señal, decisión, orden, fill, comisión, balance y PnL.
- Separar datos de mercado ejecutables de datos informativos.
- Permitir backtesting, comparación de versiones de estrategia y promoción controlada de una estrategia a demo/live.
- Construir guardarraíles para evitar operar en producción por accidente.
- Preparar una arquitectura que pueda crecer sin rehacer el núcleo.

## 1.2 No objetivos de la primera versión

- No ejecutar trading real en producción en la fase inicial.
- No soportar futuros, margin, apalancamiento ni derivados.
- No abrir la plataforma a múltiples usuarios externos en fase inicial.
- No crear una capa multi-exchange desde el primer día.
- No optimizar para alta frecuencia; el enfoque inicial es swing/intraday basado en RSI, timeframes y reglas de riesgo.

---

# 2. Diagnóstico de la versión actual

La versión actual ya resuelve piezas importantes: calcula RSI multi-timeframe, consulta velas, guarda posiciones simuladas, histórico, snapshots y backtests. También usa SQLite con WAL y tiene una SPA React/Vite.

Eso confirma que el modelo funcional es válido, pero la arquitectura no debe crecer acoplando ejecución real sobre la misma base sin rediseñar responsabilidades.

## 2.1 Componentes reutilizables conceptualmente

| Área | Qué se puede reutilizar conceptualmente | Qué no conviene copiar tal cual |
|---|---|---|
| RSI | Fórmulas, interpretación y lógica de señales base | Acoplamiento con rutas o servicios existentes |
| Snapshots | Idea de guardar estado de mercado y señales | Estructura sin versionado de estrategia |
| Simulación | Modelo funcional de posiciones simuladas | Modelo insuficiente para estados reales de exchange |
| Backtests | Concepto y métricas iniciales | Motor debe rediseñarse para configs versionadas |
| Dashboard | Información útil para usuario | UI debe orientarse a estrategia, auditoría y ejecución real/demo |

## 2.2 Riesgos de extender la versión actual sin rediseño

- Mezclar dashboard, cálculo de señales y ejecución real aumenta el riesgo operativo.
- El fallback externo de datos puede producir señales no alineadas con el mercado donde se ejecuta la orden.
- Las estrategias no tienen versionado fuerte.
- El modelo de posiciones simuladas no cubre correctamente estados reales de exchange: `NEW`, `PARTIALLY_FILLED`, `FILLED`, `CANCELED`, `REJECTED`, `EXPIRED`.
- Sin reconciliación con eventos de Binance, la base local puede desincronizarse del exchange.

---

# 3. Principios de diseño de CryptoRSI v2

## 3.1 Estrategia en UI, secretos en `.env`

Todo parámetro que afecte a estrategia o gestión de capital debe ser editable desde la interfaz y persistido en base de datos con versionado.

El `.env` queda reservado para:

- secretos,
- entorno global,
- conexión a base de datos,
- límites duros que la UI no debe poder saltarse,
- flags explícitos para bloquear producción.

## 3.2 Datos ejecutables solo desde Binance

Para operar en Binance Demo o producción, las señales ejecutables deben calcularse usando datos de Binance. Los datos de CoinCap, CryptoCompare u otras fuentes pueden mantenerse para visualización, comparación o fallback informativo, pero no para tomar decisiones de ejecución.

## 3.3 Trazabilidad total

Cada operación debe poder responder a estas preguntas:

- ¿Qué estrategia la abrió?
- ¿Qué versión exacta de configuración estaba activa?
- ¿Qué señal se generó?
- ¿Qué filtros de riesgo pasaron o bloquearon?
- ¿Qué orden se envió?
- ¿Cuál fue la respuesta de Binance?
- ¿Qué fills se recibieron?
- ¿Qué comisión hubo?
- ¿Cómo cambió el balance?
- ¿Cuál fue el PnL simulado/demo?

## 3.4 Producción bloqueada por defecto

La producción no debe ser solo “otro valor de entorno”. Debe requerir varios guardarraíles:

- `ALLOW_LIVE_TRADING=true` en `.env`,
- usuario admin,
- estrategia aprobada para live,
- límite de capital activo,
- confirmación manual,
- auditoría previa,
- test de conectividad y permisos,
- reconciliación activa con Binance.

---

## 3.5 Seguridad de cuenta desde el día uno

CryptoRSI v2 debe nacer con autenticación robusta, 2FA TOTP y cifrado de datos sensibles. No se debe tratar la seguridad como una fase posterior, porque el producto manejará cuentas de usuario, posibles claves de Binance y, en el futuro, capacidad de operar en producción.

Regla de diseño:

```text
Sin 2FA activo no hay administración operativa.
Sin cifrado de secretos no hay integración real con exchanges.
Sin step-up 2FA no hay acciones críticas.
```

---

# 4. Decisiones de stack tecnológico

## 4.1 Resumen recomendado

| Capa | Decisión recomendada | Motivo |
|---|---|---|
| Lenguaje | TypeScript | Reduce errores de dominio en órdenes, estados, estrategias y contratos |
| Backend | Fastify | Buen encaje con validación por schema, serialización y tipado |
| Frontend | React + Vite | Continuidad con la web actual, SPA ágil para dashboard/admin |
| DB | PostgreSQL | Mejor para auditoría, concurrencia, eventos, órdenes y crecimiento |
| ORM | Prisma | Migraciones, tipos y productividad en TypeScript |
| Jobs/worker | Worker Node separado | Evita acoplar motor de trading al servidor HTTP |
| Cache/colas | Redis opcional en fase 2/3 | Útil para locks, eventos y jobs, pero no imprescindible en fase inicial |
| Charts | TradingView Lightweight Charts por defecto; TradingView Advanced Charts opcional | Todos los gráficos financieros deben usar tecnología TradingView. Se descarta Recharts para charts de mercado, señales, backtesting y PnL. |
| Validación | JSON Schema/Zod | Contratos compartidos y validación fuerte |
| Logs | Pino | Continuidad y buen rendimiento en Node |

## 4.2 Por qué no limitarse al stack actual

Node + Express + React + SQLite es suficiente para un MVP o bot personal, pero CryptoRSI v2 nace con ejecución contra exchange. Eso cambia los requisitos:

- se necesitan contratos estrictos,
- estados de órdenes reales,
- auditoría,
- migraciones robustas,
- concurrencia,
- reconciliación,
- versionado de estrategia,
- preparación para producción.

Por eso se recomienda **TypeScript + Fastify + PostgreSQL + Prisma** para una nueva versión.

## 4.3 Node.js

Usar una versión LTS o Maintenance LTS. Node recomienda que aplicaciones de producción usen versiones Active LTS o Maintenance LTS.

## 4.4 Fastify frente a Express

Express sigue siendo válido, pero para un proyecto nuevo con contratos fuertes, Fastify ofrece ventajas:

- validación por schema,
- serialización de respuesta,
- hooks estructurados,
- mejor encaje con TypeScript,
- separación clara de plugins.

Fastify recomienda un enfoque basado en JSON Schema para validar rutas y serializar respuestas.

## 4.5 PostgreSQL frente a SQLite

SQLite puede mantenerse para prototipos locales o tests, pero v2 debería nacer con PostgreSQL si el objetivo es producción futura.

PostgreSQL ofrece:

- mejor concurrencia,
- MVCC,
- integridad transaccional robusta,
- índices avanzados,
- consultas analíticas,
- mejor soporte para auditoría y eventos.

## 4.6 Prisma

Prisma encaja bien con un backend TypeScript porque ofrece cliente tipado, migraciones y soporte para PostgreSQL, MySQL, SQLite y otros motores.

---

# 5. Arquitectura objetivo

## 5.1 Vista general

```text
┌────────────────────────────┐
│         React UI            │
│ Dashboard / Estrategias     │
└──────────────┬─────────────┘
               │ HTTP/WebSocket interno
┌──────────────▼─────────────┐
│        Fastify API          │
│ Auth / Config / Estado      │
└──────────────┬─────────────┘
               │
┌──────────────▼─────────────┐
│       PostgreSQL            │
│ Estrategias / Órdenes       │
│ Fills / Auditoría / PnL     │
└──────────────┬─────────────┘
               │
┌──────────────▼─────────────┐
│     Trading Worker          │
│ Strategy Engine             │
│ Risk Engine                 │
│ Execution Engine            │
└──────────────┬─────────────┘
               │ REST/WebSocket
┌──────────────▼─────────────┐
│     Binance Demo/Testnet    │
│ Market Data / Orders        │
│ User Data Stream            │
└────────────────────────────┘
```

## 5.2 Separación de procesos

### API web

Responsabilidades:

- autenticación,
- gestión de usuarios,
- CRUD de estrategias,
- lectura de dashboard,
- endpoints de estado,
- configuración de Binance,
- backtests bajo demanda.

### Trading worker

Responsabilidades:

- leer estrategias activas,
- consumir datos de mercado,
- evaluar señales,
- aplicar riesgo,
- validar órdenes,
- ejecutar en simulación o Binance,
- guardar decisiones y eventos,
- reconciliar estados.

### WebSocket interno

Responsabilidades:

- enviar estado del bot a la UI,
- emitir últimas señales,
- emitir últimas órdenes,
- actualizar balances,
- refrescar PnL.

---

# 6. Configuración: `.env` mínimo vs estrategia en UI

## 6.1 `.env` recomendado

```env
NODE_ENV=production
PORT=3000
APP_URL=http://localhost:3000

DATABASE_URL=postgresql://cryptorsi:cryptorsi@localhost:5432/cryptorsi
JWT_SECRET=change_me

BINANCE_ENV=demo
BINANCE_API_KEY=change_me
BINANCE_API_SECRET=change_me

ALLOW_LIVE_TRADING=false
LOG_LEVEL=info
```

## 6.2 Lo que NO debe ir en `.env`

No deberían estar en `.env`:

- RSI de compra,
- RSI de venta,
- símbolos activos,
- timeframes,
- importe por operación,
- take profit,
- stop loss,
- cooldown,
- máximo de posiciones,
- modo `dry_run`,
- estrategia activa,
- filtros SMA,
- trailing stop.

Todo eso debe estar en UI + base de datos.

## 6.3 Configuración editable desde UI

### Datos generales

```text
Nombre de estrategia
Descripción
Estado: activa / pausada / archivada
Modo: simulation / binance_demo / binance_live
Entorno: demo / testnet / production
```

### Mercado

```text
Símbolos: BTCUSDT, ETHUSDT, SOLUSDT...
Timeframes: 15m, 1h, 4h, 1d
Fuente ejecutable: Binance
```

### Entrada

```text
RSI compra <= 30
Confirmación multi-timeframe: sí/no
SMA200 requerida: sí/no
Volumen mínimo: opcional
Cooldown tras compra: 360 minutos
```

### Salida

```text
RSI venta >= 70
Take profit: 8%
Stop loss: 3%
Trailing stop: opcional
Venta parcial: opcional
```

### Riesgo y capital

```text
Importe por operación: 25 USDT
Máximo invertido por símbolo: 100 USDT
Máximo invertido total: 500 USDT
Máximo de posiciones abiertas: 5
Máximo de operaciones diarias: 10
Pérdida máxima diaria: 5%
```

### Ejecución

```text
Tipo de orden: MARKET
Compra por quoteOrderQty: sí
Validar con /api/v3/order/test: sí/no
Permitir ejecución real demo: sí/no
```

---

# 7. Modelo de dominio

## 7.1 Entidades principales

| Entidad | Descripción |
|---|---|
| `Strategy` | Estrategia editable desde UI |
| `StrategyVersion` | Snapshot inmutable de configuración |
| `MarketSnapshot` | Estado de mercado usado para evaluar señal |
| `Signal` | Señal calculada por el motor |
| `Decision` | Resultado tras aplicar filtros y riesgo |
| `Position` | Posición abierta/cerrada en simulación o exchange |
| `ExchangeOrder` | Orden enviada o validada contra Binance |
| `ExchangeFill` | Ejecución parcial o total de una orden |
| `BalanceSnapshot` | Estado de balances en un momento concreto |
| `AuditEvent` | Evento de auditoría del sistema |

## 7.2 Flujo de dominio

```text
MarketSnapshot
  → StrategyVersion
    → Signal
      → RiskCheck
        → Decision
          → ExecutionRequest
            → ExchangeOrder
              → Fill(s)
                → Position update
                  → Balance/PnL update
```

---

# 8. Modelo de base de datos

## 8.1 Estrategias

```sql
CREATE TABLE strategies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  mode TEXT NOT NULL DEFAULT 'simulation',
  environment TEXT NOT NULL DEFAULT 'demo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

```sql
CREATE TABLE strategy_versions (
  id UUID PRIMARY KEY,
  strategy_id UUID NOT NULL REFERENCES strategies(id),
  version INTEGER NOT NULL,
  config JSONB NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(strategy_id, version)
);
```

## 8.2 Señales y decisiones

```sql
CREATE TABLE signals (
  id UUID PRIMARY KEY,
  strategy_id UUID NOT NULL REFERENCES strategies(id),
  strategy_version_id UUID NOT NULL REFERENCES strategy_versions(id),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  rsi_value NUMERIC(12, 6),
  price NUMERIC(24, 12),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

```sql
CREATE TABLE decisions (
  id UUID PRIMARY KEY,
  signal_id UUID NOT NULL REFERENCES signals(id),
  decision TEXT NOT NULL,
  reason TEXT,
  risk_result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 8.3 Órdenes y fills

```sql
CREATE TABLE exchange_orders (
  id UUID PRIMARY KEY,
  strategy_id UUID NOT NULL REFERENCES strategies(id),
  strategy_version_id UUID NOT NULL REFERENCES strategy_versions(id),
  decision_id UUID REFERENCES decisions(id),
  exchange TEXT NOT NULL DEFAULT 'binance',
  environment TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  client_order_id TEXT UNIQUE,
  exchange_order_id TEXT,
  quote_amount NUMERIC(24, 12),
  requested_quantity NUMERIC(24, 12),
  executed_quantity NUMERIC(24, 12),
  cumulative_quote_quantity NUMERIC(24, 12),
  avg_price NUMERIC(24, 12),
  raw_request JSONB,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

```sql
CREATE TABLE exchange_fills (
  id UUID PRIMARY KEY,
  exchange_order_id UUID NOT NULL REFERENCES exchange_orders(id),
  trade_id TEXT,
  price NUMERIC(24, 12) NOT NULL,
  quantity NUMERIC(24, 12) NOT NULL,
  quote_quantity NUMERIC(24, 12),
  commission NUMERIC(24, 12),
  commission_asset TEXT,
  executed_at TIMESTAMPTZ,
  raw_event JSONB
);
```

## 8.4 Posiciones

```sql
CREATE TABLE positions (
  id UUID PRIMARY KEY,
  strategy_id UUID NOT NULL REFERENCES strategies(id),
  strategy_version_id UUID NOT NULL REFERENCES strategy_versions(id),
  symbol TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  entry_order_id UUID REFERENCES exchange_orders(id),
  exit_order_id UUID REFERENCES exchange_orders(id),
  quantity NUMERIC(24, 12),
  entry_price NUMERIC(24, 12),
  exit_price NUMERIC(24, 12),
  invested_quote NUMERIC(24, 12),
  realized_pnl NUMERIC(24, 12),
  realized_pnl_pct NUMERIC(12, 6),
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## 8.5 Auditoría

```sql
CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

# 9. Integración con Binance Demo, Testnet y Producción

## 9.1 Entornos

| Entorno | Uso | REST | WebSocket Streams | WebSocket API |
|---|---|---|---|---|
| Demo | Principal para validar la nueva plataforma | `https://demo-api.binance.com/api` | `wss://demo-stream.binance.com/ws` | `wss://demo-ws-api.binance.com/ws-api/v3` |
| Testnet | Alternativa API-only de pruebas | `https://testnet.binance.vision/api` | `wss://stream.testnet.binance.vision/ws` | `wss://ws-api.testnet.binance.vision/ws-api/v3` |
| Production | Futuro, bloqueado | `https://api.binance.com/api` | `wss://stream.binance.com/ws` | `wss://ws-api.binance.com/ws-api/v3` |

## 9.2 Cliente Binance

Debe existir un módulo aislado:

```text
apps/api/src/infrastructure/binance/
  binanceClient.ts
  binanceSigner.ts
  binanceMarketData.ts
  binanceOrders.ts
  binanceAccount.ts
  binanceStreams.ts
  binanceMapper.ts
```

Responsabilidades:

- resolver endpoint por entorno,
- firmar peticiones,
- añadir `timestamp`, `recvWindow` y `signature`,
- gestionar errores de Binance,
- normalizar estados,
- mapear respuestas a tipos internos.

## 9.3 Endpoints REST mínimos

| Acción | Endpoint |
|---|---|
| Ping | `GET /api/v3/ping` |
| Hora servidor | `GET /api/v3/time` |
| Velas | `GET /api/v3/klines` |
| Precio actual | `GET /api/v3/ticker/price` |
| Exchange info/filtros | `GET /api/v3/exchangeInfo` |
| Cuenta/balances | `GET /api/v3/account` |
| Validar orden | `POST /api/v3/order/test` |
| Crear orden | `POST /api/v3/order` |
| Consultar orden | `GET /api/v3/order` |

## 9.4 Orden de compra recomendada

Para compras de mercado con USDT:

```text
symbol=BTCUSDT
side=BUY
type=MARKET
quoteOrderQty=25
newOrderRespType=FULL
newClientOrderId=cryptorsi_<strategy>_<timestamp>
```

`quoteOrderQty` simplifica la gestión de capital porque permite decir “compra 25 USDT de BTC” en lugar de calcular cantidad base antes de enviar la orden.

## 9.5 Orden de venta recomendada

Para venta de una posición existente:

```text
symbol=BTCUSDT
side=SELL
type=MARKET
quantity=<cantidad ajustada a LOT_SIZE>
newOrderRespType=FULL
newClientOrderId=cryptorsi_sell_<position>_<timestamp>
```

Antes de vender hay que ajustar `quantity` a los filtros de Binance, especialmente `LOT_SIZE` y `stepSize`.

---

# 10. Motor de estrategias

## 10.1 Responsabilidad

El Strategy Engine recibe:

- datos de mercado,
- configuración de estrategia,
- posiciones actuales,
- historial reciente,
- balances,
- estado de cooldown.

Y devuelve:

- señal de compra,
- señal de venta,
- señal neutra,
- razones detalladas.

## 10.2 Configuración versionada

Ejemplo de configuración JSON:

```json
{
  "symbols": ["BTCUSDT", "ETHUSDT"],
  "timeframes": ["15m", "1h", "4h"],
  "entry": {
    "rsiBelow": 30,
    "requireMultiTimeframeConfirmation": true,
    "useSmaFilter": true,
    "smaPeriod": 200
  },
  "exit": {
    "rsiAbove": 70,
    "takeProfitPct": 8,
    "stopLossPct": 3,
    "trailingStopPct": null
  },
  "risk": {
    "quoteAmountPerTrade": 25,
    "maxOpenPositions": 5,
    "maxPositionsPerSymbol": 2,
    "maxTotalExposureQuote": 500,
    "maxDailyLossPct": 5,
    "cooldownMinutes": 360
  },
  "execution": {
    "orderType": "MARKET",
    "useOrderTestBeforeRealOrder": true,
    "dryRun": true
  }
}
```

## 10.3 Estados de señal

| Estado | Significado |
|---|---|
| `BUY_SIGNAL` | Hay señal de entrada |
| `SELL_SIGNAL` | Hay señal de salida |
| `HOLD` | No se opera |
| `BLOCKED_BY_RISK` | Señal válida, pero riesgo bloquea |
| `BLOCKED_BY_DATA` | Datos insuficientes o no ejecutables |
| `BLOCKED_BY_ENVIRONMENT` | Entorno o permisos no permiten ejecutar |

---

# 11. Motor de riesgo

El Risk Engine es obligatorio antes de cualquier ejecución.

## 11.1 Reglas mínimas

- No operar si la estrategia está pausada.
- No operar si el entorno no coincide con el modo de la estrategia.
- No operar si el dato de mercado no viene de Binance.
- No operar si `exchangeInfo` no confirma que el símbolo está en `TRADING`.
- No operar si se excede el máximo por operación.
- No operar si se excede exposición total.
- No operar si se excede exposición por símbolo.
- No operar si hay cooldown activo.
- No operar si se ha alcanzado pérdida diaria máxima.
- No operar en producción si `ALLOW_LIVE_TRADING !== true`.

## 11.2 Resultado de riesgo

```ts
export type RiskResult =
  | { allowed: true; checks: RiskCheck[] }
  | { allowed: false; reason: string; checks: RiskCheck[] };
```

---

# 12. Motor de ejecución

## 12.1 Modos de ejecución

| Modo | Qué hace |
|---|---|
| `simulation` | No llama a Binance. Crea posiciones simuladas. |
| `binance_demo_dry_run` | Llama a `/api/v3/order/test`, pero no crea orden real demo. |
| `binance_demo_live` | Crea órdenes reales dentro de Binance Demo. |
| `binance_live_dry_run` | Valida contra producción sin crear orden, solo para fase muy controlada. |
| `binance_live` | Futuro. Bloqueado hasta cumplir criterios. |

## 12.2 Flujo de compra

```text
1. Strategy Engine genera BUY_SIGNAL.
2. Risk Engine valida límites.
3. Execution Engine genera clientOrderId.
4. Se consulta exchangeInfo.
5. Se valida saldo.
6. Si orderTest está activo: POST /api/v3/order/test.
7. Si corresponde ejecución: POST /api/v3/order.
8. Se guarda ExchangeOrder.
9. Se esperan fills vía respuesta FULL o User Data Stream.
10. Se abre/actualiza Position.
11. Se registra AuditEvent.
```

## 12.3 Flujo de venta

```text
1. Strategy Engine genera SELL_SIGNAL.
2. Se localiza posición abierta.
3. Risk Engine valida salida.
4. Se calcula quantity vendible.
5. Se ajusta quantity a LOT_SIZE/stepSize.
6. Se valida con /api/v3/order/test si está activo.
7. Se envía orden SELL MARKET si procede.
8. Se actualizan fills, posición, PnL y auditoría.
```

---

# 13. WebSockets y sincronización

## 13.1 Market streams

Usar streams de klines para actualizar datos sin polling agresivo:

```text
wss://demo-stream.binance.com/ws/btcusdt@kline_1h
```

Para múltiples streams:

```text
wss://demo-stream.binance.com/stream?streams=btcusdt@kline_1h/ethusdt@kline_1h
```

## 13.2 User Data Stream

El User Data Stream debe usarse para reconciliar:

- cambios de balance,
- órdenes creadas,
- órdenes parcialmente ejecutadas,
- órdenes llenadas,
- comisiones,
- rechazos,
- cancelaciones.

Eventos importantes:

| Evento | Uso |
|---|---|
| `outboundAccountPosition` | Actualización de balances |
| `executionReport` | Estado de órdenes y ejecuciones |

## 13.3 Reconciliación periódica

Además de WebSocket, debe existir reconciliación REST periódica:

```text
Cada X minutos:
  - consultar órdenes abiertas
  - consultar balances
  - comparar con DB local
  - crear eventos de auditoría si hay divergencia
  - corregir estado si procede
```

---

# 14. Frontend, navegación y estructura de páginas

La web de CryptoRSI v2 debe diseñarse como una **consola operativa de trading**, no como una simple pantalla de resultados. La navegación tiene que dejar claro en todo momento si el usuario está en una zona de **monitorización**, **diseño de estrategia**, **ejecución del bot**, **backtesting**, **configuración sensible** o **auditoría**.

La referencia conceptual tomada de NOFX es útil porque separa el flujo de configuración avanzada en pasos claros: configurar proveedor/AI, conectar exchange, construir estrategia, crear trader y lanzar trading. Además, su documentación de frontend enumera piezas que también encajan en CryptoRSI v2: estado del sistema, cuenta, posiciones, decisiones, estadísticas, auto-refresh, gráficos y páginas futuras de parámetros/configuración. En CryptoRSI v2 no se debe copiar la complejidad de multi-AI/multi-exchange de NOFX, pero sí adoptar su enfoque de producto: **primero configurar, después validar, después operar, después auditar**.

Fuente de inspiración:

- NOFX documenta un flujo avanzado: `AI → Exchange → Strategy → Trader → Trade`.
- NOFX incluye dashboard, market chart, trading stats, position history, trader details, Strategy Studio, indicators config y config page.
- NOFX separa módulos de Strategy Studio, Live Trading, Core Services, Exchanges, Database y Frontend UI.

Para CryptoRSI v2, el equivalente debe ser:

```text
Exchange → Estrategia → Backtest → Bot → Ejecución Demo → Auditoría → Producción futura
```

---

## 14.1 Principios de navegación

La navegación debe cumplir estos principios:

| Principio | Decisión de producto |
|---|---|
| Separar observar de actuar | Dashboard y Monitor no deben ser lo mismo que configuración ni ejecución manual. |
| Evitar acciones peligrosas accidentales | Arrancar bot, activar demo/live, cambiar API keys o desbloquear producción requieren 2FA step-up. |
| Explicar el estado actual | La UI debe mostrar siempre `simulation`, `binance_demo`, `binance_testnet` o `binance_live_locked/live`. |
| Versionar estrategia | Cualquier cambio operativo genera nueva versión de estrategia. |
| Mostrar trazabilidad | Toda orden debe enlazar a señal, estrategia, versión, decisión, ejecución y evento Binance. |
| Priorizar claridad sobre densidad | Las pantallas principales deben enseñar KPIs y derivar detalles a páginas específicas. |
| Diseñar para producción desde demo | Aunque v1 opere solo demo, la UX debe impedir errores cuando exista live. |

---

## 14.2 Estructura general de la aplicación

### App Shell

La aplicación debe tener un layout persistente:

```text
┌─────────────────────────────────────────────────────────────┐
│ Topbar: entorno, estado bot, estrategia activa, usuario, 2FA │
├───────────────┬─────────────────────────────────────────────┤
│ Sidebar       │ Contenido                                   │
│ navegación    │                                             │
└───────────────┴─────────────────────────────────────────────┘
```

### Topbar global

Debe estar visible en todas las páginas autenticadas.

Elementos:

```text
- Entorno actual: SIMULATION / DEMO / TESTNET / LIVE LOCKED / LIVE
- Estado del bot: parado / arrancando / activo / pausado / error
- Estrategia activa: nombre + versión
- Última evaluación: fecha/hora
- Última sincronización Binance: OK / warning / error
- Usuario actual
- Estado 2FA
- Botón de pausa de emergencia, visible si el bot está activo
```

La topbar debe usar señales visuales fuertes:

| Estado | UX recomendada |
|---|---|
| Simulation | Neutro |
| Binance Demo | Azul o verde suave |
| Testnet | Amarillo suave |
| Live Locked | Gris con candado |
| Live | Rojo/naranja persistente + banner de riesgo |

### Sidebar recomendada

```text
Monitorización
  - Dashboard
  - Bot en vivo
  - Posiciones
  - Órdenes
  - Señales y decisiones

Estrategias
  - Estrategias
  - Editor de estrategia
  - Backtesting
  - Versiones y comparador

Mercado
  - Watchlist
  - Datos de mercado
  - Indicadores

Configuración
  - Exchange / Binance
  - Seguridad y 2FA
  - Riesgo global
  - Notificaciones
  - Sistema

Auditoría
  - Eventos
  - Reconciliación
  - Logs técnicos
  - Exportaciones
```

---

# 14.3 Mapa de rutas recomendado

## 14.3.1 Rutas públicas y autenticación

| Ruta | Página | Objetivo |
|---|---|---|
| `/login` | Login | Acceso con email/password. |
| `/login/mfa` | Verificación 2FA | Introducción de código TOTP. |
| `/forgot-password` | Recuperación de contraseña | Flujo de recuperación seguro. |
| `/reset-password` | Reset password | Cambio de contraseña con token temporal. |
| `/setup` | Onboarding inicial | Crear admin, activar 2FA, conectar Binance Demo y crear estrategia base. |

El onboarding inicial debe forzar:

```text
1. Crear usuario administrador.
2. Activar 2FA.
3. Guardar recovery codes.
4. Conectar Binance Demo.
5. Ejecutar test de conexión.
6. Crear o importar estrategia inicial.
7. Ejecutar primer backtest.
8. Activar modo simulation o demo, nunca live.
```

---

## 14.3.2 Rutas privadas principales

| Ruta | Página | Prioridad | Descripción |
|---|---|---:|---|
| `/dashboard` | Dashboard general | Alta | Vista ejecutiva del estado de la plataforma. |
| `/bot` | Bot en vivo | Alta | Seguimiento operativo del runner, señales, órdenes y estado actual. |
| `/strategies` | Estrategias | Alta | Listado, creación, duplicado, activación y pausa de estrategias. |
| `/strategies/:id/editor` | Editor de estrategia | Alta | Configuración completa de reglas, riesgo, símbolos y ejecución. |
| `/orders` | Órdenes | Alta | Order blotter con estados Binance/locales. |
| `/positions` | Posiciones | Alta | Posiciones abiertas, simuladas y demo/live. |
| `/backtests` | Backtesting | Media/Alta | Ejecutar y comparar pruebas históricas. |
| `/signals` | Señales y decisiones | Media/Alta | Historial de señales, decisiones, condiciones y motivos. |
| `/market` | Datos de mercado | Media | Watchlist, precios, velas e indicadores. |
| `/settings` | Configuración | Alta | Exchange, seguridad, riesgo global, notificaciones y sistema. |
| `/audit` | Auditoría | Alta | Eventos críticos, reconciliación y logs operativos. |

---

# 14.4 Páginas detalladas

## 14.4.1 Dashboard general — `/dashboard`

### Objetivo

Mostrar el estado global de CryptoRSI v2 en menos de 30 segundos. Debe responder:

```text
¿Está funcionando el bot?
¿Con qué estrategia?
¿En qué entorno?
¿Cuánto capital hay?
¿Cuál es el PnL?
¿Hay riesgo o errores?
¿Qué ha pasado recientemente?
```

### Componentes recomendados

| Bloque | Contenido |
|---|---|
| Estado global | Bot activo/parado, entorno, estrategia activa, versión, último ciclo. |
| Balance | Balance demo/testnet/live, disponible, reservado en órdenes, total estimado. |
| PnL | PnL diario, semanal, mensual, acumulado, realizado/no realizado. |
| Riesgo | Exposición total, exposición por símbolo, posiciones abiertas, pérdida diaria. |
| Actividad reciente | Últimas señales, órdenes, fills, errores y eventos de auditoría. |
| Gráficos | Curva de equity, PnL, número de operaciones, win rate. |
| Salud del sistema | Binance REST, Binance WS, DB, runner, scheduler, latencia. |

### Acciones permitidas

```text
- Ver detalles del bot.
- Ir a estrategia activa.
- Ir a órdenes.
- Pausar bot.
- Lanzar evaluación manual en modo no-live.
```

### Acciones bloqueadas o con 2FA

```text
- Activar ejecución demo.
- Desbloquear live.
- Cambiar modo de ejecución.
- Cambiar credenciales Binance.
```

---

## 14.4.2 Bot en vivo — `/bot`

### Objetivo

Esta debe ser la página operativa principal mientras el bot está funcionando. No es para diseñar estrategia; es para observar y controlar el runtime.

### Componentes recomendados

| Bloque | Contenido |
|---|---|
| Estado del runner | Ciclo actual, próximo ciclo, tiempo desde arranque, errores recientes. |
| Estrategia cargada | Nombre, versión, hash de config, modo de ejecución. |
| Pipeline actual | Market data → indicadores → señal → riesgo → orden → reconciliación. |
| Órdenes en marcha | Órdenes abiertas, parcialmente ejecutadas, pendientes de reconciliación. |
| Señales recientes | Compra/venta/hold, símbolo, timeframe, motivo, RSI, filtros. |
| Cola de eventos | Eventos internos: evaluación, decisión, orden enviada, fill, error, retry. |
| Pausa de emergencia | Botón fijo para detener runner y cancelar órdenes abiertas si se configura. |

### Estados que debe soportar

```text
idle
starting
running
paused_by_user
paused_by_risk
paused_by_error
reconnecting_binance
reconciling
stopped
```

### Acciones

| Acción | Requiere 2FA | Notas |
|---|---:|---|
| Start bot en simulation | No | Si el usuario ya está autenticado. |
| Start bot en demo | Sí | Step-up obligatorio. |
| Stop bot | No | Debe ser rápido. |
| Pause bot | No | Acción segura. |
| Resume bot demo | Sí | Porque reanuda ejecución. |
| Cancelar órdenes abiertas | Sí | Acción crítica. |
| Forzar reconciliación | No/Sí | Sí si afecta a cierre/cancelación. |

---

## 14.4.3 Estrategias — `/strategies`

### Objetivo

Gestionar estrategias como entidades versionadas, no como simples settings.

### Tabla principal

Columnas:

```text
- Nombre
- Estado: borrador / activa / pausada / archivada
- Modo permitido: simulation / demo / live_locked
- Versión actual
- Símbolos
- Timeframes
- Último backtest
- Última ejecución demo
- Rentabilidad demo
- Drawdown
- Fecha de actualización
```

### Acciones

```text
- Crear estrategia
- Duplicar estrategia
- Editar borrador
- Ver detalle
- Comparar versiones
- Ejecutar backtest
- Promocionar a demo
- Archivar
```

### Reglas

```text
- No se edita directamente una estrategia activa: se crea una nueva versión borrador.
- Activar una versión requiere validación.
- Activar demo requiere 2FA.
- Activar live requiere condiciones de producción y 2FA reforzado.
```

---

## 14.4.4 Editor de estrategia — `/strategies/:id/editor`

### Objetivo

Ser el equivalente a un **Strategy Studio** adaptado a CryptoRSI: visual, validado y versionado.

### Estructura de pestañas

```text
1. General
2. Universo de símbolos
3. Indicadores
4. Reglas de entrada
5. Reglas de salida
6. Riesgo y capital
7. Ejecución
8. Horarios y frecuencia
9. Validación
10. Resumen
```

### 1. General

Campos:

```text
- Nombre de estrategia
- Descripción
- Perfil: conservadora / equilibrada / agresiva / personalizada
- Modo permitido: simulation / demo / live_locked
- Tags
```

### 2. Universo de símbolos

Opciones:

```text
- Lista fija: BTCUSDT, ETHUSDT, SOLUSDT...
- Watchlist configurable
- Filtro por quote asset: USDT
- Excluir símbolos
- Máximo número de símbolos activos
```

Inspiración de NOFX: su módulo de estrategia contempla selección de monedas por lista estática, pools, OI ranking y modo mixto. CryptoRSI v2 debería empezar con lista fija + watchlist, dejando filtros dinámicos como fase posterior.

### 3. Indicadores

Campos:

```text
- RSI period: 14 por defecto
- RSI timeframes: 15m, 1h, 4h, 1d
- SMA period: 200
- EMA opcional
- ATR opcional para stops dinámicos
- Volumen mínimo opcional
```

### 4. Reglas de entrada

Campos:

```text
- RSI compra <= X
- Confirmación multi-timeframe: sí/no
- Requiere tendencia alcista: precio > SMA200
- Requiere volumen mínimo
- Evitar compra si ya hay posición abierta
- Cooldown por símbolo
- Cooldown global
```

### 5. Reglas de salida

Campos:

```text
- RSI venta >= X
- Take profit %
- Stop loss %
- Trailing stop %
- Salida parcial
- Salida por pérdida máxima diaria
- Salida por divergencia de señal
```

### 6. Riesgo y capital

Campos:

```text
- Importe por operación en USDT
- Máximo por símbolo
- Máximo total expuesto
- Máximo de posiciones abiertas
- Máximo de operaciones diarias
- Pérdida máxima diaria
- Bloqueo tras N errores consecutivos
```

### 7. Ejecución

Campos:

```text
- Exchange: Binance
- Entorno permitido: demo / testnet / live_locked
- Tipo de orden: MARKET inicialmente
- Compra por quoteOrderQty
- Validar con order/test antes de operar
- Permitir cancelación automática de órdenes antiguas
```

### 8. Horarios y frecuencia

Campos:

```text
- Evaluar cada X minutos
- Timezone
- Pausar fines de semana: opcional
- Ventanas horarias de operación
- Evitar operar durante mantenimiento manual
```

### 9. Validación

Antes de guardar/promocionar:

```text
- Validar schema de estrategia
- Validar símbolos contra exchangeInfo
- Validar mínimos de Binance
- Validar capital disponible
- Validar que take profit > stop loss razonable
- Validar que no se supera riesgo global
```

### 10. Resumen

Debe mostrar un resumen legible:

```text
Esta estrategia comprará BTCUSDT/ETHUSDT cuando RSI(14) en 1h sea <= 30,
confirmado por 4h, siempre que precio > SMA200. Comprará 25 USDT por operación,
con máximo 100 USDT por símbolo, TP 8%, SL 3% y cooldown de 6 horas.
```

---

## 14.4.5 Detalle de estrategia — `/strategies/:id`

### Objetivo

Mostrar el rendimiento y trazabilidad de una estrategia concreta.

Componentes:

```text
- Resumen de configuración actual
- Versión activa
- Historial de versiones
- Backtests asociados
- Ejecuciones demo asociadas
- Operaciones abiertas/cerradas
- Métricas de rendimiento
- Drawdown
- Win rate
- Profit factor
- PnL por símbolo
- PnL por timeframe
```

Acciones:

```text
- Editar creando nueva versión
- Duplicar
- Ejecutar backtest
- Promocionar versión
- Pausar estrategia
- Archivar
```

---

## 14.4.6 Versiones y comparador — `/strategies/:id/versions`

### Objetivo

Evitar perder trazabilidad cuando cambias parámetros.

Vista recomendada:

| Versión | Estado | Cambios clave | Backtest | Demo PnL | Drawdown | Fecha |
|---|---|---|---:|---:|---:|---|
| v1 | archivada | RSI 30/70, TP 8, SL 3 | +4.2% | +1.1% | -2.5% | ... |
| v2 | activa demo | RSI 28/72, TP 6, SL 2.5 | +5.1% | +2.0% | -1.8% | ... |

Comparador:

```text
- Diff visual de JSON/config
- Cambios de riesgo resaltados
- Cambios de símbolos
- Cambios de ejecución
- Métricas lado a lado
```

---

## 14.4.7 Backtesting — `/backtests`

### Objetivo

Validar una estrategia antes de usarla en demo.

Componentes:

```text
- Selector de estrategia + versión
- Selector de rango temporal
- Selector de símbolos
- Selector de capital inicial
- Parámetros de comisiones/slippage
- Botón ejecutar backtest
- Resultados comparables
```

Resultados:

```text
- PnL total
- PnL porcentual
- Drawdown máximo
- Win rate
- Profit factor
- Número de operaciones
- Mejor/peor operación
- PnL por símbolo
- Equity curve
- Lista de operaciones simuladas
```

Acciones:

```text
- Guardar resultado
- Comparar con backtest anterior
- Duplicar estrategia desde resultado
- Promocionar versión a demo si cumple criterios
```

---

## 14.4.8 Órdenes — `/orders`

### Objetivo

Order blotter profesional para ver exactamente qué ha pasado.

Columnas:

```text
- Fecha
- Exchange
- Entorno
- Símbolo
- Side
- Tipo
- Estado local
- Estado Binance
- Cantidad solicitada
- Cantidad ejecutada
- Quote gastado/recibido
- Precio medio
- Comisión
- Strategy ID
- Version ID
- Signal ID
- Client Order ID
- Exchange Order ID
```

Filtros:

```text
- Entorno
- Estrategia
- Símbolo
- Side
- Estado
- Fecha
- Solo órdenes abiertas
- Solo divergencias
```

Acciones:

```text
- Ver detalle
- Consultar estado en Binance
- Forzar reconciliación
- Cancelar orden abierta
- Exportar CSV
```

Cancelar orden debe requerir 2FA.

---

## 14.4.9 Detalle de orden — `/orders/:id`

### Objetivo

Trazabilidad completa.

Debe mostrar:

```text
- Datos de orden local
- Respuesta raw de Binance
- Fills
- Comisiones
- Eventos executionReport
- Señal que originó la orden
- Estrategia y versión
- Estado de reconciliación
- Errores/retries
```

Timeline:

```text
Signal created
Risk approved
order/test OK
Order submitted
Execution report NEW
Execution report FILLED
Position updated
Balance reconciled
```

---

## 14.4.10 Posiciones — `/positions`

### Objetivo

Ver exposición actual y resultado de posiciones abiertas/cerradas.

Pestañas:

```text
- Abiertas
- Cerradas
- Simulación
- Demo Binance
- Divergencias
```

Columnas:

```text
- Símbolo
- Estrategia
- Versión
- Entrada
- Precio actual
- Cantidad
- Valor posición
- PnL absoluto
- PnL %
- Tiempo abierta
- TP
- SL
- Estado
```

Acciones:

```text
- Ver detalle
- Cerrar manualmente en demo/live, con 2FA
- Marcar como reconciliada
- Ver órdenes relacionadas
```

---

## 14.4.11 Señales y decisiones — `/signals`

### Objetivo

Explicar por qué el bot hizo o no hizo algo.

Columnas:

```text
- Fecha
- Estrategia
- Versión
- Símbolo
- Timeframe
- Señal: buy/sell/hold/blocked
- RSI
- SMA filter
- Risk result
- Acción resultante
- Orden asociada
```

Detalle de señal:

```text
- Snapshot de indicadores
- Reglas evaluadas
- Condiciones cumplidas
- Condiciones fallidas
- Motivo de bloqueo
- Resultado del risk engine
- Orden generada o no generada
```

Esto evita el problema clásico de los bots opacos: ver una orden sin entender su causa.

---

## 14.4.12 Mercado y datos — `/market`

### Objetivo

Separar datos de mercado de ejecución.

Componentes:

```text
- Watchlist
- Precio actual Binance
- Velas por timeframe
- RSI actual por timeframe
- SMA200
- Estado del símbolo en exchangeInfo
- Filtros LOT_SIZE / MIN_NOTIONAL / PRICE_FILTER
- Latencia de datos
```

Regla crítica:

```text
Si el dato no viene de Binance, puede mostrarse como informativo, pero no debe usarse para ejecución.
```

---

## 14.4.13 Configuración — `/settings`

### Estructura recomendada

```text
/settings/profile
/settings/security
/settings/exchange
/settings/risk
/settings/notifications
/settings/system
/settings/users
```

### `/settings/profile`

```text
- Nombre
- Email
- Idioma
- Zona horaria
- Preferencias visuales
```

### `/settings/security`

```text
- Cambiar contraseña
- Activar/desactivar 2FA
- Recovery codes
- Sesiones activas
- Cerrar otras sesiones
- Historial de seguridad
```

Cambiar 2FA debe requerir reautenticación y/o factor existente.

### `/settings/exchange`

```text
- Binance Demo API Key
- Binance Demo API Secret cifrado
- Test de conexión
- Permisos detectados
- Entorno actual
- Última sincronización
- Rotar credenciales
```

No se debe mostrar nunca el secret en claro después de guardarlo.

### `/settings/risk`

Riesgo global que ninguna estrategia puede saltarse:

```text
- Capital máximo total
- Máximo por operación
- Pérdida diaria máxima
- Máximo de órdenes por día
- Lista de símbolos permitidos
- Live trading bloqueado/desbloqueado
```

### `/settings/notifications`

```text
- Email
- Telegram futuro
- Eventos a notificar
- Errores críticos
- Orden ejecutada
- Bot pausado por riesgo
- Cambio de credenciales
```

### `/settings/system`

```text
- Estado de servicios
- Versión de app
- Estado DB
- Estado colas/jobs
- Modo mantenimiento
- Backup/export
```

### `/settings/users`

Inicialmente puede estar oculto si es single-user, pero la arquitectura debe soportarlo:

```text
- Usuarios
- Roles
- Permisos
- Último acceso
- 2FA activo
```

---

## 14.4.14 Auditoría — `/audit`

### Objetivo

Tener una caja negra de todo lo importante.

Eventos mínimos:

```text
- Login correcto/fallido
- Activación/desactivación 2FA
- Cambio de contraseña
- Cambio de credenciales Binance
- Cambio de configuración de estrategia
- Activación/pausa de estrategia
- Start/stop bot
- Cambio de modo execution
- order/test
- orden enviada
- fill recibido
- cancelación
- error Binance
- reconciliación con divergencia
- desbloqueo de live trading
```

Filtros:

```text
- Usuario
- Evento
- Severidad
- Entorno
- Estrategia
- Orden
- Fecha
```

---

## 14.5 Página de detalle: patrón común

Todas las entidades importantes deben seguir un patrón común:

```text
Listado → Detalle → Timeline → Acciones → Auditoría
```

Aplicable a:

```text
- Estrategia
- Versión de estrategia
- Backtest
- Señal
- Orden
- Posición
- Evento de auditoría
```

Esto facilita depuración y soporte.

---

## 14.6 Permisos y roles por página

Aunque la primera versión sea para un único usuario, conviene diseñar roles desde el principio.

| Rol | Puede ver | Puede configurar | Puede ejecutar |
|---|---|---|---|
| `owner` | Todo | Todo | Todo, con 2FA |
| `admin` | Todo | Estrategias/settings no críticas | Demo, con 2FA |
| `operator` | Dashboard, bot, órdenes, posiciones | No | Pausar/reanudar según permisos |
| `viewer` | Solo lectura | No | No |

Acciones críticas que siempre requieren 2FA step-up:

```text
- Añadir o cambiar API keys de Binance
- Activar estrategia en demo
- Reanudar bot en demo
- Cancelar órdenes
- Cerrar posición manual
- Cambiar límites globales de riesgo
- Desbloquear producción
- Activar live trading
- Desactivar 2FA
```

OWASP recomienda aplicar reautenticación o verificación adicional en acciones sensibles, cambios de factor MFA y cuentas de alto valor, por lo que este patrón debe ser parte del producto desde el inicio.

---

## 14.7 Componentes compartidos del frontend

Para evitar duplicar lógica, la UI debe construirse con componentes reutilizables.

```text
components/
  AppShell
  TopbarStatus
  SidebarNav
  EnvironmentBadge
  BotStatusBadge
  StrategyVersionBadge
  RiskBadge
  MetricCard
  TradingViewChart
  TradingViewMiniChart
  TradingViewEquityChart
  TradingViewBacktestChart
  TradingViewRsiPane
  TradingViewSignalMarkers
  OrdersTable
  PositionsTable
  SignalsTable
  StrategyConfigForm
  StrategyDiffViewer
  BacktestResultCard
  AuditTimeline
  ConfirmWithTotpModal
  SecretInput
  ConnectionStatusCard
  EmptyState
  ErrorState
```

Componentes especialmente importantes:

### `EnvironmentBadge`

Debe impedir confusión entre demo y live.

```text
SIMULATION
BINANCE DEMO
BINANCE TESTNET
LIVE LOCKED
LIVE ACTIVE
```

### `ConfirmWithTotpModal`

Modal estándar para acciones críticas:

```text
- Explica acción
- Resume riesgo
- Pide código TOTP
- Pide escribir una frase si es live, por ejemplo: ACTIVAR LIVE
- Registra evento de auditoría
```

### `StrategyDiffViewer`

Muestra diferencias entre versiones:

```text
- RSI cambió de 30 a 28
- Stop loss cambió de 3% a 2.5%
- Se añadió SOLUSDT
- Máximo por símbolo cambió de 100 a 75 USDT
```

---


## 14.8 Estándar de gráficos: TradingView en toda la aplicación

### Decisión

Todos los gráficos financieros de CryptoRSI v2 deben construirse con tecnología TradingView. Esto incluye:

```text
- Gráficos de velas de mercado
- RSI y otros indicadores técnicos
- Marcadores de señales de compra/venta
- Órdenes ejecutadas y rechazadas
- Backtesting histórico
- Curva de equity
- PnL realizado/no realizado
- Comparación de versiones de estrategia
- Mini charts del dashboard
```

La decisión elimina Recharts como opción para gráficos financieros. Recharts puede seguir usándose, si se desea, para visualizaciones no financieras o administrativas muy simples, pero no para precio, RSI, órdenes, equity, backtesting ni trading en vivo.

### Tecnología recomendada por fase

| Fase | Tecnología | Uso | Motivo |
|---|---|---|---|
| Fase 1 | TradingView Lightweight Charts | Charts propios con datos Binance, RSI, señales, órdenes, PnL y backtesting | Es ligera, open-source, se instala por npm y permite control total sobre datos internos |
| Fase 2 | TradingView Advanced Charts / Charting Library | Pantalla avanzada de mercado si se quiere experiencia más parecida a TradingView completo | Permite integración con datafeed propio y UI de chart profesional |
| Uso limitado | TradingView Widgets iframe | Solo widgets informativos no críticos | No deben ser la base del bot porque no controlan completamente datos demo/testnet, órdenes internas ni marcadores propios |

### Regla arquitectónica

```text
Todo chart que represente una decisión del bot debe usar datos propios de CryptoRSI v2.
Todo chart que represente mercado ejecutable debe consumir datos Binance normalizados.
Todo chart que muestre señales, órdenes o backtesting debe poder superponer marcadores propios.
```

Por este motivo, la base debe ser **TradingView Lightweight Charts**. La librería permite crear gráficos financieros interactivos desde JavaScript y se integra directamente en una SPA React/Vite. TradingView la documenta como librería para crear charts financieros interactivos y se instala con `npm install --save lightweight-charts`.

### Por qué no usar únicamente widgets embebidos de TradingView

Los widgets oficiales de TradingView son útiles para mostrar información pública de mercado mediante iframe, pero no son la mejor opción para el núcleo de CryptoRSI v2 porque:

```text
- El bot necesita mostrar datos Binance Demo/Testnet y datos normalizados propios.
- Las señales de estrategia viven en la base de datos interna.
- Las órdenes y fills vienen del motor de ejecución.
- El backtesting necesita velas históricas y marcadores calculados internamente.
- Los estados de orden, errores y decisiones rechazadas no existen en un widget público.
```

Los widgets pueden añadirse como elementos informativos secundarios, por ejemplo en `/market/overview`, pero no deben sustituir los charts propios del producto.

### Lightweight Charts como estándar interno

Componente base:

```text
components/charts/TradingViewChart.tsx
```

Responsabilidades:

```text
- Crear y destruir instancia del chart correctamente.
- Recibir series OHLC normalizadas.
- Recibir indicadores como RSI/SMA/EMA.
- Recibir marcadores de señales y órdenes.
- Sincronizar rango temporal con otros paneles.
- Adaptar tema claro/oscuro.
- Mostrar loading, empty y error states.
- Exponer callbacks de rango visible y selección de vela.
```

Subcomponentes:

```text
components/charts/
  TradingViewChart.tsx
  TradingViewCandles.tsx
  TradingViewVolume.tsx
  TradingViewRsiPane.tsx
  TradingViewSignalMarkers.tsx
  TradingViewOrderMarkers.tsx
  TradingViewEquityChart.tsx
  TradingViewBacktestChart.tsx
  TradingViewMiniChart.tsx
```

### Formato normalizado de datos

Todas las velas deben transformarse a un formato interno compatible con TradingView:

```ts
type Candle = {
  time: number;       // Unix timestamp en segundos
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};
```

Indicadores:

```ts
type IndicatorPoint = {
  time: number;
  value: number;
};
```

Marcadores:

```ts
type ChartMarker = {
  time: number;
  type: 'signal' | 'order' | 'fill' | 'risk_block' | 'backtest_trade';
  side?: 'BUY' | 'SELL';
  status?: 'accepted' | 'rejected' | 'filled' | 'cancelled';
  label: string;
  strategyId?: string;
  strategyVersionId?: string;
  orderId?: string;
};
```

### API interna para charts

Endpoints recomendados:

```text
GET /api/charts/symbols
GET /api/charts/:symbol/klines?interval=1h&from=&to=&source=binance_demo
GET /api/charts/:symbol/indicators?strategyId=&versionId=&interval=1h
GET /api/charts/:symbol/markers?strategyId=&versionId=&from=&to=
GET /api/charts/equity?strategyId=&from=&to=
GET /api/charts/backtests/:backtestId
WS  /ws/charts
```

Estos endpoints separan:

```text
- velas de mercado
- indicadores calculados
- señales
- órdenes/fills
- equity/PnL
- eventos de backtesting
```

### Integración en páginas

| Página | Uso de TradingView |
|---|---|
| `/dashboard` | Mini charts de equity, PnL y símbolos principales |
| `/bot` | Chart principal con velas, RSI, señales, órdenes abiertas y fills |
| `/strategies/:id/editor` | Preview de estrategia sobre datos históricos con señales simuladas |
| `/strategies/:id` | Evolución de estrategia, equity y rendimiento por timeframe |
| `/strategies/:id/versions` | Comparación visual de versiones y cambios de señal |
| `/backtests` | Chart histórico con entradas, salidas, stop-loss, take-profit y equity |
| `/orders/:id` | Contexto de la orden sobre vela exacta y señal que la originó |
| `/positions` | Entrada media, precio actual, stop-loss/take-profit y PnL visual |
| `/signals` | Vela y contexto técnico que generaron cada decisión |
| `/market` | Pantalla de mercado completa con velas, volumen, RSI, SMA y estado Binance |
```

### Advanced Charts / Charting Library como fase opcional

Si se quiere una experiencia mucho más parecida a TradingView completo, se puede valorar **TradingView Advanced Charts / Charting Library** como fase posterior. En ese caso CryptoRSI v2 debe exponer un datafeed compatible.

TradingView documenta que Advanced Charts se integra asignando un `datafeed` al Widget Constructor, y que el Datafeed API es el conjunto de métodos que la librería llama para obtener y procesar datos.

Arquitectura opcional:

```text
TradingView Advanced Chart
  ↓
Datafeed API / UDF Adapter
  ↓
CryptoRSI Chart Data Service
  ↓
Market Data Store + Binance + Indicators + Signals
```

Endpoints UDF orientativos si se decide soportarlo:

```text
GET /api/tv/config
GET /api/tv/symbols?symbol=BTCUSDT
GET /api/tv/search?query=BTC&type=crypto&exchange=BINANCE
GET /api/tv/history?symbol=BTCUSDT&resolution=60&from=&to=
GET /api/tv/time
GET /api/tv/marks?symbol=BTCUSDT&from=&to=
GET /api/tv/timescale_marks?symbol=BTCUSDT&from=&to=
```

### Criterios de aceptación de charts

```text
[ ] Ningún chart financiero usa Recharts.
[ ] Todos los charts financieros usan componentes TradingView internos.
[ ] El chart principal del bot muestra velas, RSI, señales, órdenes y fills.
[ ] El backtesting muestra entradas, salidas, stop-loss, take-profit y equity.
[ ] El editor de estrategia permite previsualizar cambios sobre datos históricos.
[ ] El usuario puede distinguir claramente simulation, Binance Demo, Testnet y Live.
[ ] Los datos ejecutables del chart provienen de Binance normalizado.
[ ] Los marcadores de señales y órdenes provienen de la base de datos interna.
[ ] Los charts soportan tema claro/oscuro y redimensionado responsive.
[ ] Los charts no exponen secretos, claves API ni datos sensibles en el frontend.
```


## 14.9 Modelo de API orientado a páginas

Aunque la API interna se detalla en la sección 15, las páginas anteriores necesitan endpoints específicos.

| Página | Endpoint principal |
|---|---|
| Dashboard | `GET /api/dashboard/summary` |
| Bot | `GET /api/bot/status`, `GET /api/bot/events` |
| Estrategias | `GET /api/strategies` |
| Editor | `GET/PUT /api/strategies/:id/draft` |
| Versiones | `GET /api/strategies/:id/versions` |
| Backtests | `GET/POST /api/backtests` |
| Órdenes | `GET /api/orders` |
| Posiciones | `GET /api/positions` |
| Señales | `GET /api/signals` |
| Mercado | `GET /api/market/symbols`, `GET /api/market/:symbol` |
| Configuración | `GET/PUT /api/settings/*` |
| Auditoría | `GET /api/audit/events` |

---

## 14.10 Priorización por fases

### Fase 1 — MVP funcional seguro

```text
- Login + 2FA
- Onboarding inicial
- Dashboard
- Estrategias
- Editor de estrategia básico
- Bot en vivo
- Órdenes
- Posiciones
- Configuración Binance Demo
- Auditoría básica
```

### Fase 2 — Validación operativa

```text
- Backtesting avanzado
- Comparador de versiones
- Señales y decisiones detalladas
- Reconciliación visual
- Página de mercado e indicadores
- Exportaciones CSV
```

### Fase 3 — Preparación para producción

```text
- Riesgo global avanzado
- Live locked/unlock flow
- Confirmaciones reforzadas
- Alertas por email/Telegram
- Reports periódicos
- Multiusuario/roles
- Hardening de auditoría
```

### Fase 4 — Evolución posterior

```text
- Múltiples estrategias simultáneas
- Múltiples exchanges
- Telegram bot
- Indicadores adicionales
- Optimización automática de parámetros
- Laboratorio de estrategias
```

---

## 14.11 Recomendación final de estructura

La estructura mínima que deberíamos construir desde el inicio es:

```text
/dashboard      → visión general
/bot            → seguimiento operativo del bot
/strategies     → gestión de estrategias
/strategies/:id/editor → definición de estrategia
/orders         → órdenes y ejecución
/positions      → posiciones y exposición
/backtests      → validación histórica
/signals        → explicación de decisiones
/market         → datos e indicadores
/settings       → Binance, seguridad, riesgo global y sistema
/audit          → trazabilidad y caja negra
```

Esta estructura cubre lo que ya tenías claro —dashboard, estrategia, bot/órdenes y configuración— pero lo amplía con las piezas necesarias para que CryptoRSI v2 sea operable de forma segura: auditoría, backtesting, posiciones, señales, mercado y versionado.

---
# 15. API interna

## 15.1 Estrategias

```http
GET    /api/strategies
POST   /api/strategies
GET    /api/strategies/:id
PUT    /api/strategies/:id
POST   /api/strategies/:id/duplicate
POST   /api/strategies/:id/activate
POST   /api/strategies/:id/pause
GET    /api/strategies/:id/versions
```

## 15.2 Bot

```http
GET    /api/bot/status
POST   /api/bot/start
POST   /api/bot/stop
POST   /api/bot/evaluate-now
```

## 15.3 Binance

```http
GET    /api/binance/status
GET    /api/binance/account
GET    /api/binance/orders
POST   /api/binance/order-test
POST   /api/binance/reconcile
```

## 15.4 Backtesting

```http
POST   /api/backtests
GET    /api/backtests
GET    /api/backtests/:id
POST   /api/backtests/:id/promote
```

---

# 16. Observabilidad, auditoría, autenticación y seguridad

## 16.1 Logs estructurados

Cada decisión del bot debe loguear:

- `strategyId`,
- `strategyVersionId`,
- `symbol`,
- `timeframe`,
- `signalType`,
- `decision`,
- `riskAllowed`,
- `clientOrderId`,
- `exchangeOrderId`,
- `environment`.

## 16.2 Auditoría funcional

Eventos obligatorios:

- estrategia creada,
- estrategia editada,
- nueva versión creada,
- estrategia activada,
- bot iniciado/parado,
- señal generada,
- orden validada,
- orden enviada,
- fill recibido,
- posición abierta/cerrada,
- producción desbloqueada,
- error de Binance.

## 16.3 Seguridad de claves

Fase inicial:

- API key y secret en `.env`.
- No mostrar secret en UI.
- No guardar secret en DB.

Fase avanzada:

- cifrado de credenciales con KMS o secret manager,
- rotación de claves,
- permisos por usuario,
- auditoría de acceso.

## 16.4 Hard guards

El código debe bloquear producción si:

```ts
if (environment === 'production' && process.env.ALLOW_LIVE_TRADING !== 'true') {
  throw new Error('Live trading is disabled by hard guard');
}
```

Y además:

- estrategia debe estar aprobada para live,
- límites live deben estar configurados,
- debe haber reconciliación activa,
- debe existir confirmación admin.

---

## 16.5 Autenticación con 2FA TOTP

CryptoRSI v2 debe incorporar autenticación multifactor desde el diseño inicial. El método principal será **TOTP** compatible con aplicaciones móviles como Authy, Google Authenticator, Microsoft Authenticator, 1Password o Bitwarden Authenticator. TOTP está definido por el estándar RFC 6238 y genera códigos temporales a partir de un secreto compartido y una ventana de tiempo, normalmente 30 segundos.

### Decisión técnica

- Implementar 2FA mediante TOTP como factor obligatorio para usuarios administradores.
- Permitir login solo con contraseña + TOTP si el usuario tiene 2FA activado.
- Requerir **step-up authentication** para acciones críticas, aunque la sesión ya esté iniciada.
- No usar SMS como segundo factor para esta plataforma, salvo emergencia futura muy justificada, porque OWASP y NIST lo consideran más débil para sistemas de alto valor por riesgos como SIM swapping e interceptación.

### Acciones que deben requerir step-up 2FA

```text
- activar o desactivar trading,
- cambiar el entorno de ejecución,
- desbloquear cualquier modo live,
- crear, editar o eliminar API keys de exchange,
- cambiar límites de riesgo globales,
- cambiar email o contraseña,
- desactivar 2FA,
- regenerar recovery codes,
- eliminar usuario administrador,
- exportar datos sensibles.
```

### Flujo de enrolamiento 2FA

```text
1. Usuario inicia sesión con email y contraseña.
2. Usuario entra en Seguridad > Activar 2FA.
3. Backend genera un secreto TOTP aleatorio.
4. Backend devuelve QR otpauth:// y secreto manual.
5. Usuario escanea el QR con Authy u otra app compatible.
6. Usuario introduce un código TOTP válido.
7. Backend verifica el código.
8. Si es correcto:
   - cifra el secreto TOTP,
   - marca 2FA como activo,
   - genera recovery codes de un solo uso,
   - muestra los recovery codes una única vez.
```

El secreto TOTP no debe guardarse en claro. Debe almacenarse cifrado con cifrado autenticado, por ejemplo AES-256-GCM o XChaCha20-Poly1305. Los recovery codes no deben almacenarse cifrados reversiblemente, sino hasheados como contraseñas.

### Flujo de login con 2FA

```text
1. Usuario envía email + password.
2. Backend valida password.
3. Si 2FA no está activo:
   - si el usuario es admin, forzar setup 2FA antes de permitir operar.
   - si no es admin, permitir sesión según política.
4. Si 2FA está activo:
   - no emitir sesión completa todavía,
   - emitir mfa_challenge temporal de vida corta,
   - pedir código TOTP,
   - validar código,
   - emitir sesión completa.
```

### Rate limiting y bloqueo

```text
- Máximo 5 intentos TOTP fallidos por ventana corta.
- Bloqueo temporal progresivo por usuario/IP.
- Registrar eventos de intento fallido.
- Avisar al usuario si hay múltiples fallos.
- No indicar si falló password o TOTP con mensajes demasiado específicos.
```

### Recovery codes

```text
- Generar 8-12 códigos de recuperación.
- Mostrar una sola vez.
- Guardar solo hash Argon2id de cada código.
- Marcar cada código como usado tras su consumo.
- Requerir password + código de recuperación para recuperar acceso.
- Obligar a regenerar 2FA después de usar recovery code.
```

NIST describe los recovery codes como “look-up secrets”, es decir, secretos de un solo uso que sirven cuando el autenticador se pierde o falla. Deben tratarse como credenciales sensibles.

## 16.6 Cifrado de datos sensibles

CryptoRSI v2 manejará datos especialmente sensibles: cuentas de usuario, configuración de seguridad, secretos TOTP, posibles claves de exchanges y datos operativos. La regla base es: **no cifrar todo sin criterio, sino clasificar datos y aplicar hashing o cifrado según el tipo de dato**.

### Clasificación de datos

| Tipo de dato | Tratamiento recomendado | Motivo |
|---|---|---|
| Password de usuario | Hash Argon2id | Nunca debe ser reversible |
| Recovery codes | Hash Argon2id | Son credenciales de un solo uso |
| TOTP secret | Cifrado reversible | El servidor necesita verificar códigos |
| Binance API secret | Cifrado reversible o Secret Manager | El servidor necesita firmar órdenes |
| Binance API key | Cifrado o masking parcial | Identificador sensible operativo |
| Email | Cifrado opcional + índice hash | Puede ser PII |
| Nombre de usuario | Normalmente claro | Bajo riesgo si no contiene PII sensible |
| Logs de órdenes | Claro con redacción de secretos | Necesario para auditoría |
| Raw responses de Binance | Sanitizado antes de guardar | Evitar persistir datos sensibles innecesarios |

OWASP recomienda no almacenar contraseñas mediante cifrado reversible, sino con algoritmos de password hashing; para contraseñas nuevas, la recomendación preferente es Argon2id con parámetros mínimos robustos. Para datos que sí deben recuperarse, OWASP recomienda un diseño explícito de cifrado de datos en reposo y gestión de claves.

### Estrategia de cifrado recomendada

Para v2 se recomienda **cifrado a nivel de aplicación**, antes de guardar en PostgreSQL. PostgreSQL ofrece opciones como `pgcrypto`, pero si el servidor de base de datos descifra los datos, el dato viaja descifrado hacia la app. Para secretos críticos como TOTP y Binance API Secret, es preferible que el backend controle el cifrado/descifrado y que la base solo vea ciphertext.

Modelo recomendado:

```text
Application-level encryption
  ↓
AES-256-GCM / XChaCha20-Poly1305
  ↓
PostgreSQL almacena ciphertext + iv/nonce + auth tag + key version
  ↓
Master key fuera de la base de datos
```

### Envelope encryption

Para preparar producción:

```text
MASTER_KEY o KMS key
  ↓ cifra
Data Encryption Key por usuario o por secreto
  ↓ cifra
Valor sensible concreto
```

En fase inicial puede bastar una `APP_ENCRYPTION_KEY` fuerte en entorno seguro. En fase avanzada, usar un KMS/Secret Manager con rotación.

### Campos cifrados mínimos

```text
users.email, opcional si hay un email_lookup_hash
user_mfa_secrets.secret_ciphertext
exchange_credentials.api_key_ciphertext
exchange_credentials.api_secret_ciphertext
exchange_credentials.passphrase_ciphertext, si algún exchange lo requiere
sensitive_settings.value_ciphertext
```

### Índices para campos cifrados

Los campos cifrados no se pueden buscar directamente de forma eficiente. Para emails o identificadores que necesiten búsqueda:

```text
email_ciphertext      -> dato cifrado
email_lookup_hash     -> HMAC-SHA256 normalizado para búsqueda exacta
```

Nunca usar hash simple sin clave para datos con poco espacio de búsqueda. Usar HMAC con clave separada.

## 16.7 Gestión de sesiones y tokens

La autenticación no debe depender solo de JWT de larga duración. Se recomienda:

```text
- Access token corto: 10-15 minutos.
- Refresh token rotatorio: 7-30 días según configuración.
- Refresh tokens guardados hasheados en DB.
- Revocación por sesión.
- Tabla de sesiones por usuario/dispositivo.
- Cierre de sesión remoto desde UI.
- Invalidación total al cambiar password o desactivar 2FA.
```

Para una herramienta con trading real futuro, las acciones críticas deben pedir un challenge 2FA reciente. Ejemplo: si el usuario verificó 2FA hace más de 5 minutos, no puede activar trading live sin volver a introducir TOTP.

## 16.8 Modelo de base de datos para seguridad

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email_ciphertext TEXT,
  email_lookup_hash TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  mfa_required BOOLEAN NOT NULL DEFAULT true,
  mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

```sql
CREATE TABLE user_mfa_secrets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL DEFAULT 'totp',
  secret_ciphertext TEXT NOT NULL,
  secret_nonce TEXT NOT NULL,
  secret_tag TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
```

```sql
CREATE TABLE user_recovery_codes (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  refresh_token_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT,
  mfa_verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

```sql
CREATE TABLE exchange_credentials (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  exchange TEXT NOT NULL DEFAULT 'binance',
  environment TEXT NOT NULL,
  label TEXT NOT NULL,
  api_key_ciphertext TEXT NOT NULL,
  api_key_nonce TEXT NOT NULL,
  api_key_tag TEXT NOT NULL,
  api_secret_ciphertext TEXT NOT NULL,
  api_secret_nonce TEXT NOT NULL,
  api_secret_tag TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
```

## 16.9 API interna de autenticación y seguridad

```http
POST   /api/auth/login
POST   /api/auth/mfa/verify
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/sessions
DELETE /api/auth/sessions/:id
```

```http
POST   /api/security/mfa/setup
POST   /api/security/mfa/confirm
POST   /api/security/mfa/disable
POST   /api/security/mfa/recovery-codes/regenerate
POST   /api/security/step-up/verify
```

```http
GET    /api/security/audit-log
GET    /api/security/encryption/status
POST   /api/security/credentials/binance
DELETE /api/security/credentials/binance/:id
```

## 16.10 Requisitos de implementación

Librerías orientativas para Node/TypeScript:

```text
argon2        -> hashing de passwords y recovery codes
speakeasy     -> generación/verificación TOTP
qrcode        -> QR de enrolamiento
jose          -> JWT/JWS/JWE modernos si se usan tokens firmados
node:crypto   -> AES-256-GCM nativo
```

No obstante, antes de implementar TOTP manualmente, se debe valorar si conviene usar un proveedor de autenticación o una librería/framework con MFA maduro. Si se implementa in-house, debe haber tests específicos contra RFC 6238, rate limiting, recuperación y revocación.

## 16.11 Criterios de aceptación de seguridad

```text
[ ] Un usuario admin no puede operar sin 2FA activo.
[ ] El login con 2FA no emite sesión completa antes de verificar TOTP.
[ ] Los secretos TOTP no aparecen en claro en base de datos.
[ ] Los recovery codes solo se muestran una vez.
[ ] Los recovery codes están hasheados, no cifrados ni en claro.
[ ] Las API secrets de Binance no aparecen en claro en base de datos.
[ ] Los logs nunca imprimen API secrets, TOTP secrets, tokens ni recovery codes.
[ ] Existe rate limiting en password login, TOTP verify y recovery code verify.
[ ] Desactivar 2FA requiere password + TOTP reciente.
[ ] Activar live trading requiere step-up 2FA reciente.
[ ] Hay revocación de sesiones.
[ ] Hay rotación planificada de claves de cifrado.
```

---

# 17. Testing, backtesting y validación

## 17.1 Tests unitarios

Prioridad:

- cálculo RSI,
- generación de señales,
- filtros SMA,
- cooldown,
- límites de exposición,
- normalización de símbolos,
- redondeo `LOT_SIZE`,
- generación de `clientOrderId`,
- mapeo de errores Binance.

## 17.2 Tests de integración

- conexión DB,
- creación de estrategia,
- versionado,
- evaluación completa en simulación,
- validación `/api/v3/order/test`,
- reconciliación de órdenes.

## 17.3 Backtesting

El backtesting debe ejecutarse sobre una `StrategyVersion`, no sobre una estrategia editable mutable.

Métricas mínimas:

- rentabilidad total,
- max drawdown,
- win rate,
- profit factor,
- número de operaciones,
- duración media,
- mejor/peor operación,
- exposición media,
- comisiones estimadas.

## 17.4 Paper trading / shadow mode

Antes de demo real, conviene ejecutar modo sombra:

```text
El bot genera señales y decisiones,
pero no envía órdenes.
Guarda qué habría hecho.
Compara resultado con mercado real/demo.
```

---

# 18. Roadmap por fases

## Fase 0 — Diseño y bootstrap

**Objetivo:** crear estructura limpia del monorepo.

Entregables:

- repo v2,
- pnpm workspace,
- TypeScript,
- Fastify,
- React/Vite,
- PostgreSQL local,
- Prisma,
- Docker Compose,
- lint/typecheck/test.

Criterio de aceptación:

- API arranca,
- UI arranca,
- DB migra,
- tests base pasan.

## Fase 1 — Estrategias configurables

Entregables:

- CRUD estrategias,
- versionado,
- editor UI,
- validación de schema,
- auditoría de cambios.

Criterio de aceptación:

- crear, editar, duplicar, activar y pausar estrategias desde UI.

## Fase 2 — Strategy Engine en simulación

Entregables:

- cálculo RSI,
- market data Binance REST,
- señales,
- decisiones,
- posiciones simuladas,
- dashboard.

Criterio de aceptación:

- el bot puede operar en simulación con config UI.

## Fase 3 — Binance Demo dry-run

Entregables:

- cliente firmado Binance,
- `/api/v3/account`,
- `/api/v3/order/test`,
- validación de filtros,
- logs y auditoría.

Criterio de aceptación:

- el bot valida órdenes contra Binance Demo sin enviarlas al matching engine.

## Fase 4 — Binance Demo real

Entregables:

- `POST /api/v3/order`,
- órdenes demo reales,
- fills,
- posiciones demo,
- balances,
- reconciliación básica.

Criterio de aceptación:

- primera compra/venta demo con importe bajo y trazabilidad completa.

## Fase 5 — WebSockets y reconciliación avanzada

Entregables:

- market streams,
- User Data Stream,
- `executionReport`,
- `outboundAccountPosition`,
- reconciliación periódica.

Criterio de aceptación:

- la DB local converge con Binance tras órdenes, fills y cambios de balance.

## Fase 6 — Backtesting avanzado

Entregables:

- backtest por versión,
- comparador,
- métricas,
- promoción de estrategia.

Criterio de aceptación:

- una estrategia puede validarse históricamente y promoverse a demo.

## Fase 7 — Preparación para producción

Entregables:

- hard guards live,
- límites live independientes,
- checklist live,
- permisos admin,
- auditoría extendida,
- alertas.

Criterio de aceptación:

- producción sigue bloqueada salvo configuración explícita y validaciones completas.

---

# 19. Estructura de repositorio propuesta

```text
cryptorsi-v2/
  apps/
    api/
      src/
        modules/
          auth/
          strategies/
          bot/
          binance/
          backtests/
          audit/
        domain/
          strategy/
          signals/
          risk/
          execution/
          positions/
        infrastructure/
          db/
          binance/
          logger/
          websocket/
        server.ts
    web/
      src/
        pages/
        components/
        features/
          dashboard/
          strategies/
          binance/
          backtests/
        api/
        hooks/
        main.tsx
    worker/
      src/
        runner.ts
        jobs/
        strategyLoop.ts
        reconciliationLoop.ts
  packages/
    shared/
      src/
        schemas/
        types/
        constants/
    indicators/
      src/
        rsi.ts
        sma.ts
    binance-client/
      src/
        client.ts
        signer.ts
        orders.ts
        streams.ts
  prisma/
    schema.prisma
    migrations/
  docker-compose.yml
  pnpm-workspace.yaml
  README.md
```

## 19.1 Scripts recomendados

```json
{
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "dev:api": "pnpm --filter api dev",
    "dev:web": "pnpm --filter web dev",
    "dev:worker": "pnpm --filter worker dev",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "build": "pnpm -r build"
  }
}
```

---

# 20. Criterios para activar producción

Producción solo debería desbloquearse cuando se cumpla todo:

- Binance Demo probado con órdenes reales demo.
- User Data Stream funcionando.
- Reconciliación REST funcionando.
- Backtests guardados por versión.
- Paper trading validado.
- Límites de riesgo configurados.
- `ALLOW_LIVE_TRADING=true` configurado manualmente.
- Estrategia aprobada para live.
- UI muestra modo live de forma inequívoca.
- Logs y auditoría revisables.
- Plan de apagado de emergencia.
- Prueba inicial con importe mínimo.

## 20.1 Kill switch

Debe existir un apagado inmediato:

```http
POST /api/bot/kill-switch
```

Efectos:

- pausar todas las estrategias,
- bloquear nuevas órdenes,
- registrar auditoría,
- mantener reconciliación activa,
- mostrar alerta en UI.

---

# 21. Anexos técnicos

## 21.1 Estados normalizados de orden

| Estado | Descripción |
|---|---|
| `NEW` | Orden aceptada por exchange |
| `PARTIALLY_FILLED` | Orden parcialmente ejecutada |
| `FILLED` | Orden completamente ejecutada |
| `CANCELED` | Orden cancelada |
| `REJECTED` | Orden rechazada |
| `EXPIRED` | Orden expirada |
| `UNKNOWN` | Estado no reconciliado todavía |

## 21.2 Ejemplo de tipado de entorno

```ts
export type ExchangeEnvironment = 'demo' | 'testnet' | 'production';

export interface BinanceEnvironmentConfig {
  restBaseUrl: string;
  streamBaseUrl: string;
  wsApiBaseUrl: string;
}
```

## 21.3 Ejemplo de resolución de endpoints

```ts
export const BINANCE_ENVIRONMENTS: Record<ExchangeEnvironment, BinanceEnvironmentConfig> = {
  demo: {
    restBaseUrl: 'https://demo-api.binance.com/api',
    streamBaseUrl: 'wss://demo-stream.binance.com/ws',
    wsApiBaseUrl: 'wss://demo-ws-api.binance.com/ws-api/v3',
  },
  testnet: {
    restBaseUrl: 'https://testnet.binance.vision/api',
    streamBaseUrl: 'wss://stream.testnet.binance.vision/ws',
    wsApiBaseUrl: 'wss://ws-api.testnet.binance.vision/ws-api/v3',
  },
  production: {
    restBaseUrl: 'https://api.binance.com/api',
    streamBaseUrl: 'wss://stream.binance.com/ws',
    wsApiBaseUrl: 'wss://ws-api.binance.com/ws-api/v3',
  },
};
```

## 21.4 Ejemplo de firma HMAC

```ts
import crypto from 'node:crypto';

export function signBinanceQuery(queryString: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');
}
```

## 21.5 Ejemplo de guard live

```ts
export function assertLiveTradingAllowed(environment: ExchangeEnvironment) {
  if (environment === 'production' && process.env.ALLOW_LIVE_TRADING !== 'true') {
    throw new Error('Live trading is disabled by hard guard');
  }
}
```

## 21.6 Ejemplo de order test

```ts
await binanceOrders.testOrder({
  symbol: 'BTCUSDT',
  side: 'BUY',
  type: 'MARKET',
  quoteOrderQty: '25',
  newOrderRespType: 'FULL',
  newClientOrderId: `cryptorsi_${strategyId}_${Date.now()}`,
});
```

## 21.7 Tabla de decisiones recomendadas

| Decisión | Resultado | Razón |
|---|---|---|
| Nueva web | Sí | Permite diseño limpio y evita arrastrar acoplamientos de simulación |
| TypeScript | Sí | Reduce errores de dominio y contratos |
| Fastify | Sí | Validación y serialización por schema |
| Express | No como primera opción | Válido, pero menos adecuado para contratos estrictos nuevos |
| PostgreSQL | Sí | Mejor base para auditoría, concurrencia y órdenes reales |
| SQLite | Solo prototipo local | Correcto para MVP, limitado para crecimiento operativo |
| Binance Demo | Sí | Entorno principal para validar ejecución sin dinero real |
| Binance Live | Futuro | Bloqueado hasta hardening completo |

---

# 22. Fuentes

- [S1] Binance Spot API — Demo Mode General Info: https://developers.binance.com/docs/binance-spot-api-docs/demo-mode/general-info
- [S2] Binance Spot API — Trading Endpoints: https://developers.binance.com/docs/binance-spot-api-docs/rest-api/trading-endpoints
- [S3] Binance Spot API — User Data Stream: https://developers.binance.com/docs/binance-spot-api-docs/user-data-stream
- [S4] Binance Spot API — WebSocket Streams: https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams
- [S5] Binance Spot API — General Endpoints: https://developers.binance.com/docs/binance-spot-api-docs/rest-api/general-endpoints
- [S6] Binance Spot Testnet — General Info: https://developers.binance.com/docs/binance-spot-api-docs/testnet/general-info
- [S7] Node.js Releases: https://nodejs.org/en/about/previous-releases
- [S8] React 19 Release Notes: https://react.dev/blog/2024/12/05/react-19
- [S9] Fastify Validation and Serialization: https://fastify.io/docs/latest/Reference/Validation-and-Serialization/
- [S10] Fastify TypeScript Reference: https://fastify.io/docs/latest/Reference/TypeScript/
- [S11] Prisma Documentation: https://www.prisma.io/docs
- [S12] PostgreSQL MVCC / Concurrency Control: https://www.postgresql.org/docs/current/mvcc.html
- [R1] CryptoRSI actual — package.json: https://raw.githubusercontent.com/GwydeonWOW/CryptoRSI/main/package.json
- [R2] CryptoRSI actual — src/db.js: https://raw.githubusercontent.com/GwydeonWOW/CryptoRSI/main/src/db.js
- [R3] CryptoRSI actual — src/api.js: https://raw.githubusercontent.com/GwydeonWOW/CryptoRSI/main/src/api.js

- [S13] RFC 6238 — TOTP: Time-Based One-Time Password Algorithm: https://datatracker.ietf.org/doc/html/rfc6238
- [S14] OWASP — Multifactor Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
- [S15] OWASP — Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- [S16] OWASP — Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- [S17] OWASP — Cryptographic Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- [S18] OWASP — Key Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html
- [S19] OWASP — Secrets Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- [S20] NIST SP 800-63B — Digital Identity Guidelines, Authentication and Lifecycle Management: https://pages.nist.gov/800-63-4/sp800-63b.html
- [S21] PostgreSQL — Encryption Options / pgcrypto: https://www.postgresql.org/docs/current/encryption-options.html


## 22.5 Fuentes añadidas para estructura de web y seguridad UX

- [NOFX — README del repositorio](https://github.com/NoFxAiOS/nofx): referencia de producto para flujo `AI → Exchange → Strategy → Trader → Trade`, dashboard, strategy studio, configuración y monitorización.
- [NOFX — Web Dashboard README](https://github.com/NoFxAiOS/nofx/tree/dev/web): referencia de frontend React/TypeScript/Vite, estado del sistema, cuenta, posiciones, decisiones, estadísticas, auto-refresh y futuras páginas de parámetros.
- [NOFX — Architecture Documentation](https://github.com/NoFxAiOS/nofx/blob/dev/docs/architecture/README.md): referencia de separación entre Strategy Studio, Live Trading, Core Services, Exchanges, Database y Frontend UI.
- [NOFX — Strategy Module](https://github.com/NoFxAiOS/nofx/blob/dev/docs/architecture/STRATEGY_MODULE.md): referencia de flujo de estrategia, selección de monedas, ensamblado de datos, indicadores, risk control y ejecución de decisiones.
- [OWASP Multifactor Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html): referencia para step-up MFA en acciones sensibles, cambios de factor y cuentas de alto valor.


## 22.6 Fuentes añadidas para estándar de charts TradingView

- [TradingView Lightweight Charts — Documentation](https://tradingview.github.io/lightweight-charts/): referencia principal para implementar charts financieros interactivos propios en la SPA.
- [TradingView Lightweight Charts — GitHub](https://github.com/tradingview/lightweight-charts): referencia de librería open-source, rendimiento y uso para charts financieros embebidos.
- [TradingView Advanced Charts — Documentation](https://www.tradingview.com/charting-library-docs/): referencia opcional para una integración avanzada con datafeed propio.
- [TradingView Advanced Charts — Datafeed API](https://www.tradingview.com/charting-library-docs/latest/connecting_data/Datafeed-API/): referencia para conectar charts avanzados con backend propio.
- [TradingView Advanced Charts — UDF Adapter](https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF/): referencia para exponer datos mediante protocolo UDF HTTP.
- [TradingView Widgets — Advanced Real-Time Chart](https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/): referencia de widgets iframe, adecuados solo para uso informativo no crítico.
