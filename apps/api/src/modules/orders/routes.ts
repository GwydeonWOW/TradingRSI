import type { FastifyInstance } from 'fastify';
import { prisma } from '../../infrastructure/db/prisma.js';

export async function orderRoutes(app: FastifyInstance) {
  // GET /api/orders - Listar ordenes
  app.get('/api/orders', async (request) => {
    const query = request.query as {
      status?: string;
      symbol?: string;
      strategyId?: string;
      side?: string;
    };

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.symbol) where.symbol = query.symbol;
    if (query.strategyId) where.strategyId = query.strategyId;
    if (query.side) where.side = query.side;

    const orders = await prisma.exchangeOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return { success: true, data: orders };
  });

  // GET /api/orders/:id - Detalle de orden
  app.get('/api/orders/:id', async (request) => {
    const { id } = request.params as { id: string };
    const order = await prisma.exchangeOrder.findUnique({
      where: { id },
      include: { fills: true },
    });

    if (!order) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } };
    }
    return { success: true, data: order };
  });

  // GET /api/signals - Listar senales
  app.get('/api/signals', async (request) => {
    const query = request.query as {
      strategyId?: string;
      symbol?: string;
      signalType?: string;
    };

    const where: Record<string, unknown> = {};
    if (query.strategyId) where.strategyId = query.strategyId;
    if (query.symbol) where.symbol = query.symbol;
    if (query.signalType) where.signalType = query.signalType;

    // Exclude HOLD signals — only return actionable signals
    if (!where.signalType) {
      where.signalType = { in: ['BUY_SIGNAL', 'SELL_SIGNAL', 'BLOCKED_BY_RISK', 'BLOCKED_BY_ENVIRONMENT'] };
    }

    const signals = await prisma.signal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return { success: true, data: signals };
  });
}
