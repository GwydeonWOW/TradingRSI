import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// Mock prisma before any imports that use it
vi.mock('../infrastructure/db/prisma.js', () => {
  const mockPrisma = {
    strategy: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    strategyVersion: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    signal: { count: vi.fn() },
    exchangeOrder: { count: vi.fn() },
    position: { count: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  return { prisma: mockPrisma };
});

vi.mock('../infrastructure/logger/index.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

import { prisma } from '../infrastructure/db/prisma.js';
import { strategyRoutes } from '../modules/strategies/routes.js';

const mockedPrisma = prisma as unknown as {
  strategy: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  strategyVersion: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  signal: { count: ReturnType<typeof vi.fn> };
  exchangeOrder: { count: ReturnType<typeof vi.fn> };
  position: { count: ReturnType<typeof vi.fn> };
  auditEvent: { create: ReturnType<typeof vi.fn> };
};

const validConfig = {
  symbols: ['BTCUSDT'],
  timeframes: ['1h'],
  entry: {
    rsiBelow: 30,
    requireMultiTimeframeConfirmation: false,
    useSmaFilter: false,
    smaPeriod: 14,
    cooldownMinutes: 5,
  },
  exit: {
    rsiAbove: 70,
    takeProfitPct: 2,
    stopLossPct: 1,
    trailingStopPct: null,
  },
  risk: {
    quoteAmountPerTrade: 100,
    maxOpenPositions: 3,
    maxPositionsPerSymbol: 1,
    maxTotalExposureQuote: 500,
    maxDailyLossPct: 5,
    cooldownMinutes: 10,
  },
  execution: {
    orderType: 'MARKET' as const,
    useOrderTestBeforeRealOrder: false,
    dryRun: true,
  },
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(strategyRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedPrisma.auditEvent.create.mockResolvedValue({ id: 'audit-1' });
});

describe('Strategy CRUD', () => {
  describe('GET /api/strategies', () => {
    it('should return paginated list of strategies', async () => {
      mockedPrisma.strategy.findMany.mockResolvedValue([
        {
          id: 's1',
          name: 'Test Strategy',
          status: 'draft',
          mode: 'simulation',
          environment: 'demo',
          updatedAt: new Date(),
          versions: [{ version: 1, config: { symbols: ['BTCUSDT'] } }],
        },
      ]);
      mockedPrisma.strategy.count.mockResolvedValue(1);

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/strategies' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].name).toBe('Test Strategy');
      expect(body.pagination.total).toBe(1);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.pageSize).toBe(20);
    });

    it('should filter by status and mode', async () => {
      mockedPrisma.strategy.findMany.mockResolvedValue([]);
      mockedPrisma.strategy.count.mockResolvedValue(0);

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/strategies?status=active&mode=simulation&page=2&pageSize=10',
      });

      expect(res.statusCode).toBe(200);
      expect(mockedPrisma.strategy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'active', mode: 'simulation' },
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  describe('POST /api/strategies', () => {
    it('should create a strategy with version 1', async () => {
      const created = {
        id: 's1',
        name: 'My Strategy',
        description: 'desc',
        status: 'draft',
        mode: 'simulation',
        environment: 'demo',
        updatedAt: new Date(),
        versions: [{ id: 'v1', version: 1, config: validConfig }],
      };
      mockedPrisma.strategy.create.mockResolvedValue(created);

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/strategies',
        payload: {
          name: 'My Strategy',
          description: 'desc',
          mode: 'simulation',
          environment: 'demo',
          config: validConfig,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('My Strategy');
      expect(mockedPrisma.strategy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'My Strategy',
            status: 'draft',
            versions: {
              create: expect.objectContaining({ version: 1 }),
            },
          }),
        }),
      );
      expect(mockedPrisma.auditEvent.create).toHaveBeenCalled();
    });

    it('should reject invalid body with 400', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/strategies',
        payload: { name: '' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/strategies/:id', () => {
    it('should return strategy detail with metrics', async () => {
      const strategy = {
        id: 's1',
        name: 'Test',
        status: 'active',
        mode: 'simulation',
        environment: 'demo',
        description: null,
        updatedAt: new Date(),
        createdAt: new Date(),
        versions: [{ id: 'v1', version: 2, config: validConfig, createdBy: null, createdAt: new Date() }],
      };
      mockedPrisma.strategy.findUnique.mockResolvedValue(strategy);
      mockedPrisma.signal.count.mockResolvedValue(10);
      mockedPrisma.exchangeOrder.count.mockResolvedValue(5);
      mockedPrisma.position.count.mockResolvedValue(2);

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/strategies/s1' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.metrics.signalCount).toBe(10);
      expect(body.data.metrics.orderCount).toBe(5);
      expect(body.data.metrics.activePositions).toBe(2);
    });

    it('should return 404 for non-existent strategy', async () => {
      mockedPrisma.strategy.findUnique.mockResolvedValue(null);

      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/strategies/nonexistent' });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/strategies/:id', () => {
    it('should update allowed fields only', async () => {
      const existing = {
        id: 's1',
        name: 'Old',
        status: 'draft',
        mode: 'simulation',
        environment: 'demo',
        description: null,
        updatedAt: new Date(),
        createdAt: new Date(),
        versions: [{ id: 'v1', version: 1, config: validConfig }],
      };
      mockedPrisma.strategy.findUnique.mockResolvedValue(existing);
      mockedPrisma.strategy.update.mockResolvedValue({
        ...existing,
        name: 'Updated',
        versions: [existing.versions[0]],
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/strategies/s1',
        payload: { name: 'Updated', description: 'new desc' },
      });

      expect(res.statusCode).toBe(200);
      expect(mockedPrisma.strategy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: 'Updated', description: 'new desc' },
        }),
      );
    });

    it('should create new version when config changes', async () => {
      const existing = {
        id: 's1',
        name: 'Test',
        status: 'draft',
        mode: 'simulation',
        environment: 'demo',
        description: null,
        updatedAt: new Date(),
        createdAt: new Date(),
        versions: [{ id: 'v1', version: 1, config: validConfig }],
      };
      mockedPrisma.strategy.findUnique.mockResolvedValue(existing);
      mockedPrisma.strategyVersion.create.mockResolvedValue({ id: 'v2', version: 2 });
      mockedPrisma.strategy.update.mockResolvedValue({
        ...existing,
        versions: [{ id: 'v2', version: 2 }],
      });

      const updatedConfig = { ...validConfig, symbols: ['ETHUSDT'] };

      const app = await buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/strategies/s1',
        payload: { config: updatedConfig },
      });

      expect(res.statusCode).toBe(200);
      expect(mockedPrisma.strategyVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: 2, strategyId: 's1' }),
        }),
      );
    });

    it('should return 404 for non-existent strategy', async () => {
      mockedPrisma.strategy.findUnique.mockResolvedValue(null);

      const app = await buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/strategies/nonexistent',
        payload: { name: 'X' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should reject invalid config with 400', async () => {
      mockedPrisma.strategy.findUnique.mockResolvedValue({
        id: 's1',
        versions: [{ version: 1 }],
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/strategies/s1',
        payload: { config: { symbols: [] } }, // missing required fields
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/strategies/:id/duplicate', () => {
    it('should duplicate strategy with "Copia de" prefix and draft status', async () => {
      const existing = {
        id: 's1',
        name: 'Original',
        description: 'desc',
        mode: 'simulation',
        environment: 'demo',
        versions: [{ version: 1, config: validConfig }],
      };
      mockedPrisma.strategy.findUnique.mockResolvedValue(existing);
      const duplicated = {
        id: 's2',
        name: 'Copia de Original',
        status: 'draft',
        mode: 'simulation',
        environment: 'demo',
        versions: [{ id: 'v2', version: 1, config: validConfig }],
      };
      mockedPrisma.strategy.create.mockResolvedValue(duplicated);

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/strategies/s1/duplicate',
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.name).toBe('Copia de Original');
      expect(mockedPrisma.strategy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'draft' }),
        }),
      );
      expect(mockedPrisma.auditEvent.create).toHaveBeenCalled();
    });

    it('should return 404 for non-existent strategy', async () => {
      mockedPrisma.strategy.findUnique.mockResolvedValue(null);

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/strategies/nonexistent/duplicate',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/strategies/:id/activate', () => {
    it('should activate strategy and pause others', async () => {
      mockedPrisma.strategy.findUnique.mockResolvedValue({
        id: 's1',
        status: 'draft',
      });
      mockedPrisma.strategy.updateMany.mockResolvedValue({ count: 1 });
      mockedPrisma.strategy.update.mockResolvedValue({
        id: 's1',
        status: 'active',
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/strategies/s1/activate',
      });

      expect(res.statusCode).toBe(200);
      expect(mockedPrisma.strategy.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'active', id: { not: 's1' } },
          data: { status: 'paused' },
        }),
      );
      expect(mockedPrisma.strategy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 's1' },
          data: { status: 'active' },
        }),
      );
    });

    it('should return 404 for non-existent strategy', async () => {
      mockedPrisma.strategy.findUnique.mockResolvedValue(null);

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/strategies/nonexistent/activate',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/strategies/:id/pause', () => {
    it('should pause strategy', async () => {
      mockedPrisma.strategy.findUnique.mockResolvedValue({
        id: 's1',
        status: 'active',
      });
      mockedPrisma.strategy.update.mockResolvedValue({
        id: 's1',
        status: 'paused',
      });

      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/strategies/s1/pause',
      });

      expect(res.statusCode).toBe(200);
      expect(mockedPrisma.strategy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'paused' },
        }),
      );
      expect(mockedPrisma.auditEvent.create).toHaveBeenCalled();
    });
  });

  describe('GET /api/strategies/:id/versions', () => {
    it('should return versions ordered by version desc', async () => {
      mockedPrisma.strategy.findUnique.mockResolvedValue({ id: 's1' });
      mockedPrisma.strategyVersion.findMany.mockResolvedValue([
        { id: 'v2', version: 2, config: validConfig },
        { id: 'v1', version: 1, config: validConfig },
      ]);

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/strategies/s1/versions',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(2);
      expect(body.data[0].version).toBe(2);
    });

    it('should return 404 for non-existent strategy', async () => {
      mockedPrisma.strategy.findUnique.mockResolvedValue(null);

      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/strategies/nonexistent/versions',
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
