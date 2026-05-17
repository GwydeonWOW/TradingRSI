import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';

// Mock prisma before any imports that use it
vi.mock('../infrastructure/db/prisma.js', () => ({
  prisma: {
    strategy: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'test-strategy',
        name: 'Test Strategy',
        status: 'active',
        mode: 'simulation',
        environment: 'demo',
        versions: [{
          id: 'v1',
          version: 1,
          config: {
            symbols: ['BTCUSDT'],
            timeframes: ['1h'],
            entry: { rsiBelow: 30, requireMultiTimeframeConfirmation: false, useSmaFilter: false, smaPeriod: 200 },
            exit: { rsiAbove: 70, takeProfitPct: 8, stopLossPct: 3, trailingStopPct: null },
            risk: { quoteAmountPerTrade: 25, maxOpenPositions: 5, maxPositionsPerSymbol: 2, maxTotalExposureQuote: 500, maxDailyLossPct: 5, cooldownMinutes: 0 },
            execution: { orderType: 'MARKET', useOrderTestBeforeRealOrder: true, dryRun: true },
          },
        }],
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    signal: { create: vi.fn().mockResolvedValue({ id: 'sig1' }), findFirst: vi.fn().mockResolvedValue({ id: 'sig1' }) },
    decision: { create: vi.fn().mockResolvedValue({ id: 'dec1' }) },
    position: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: 'pos1' }), update: vi.fn().mockResolvedValue({ id: 'pos1' }) },
    auditEvent: { create: vi.fn().mockResolvedValue({ id: 'audit1' }) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

import { botRoutes } from '../modules/bot/routes.js';
import { resetBotState } from '../modules/bot/state.js';

describe('Bot API', () => {
  function buildApp() {
    const app = Fastify();
    app.register(botRoutes);
    return app;
  }

  it('should return idle status', async () => {
    resetBotState();
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/bot/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('idle');
  });

  it('should start bot with valid strategy', async () => {
    resetBotState();
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/bot/start',
      payload: { strategyId: 'test-strategy' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('running');
  });

  it('should reject start without strategyId', async () => {
    resetBotState();
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/bot/start',
      payload: {},
    });
    expect(res.json().success).toBe(false);
  });

  it('should stop running bot', async () => {
    const app = buildApp();
    // Start first
    await app.inject({ method: 'POST', url: '/api/bot/start', payload: { strategyId: 'test-strategy' } });
    const res = await app.inject({ method: 'POST', url: '/api/bot/stop' });
    expect(res.json().data.status).toBe('idle');
  });

  it('should return events', async () => {
    resetBotState();
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/bot/events' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });

  it('should activate kill switch', async () => {
    resetBotState();
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/bot/kill-switch' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});
