import type { FastifyInstance } from 'fastify';
import { prisma } from '../../infrastructure/db/prisma.js';

export async function positionRoutes(app: FastifyInstance) {
  // GET /api/positions - Listar posiciones
  app.get('/api/positions', async (request) => {
    const query = request.query as {
      status?: string;
      symbol?: string;
      strategyId?: string;
      source?: string;
    };

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.symbol) where.symbol = query.symbol;
    if (query.strategyId) where.strategyId = query.strategyId;
    if (query.source) where.source = query.source;

    const positions = await prisma.position.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return { success: true, data: positions };
  });

  // GET /api/positions/:id - Detalle de posicion
  app.get('/api/positions/:id', async (request) => {
    const { id } = request.params as { id: string };
    const position = await prisma.position.findUnique({ where: { id } });

    if (!position) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Position not found' } };
    }
    return { success: true, data: position };
  });
}
