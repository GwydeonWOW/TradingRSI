import Fastify from 'fastify';
import cors from '@fastify/cors';
import { logger } from './infrastructure/logger/index.js';
import { healthRoutes } from './modules/health/routes.js';
import { strategyRoutes } from './modules/strategies/routes.js';
import { botRoutes } from './modules/bot/routes.js';
import { prisma } from './infrastructure/db/prisma.js';

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

async function start() {
  const app = Fastify({
    logger: false, // We use our own pino logger
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Routes
  await app.register(healthRoutes);
  await app.register(strategyRoutes);
  await app.register(botRoutes);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');
    await app.close();
    await prisma.$disconnect();
    logger.info('Server shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await app.listen({ port, host });
    logger.info({ port, host }, 'CryptoRSI v2 API started');
    logger.info(`Health check: http://${host}:${port}/api/health`);
  } catch (err) {
    logger.fatal(err, 'Failed to start server');
    process.exit(1);
  }
}

start();
