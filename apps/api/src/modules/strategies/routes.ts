import type { FastifyInstance } from 'fastify';
import { prisma } from '../../infrastructure/db/prisma.js';
import { CreateStrategySchema, StrategyConfigSchema } from '@cryptorsi/shared';
import { logger } from '../../infrastructure/logger/index.js';
import { createAuditEvent } from '../audit/helpers.js';
import { canPromoteToLive, checkLiveReadiness, type LiveTradingChecklist } from '../../domain/guards/index.js';

export async function strategyRoutes(app: FastifyInstance) {
  // GET /api/strategies - List strategies (paginated)
  app.get('/api/strategies', async (request, reply) => {
    try {
      const query = request.query as Record<string, string | undefined>;
      const page = Math.max(1, Number(query['page']) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(query['pageSize']) || 20));
      const status = query['status'];
      const mode = query['mode'];

      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (mode) where.mode = mode;

      const [strategies, total] = await Promise.all([
        prisma.strategy.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              select: { version: true, config: true },
            },
          },
        }),
        prisma.strategy.count({ where }),
      ]);

      const data = strategies.map((s: { id: string; name: string; status: string; mode: string; updatedAt: Date; versions: { version: number; config: unknown }[] }) => {
        const latestVersion = s.versions[0];
        const config = latestVersion?.config as Record<string, unknown> | undefined;
        return {
          id: s.id,
          name: s.name,
          status: s.status,
          mode: s.mode,
          currentVersion: latestVersion?.version ?? 0,
          symbols: (config?.['symbols'] as string[]) ?? [],
          updatedAt: s.updatedAt,
        };
      });

      return reply.code(200).send({
        success: true,
        data,
        pagination: { page, pageSize, total },
      });
    } catch (err) {
      logger.error(err, 'Failed to list strategies');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to list strategies' },
      });
    }
  });

  // POST /api/strategies - Create strategy
  app.post('/api/strategies', async (request, reply) => {
    try {
      const parseResult = CreateStrategySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parseResult.error.issues.map((i) => i.message).join('; '),
          },
        });
      }

      const { name, description, mode, environment, config } = parseResult.data;

      const strategy = await prisma.strategy.create({
        data: {
          name,
          description,
          mode,
          environment,
          status: 'draft',
          versions: {
            create: {
              version: 1,
              config: config as any,
            },
          },
        },
        include: { versions: true },
      });

      await createAuditEvent({
        actorType: 'system',
        eventType: 'strategy.created',
        entityType: 'strategy',
        entityId: strategy.id,
        payload: { name, mode, environment },
      });

      return reply.code(201).send({ success: true, data: strategy });
    } catch (err) {
      logger.error(err, 'Failed to create strategy');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create strategy' },
      });
    }
  });

  // GET /api/strategies/:id - Get strategy detail
  app.get('/api/strategies/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const strategy = await prisma.strategy.findUnique({
        where: { id },
        include: {
          versions: {
            orderBy: { version: 'desc' },
            take: 5,
          },
        },
      });

      if (!strategy) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
        });
      }

      // Get basic metrics + position stats
      const [signalCount, orderCount, activePositions, closedPositions] = await Promise.all([
        prisma.signal.count({ where: { strategyId: id } }),
        prisma.exchangeOrder.count({ where: { strategyId: id } }),
        prisma.position.count({ where: { strategyId: id, status: 'open' } }),
        prisma.position.findMany({
          where: { strategyId: id, status: 'closed', realizedPnl: { not: null } },
          select: { realizedPnl: true, realizedPnlPct: true },
        }),
      ]);

      const totalTrades = closedPositions.length;
      const totalRealizedPnl = closedPositions.reduce(
        (sum: number, p: { realizedPnl: { toNumber: () => number } | null }) => sum + (p.realizedPnl?.toNumber() ?? 0), 0,
      );
      const winningTrades = closedPositions.filter((p: { realizedPnl: { toNumber: () => number } | null }) => (p.realizedPnl?.toNumber() ?? 0) > 0).length;
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

      return reply.code(200).send({
        success: true,
        data: {
          ...strategy,
          metrics: {
            signalCount,
            orderCount,
            activePositions,
            totalTrades,
            totalRealizedPnl,
            winRate,
          },
        },
      });
    } catch (err) {
      logger.error(err, 'Failed to get strategy');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get strategy' },
      });
    }
  });

  // PUT /api/strategies/:id - Update strategy
  app.put('/api/strategies/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, unknown>;

      const existing = await prisma.strategy.findUnique({
        where: { id },
        include: {
          versions: { orderBy: { version: 'desc' }, take: 1 },
        },
      });

      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
        });
      }

      const allowedFields = ['name', 'description', 'status'];
      const updateData: Record<string, unknown> = {};
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updateData[field] = body[field];
        }
      }

      // If config is provided, validate it and create a new version
      if (body['config'] !== undefined) {
        const configResult = StrategyConfigSchema.safeParse(body['config']);
        if (!configResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: configResult.error.issues.map((i) => i.message).join('; '),
            },
          });
        }

        const latestVersion = existing.versions[0];
        const nextVersion = (latestVersion?.version ?? 0) + 1;

        await prisma.strategyVersion.create({
          data: {
            strategyId: id,
            version: nextVersion,
            config: configResult.data as any,
          },
        });
      }

      const updated = await prisma.strategy.update({
        where: { id },
        data: updateData,
        include: {
          versions: { orderBy: { version: 'desc' }, take: 5 },
        },
      });

      await createAuditEvent({
        actorType: 'system',
        eventType: 'strategy.updated',
        entityType: 'strategy',
        entityId: id,
        payload: { updatedFields: Object.keys(updateData), configChanged: body['config'] !== undefined },
      });

      return reply.code(200).send({ success: true, data: updated });
    } catch (err) {
      logger.error(err, 'Failed to update strategy');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to update strategy' },
      });
    }
  });

  // POST /api/strategies/:id/duplicate - Duplicate strategy
  app.post('/api/strategies/:id/duplicate', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const existing = await prisma.strategy.findUnique({
        where: { id },
        include: {
          versions: { orderBy: { version: 'desc' }, take: 1 },
        },
      });

      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
        });
      }

      const latestConfig = existing.versions[0]?.config as Record<string, unknown> | undefined;

      const duplicated = await prisma.strategy.create({
        data: {
          name: `Copia de ${existing.name}`,
          description: existing.description,
          status: 'draft',
          mode: existing.mode,
          environment: existing.environment,
          versions: {
            create: {
              version: 1,
              config: (latestConfig ?? {}) as any,
            },
          },
        },
        include: { versions: true },
      });

      await createAuditEvent({
        actorType: 'system',
        eventType: 'strategy.duplicated',
        entityType: 'strategy',
        entityId: duplicated.id,
        payload: { sourceStrategyId: id, sourceName: existing.name },
      });

      return reply.code(201).send({ success: true, data: duplicated });
    } catch (err) {
      logger.error(err, 'Failed to duplicate strategy');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to duplicate strategy' },
      });
    }
  });

  // POST /api/strategies/:id/activate - Activate strategy
  app.post('/api/strategies/:id/activate', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const existing = await prisma.strategy.findUnique({ where: { id } });

      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
        });
      }

      // Pause any other active strategy (only 1 active at a time)
      await prisma.strategy.updateMany({
        where: { status: 'active', id: { not: id } },
        data: { status: 'paused' },
      });

      const updated = await prisma.strategy.update({
        where: { id },
        data: { status: 'active' },
      });

      await createAuditEvent({
        actorType: 'system',
        eventType: 'strategy.activated',
        entityType: 'strategy',
        entityId: id,
        payload: { previousStatus: existing.status },
      });

      return reply.code(200).send({ success: true, data: updated });
    } catch (err) {
      logger.error(err, 'Failed to activate strategy');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to activate strategy' },
      });
    }
  });

  // POST /api/strategies/:id/pause - Pause strategy
  app.post('/api/strategies/:id/pause', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const existing = await prisma.strategy.findUnique({ where: { id } });

      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
        });
      }

      const updated = await prisma.strategy.update({
        where: { id },
        data: { status: 'paused' },
      });

      await createAuditEvent({
        actorType: 'system',
        eventType: 'strategy.paused',
        entityType: 'strategy',
        entityId: id,
        payload: { previousStatus: existing.status },
      });

      return reply.code(200).send({ success: true, data: updated });
    } catch (err) {
      logger.error(err, 'Failed to pause strategy');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to pause strategy' },
      });
    }
  });

  // GET /api/strategies/:id/versions/:versionId - Get specific version config
  app.get('/api/strategies/:id/versions/:versionId', async (request, reply) => {
    try {
      const { id, versionId } = request.params as { id: string; versionId: string };

      const strategy = await prisma.strategy.findUnique({ where: { id } });
      if (!strategy) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
        });
      }

      const version = await prisma.strategyVersion.findUnique({
        where: { id: versionId },
      });

      if (!version || version.strategyId !== id) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Version not found' },
        });
      }

      return reply.code(200).send({ success: true, data: version });
    } catch (err) {
      logger.error(err, 'Failed to get strategy version');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get strategy version' },
      });
    }
  });

  // GET /api/strategies/:id/versions - List versions
  app.get('/api/strategies/:id/versions', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const strategy = await prisma.strategy.findUnique({ where: { id } });

      if (!strategy) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
        });
      }

      const versions = await prisma.strategyVersion.findMany({
        where: { strategyId: id },
        orderBy: { version: 'desc' },
      });

      return reply.code(200).send({ success: true, data: versions });
    } catch (err) {
      logger.error(err, 'Failed to list strategy versions');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to list strategy versions' },
      });
    }
  });

  // POST /api/strategies/:id/promote - Promote strategy to live-capable
  app.post('/api/strategies/:id/promote', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const strategy = await prisma.strategy.findUnique({ where: { id } });
      if (!strategy) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
        });
      }

      // Check demo history: at least some positions in binance_demo mode
      const demoPositions = await prisma.position.findMany({
        where: { strategyId: id, source: 'binance_demo' },
      });
      const hasDemoHistory = demoPositions.length > 0;

      // Calculate win rate from demo positions
      const closedDemoPositions = await prisma.position.findMany({
        where: {
          strategyId: id,
          source: { in: ['binance_demo', 'simulation'] },
          status: 'closed',
          realizedPnl: { not: null },
        },
        select: { realizedPnl: true, realizedPnlPct: true },
      });
      const totalTrades = closedDemoPositions.length;
      const winningTrades = closedDemoPositions.filter(
        (p: { realizedPnl: { toNumber: () => number } | null }) => (p.realizedPnl?.toNumber() ?? 0) > 0,
      ).length;
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

      // Get max drawdown from closed positions (simplified)
      let maxDrawdown = 0;
      if (closedDemoPositions.length > 0) {
        const pnls = closedDemoPositions.map(
          (p: { realizedPnlPct: { toNumber: () => number } | null }) => p.realizedPnlPct?.toNumber() ?? 0,
        );
        const minPnl = Math.min(...pnls);
        maxDrawdown = Math.abs(minPnl);
      }

      // Check if strategy can be promoted
      const promoteResult = canPromoteToLive({
        status: strategy.status,
        mode: strategy.mode,
        environment: strategy.environment,
        hasDemoHistory,
        backtestResults: totalTrades > 0 ? { winRate, maxDrawdown } : null,
      });

      if (!promoteResult.allowed) {
        await createAuditEvent({
          actorType: 'system',
          eventType: 'strategy.promotion_blocked',
          entityType: 'strategy',
          entityId: id,
          payload: { reason: promoteResult.reason, demoPositions: demoPositions.length, winRate, maxDrawdown },
        });

        return reply.code(400).send({
          success: false,
          error: { code: 'PROMOTION_BLOCKED', message: promoteResult.reason! },
          data: { demoPositions: demoPositions.length, winRate, maxDrawdown, totalTrades },
        });
      }

      // Check live readiness (environment-level)
      const allowLiveTradingEnvSet = process.env.ALLOW_LIVE_TRADING === 'true';
      let binanceConnected = false;
      try {
        const { BINANCE_ENVIRONMENTS: ENV_CONFIG } = await import('@cryptorsi/shared');
        const env = (process.env.BINANCE_ENV ?? 'demo') as 'demo' | 'testnet' | 'production';
        const pingRes = await fetch(`${ENV_CONFIG[env].restBaseUrl}/v3/ping`);
        binanceConnected = pingRes.ok;
      } catch {
        binanceConnected = false;
      }

      const liveReadiness = checkLiveReadiness({
        allowLiveTradingEnvSet,
        strategyApprovedForLive: true, // This strategy is being approved now
        riskLimitsConfigured: true,
        reconciliationActive: false,
        testOrdersPassed: false,
        auditLogHealthy: true,
        binanceConnected,
        credentialsValid: false,
      });

      // Promotion succeeded: mark strategy as live-capable but don't enable it
      // We don't change mode to binance_live automatically; just record the approval
      await createAuditEvent({
        actorType: 'system',
        eventType: 'strategy.promoted_to_live',
        entityType: 'strategy',
        entityId: id,
        payload: {
          previousMode: strategy.mode,
          demoPositions: demoPositions.length,
          winRate,
          maxDrawdown,
          totalTrades,
          liveReadiness: { allowed: liveReadiness.allowed, missing: liveReadiness.missing },
        },
      });

      return reply.code(200).send({
        success: true,
        data: {
          promoted: true,
          strategyId: id,
          metrics: { demoPositions: demoPositions.length, winRate, maxDrawdown, totalTrades },
          liveReadiness: {
            allowed: liveReadiness.allowed,
            missing: liveReadiness.missing,
          },
          message: 'Strategy approved for live promotion. Live trading remains disabled until all readiness checks pass.',
        },
      });
    } catch (err) {
      logger.error(err, 'Failed to promote strategy');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to promote strategy' },
      });
    }
  });
}
