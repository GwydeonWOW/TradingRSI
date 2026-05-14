import type { FastifyInstance } from 'fastify';
import { prisma } from '../../infrastructure/db/prisma.js';
import { CreateStrategySchema, StrategyConfigSchema } from '@cryptorsi/shared';
import { logger } from '../../infrastructure/logger/index.js';
import { createAuditEvent } from '../audit/helpers.js';

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
              config: config as unknown as Record<string, unknown>,
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

      // Get basic metrics
      const [signalCount, orderCount, activePositions] = await Promise.all([
        prisma.signal.count({ where: { strategyId: id } }),
        prisma.exchangeOrder.count({ where: { strategyId: id } }),
        prisma.position.count({ where: { strategyId: id, status: 'open' } }),
      ]);

      return reply.code(200).send({
        success: true,
        data: {
          ...strategy,
          metrics: { signalCount, orderCount, activePositions },
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

      const allowedFields = ['name', 'description', 'status', 'mode', 'environment'];
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
            config: configResult.data as unknown as Record<string, unknown>,
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
              config: latestConfig ?? {},
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
}
