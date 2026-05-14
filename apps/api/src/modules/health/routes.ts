import type { FastifyInstance } from 'fastify';
import { prisma } from '../../infrastructure/db/prisma.js';
import { APP_VERSION } from '@cryptorsi/shared';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/api/health', async (_request, reply) => {
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch {
      dbStatus = 'disconnected';
    }

    const health = {
      status: dbStatus === 'connected' ? ('ok' as const) : ('degraded' as const),
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
      uptime: process.uptime(),
      services: {
        database: dbStatus,
        binance: 'not_configured' as const,
      },
    };

    const code = dbStatus === 'connected' ? 200 : 503;
    return reply.code(code).send(health);
  });
}
