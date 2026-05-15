import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { logger } from './infrastructure/logger/index.js';
import { healthRoutes } from './modules/health/routes.js';
import { authRoutes, verifyToken } from './modules/auth/routes.js';
import { strategyRoutes } from './modules/strategies/routes.js';
import { botRoutes } from './modules/bot/routes.js';
import { binanceRoutes } from './modules/binance/routes.js';
import { positionRoutes } from './modules/positions/routes.js';
import { orderRoutes } from './modules/orders/routes.js';
import { backtestRoutes } from './modules/backtests/routes.js';
import { settingsRoutes } from './modules/settings/routes.js';
import { liquidityRoutes } from './modules/liquidity/routes.js';
import { prisma } from './infrastructure/db/prisma.js';

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';

// Public paths that don't require authentication
const PUBLIC_PATHS = [
  '/api/health',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/needs-setup',
];

function validateSecrets() {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret === 'change_me_in_production' || jwtSecret === 'dev-secret-change-in-production') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET must be set to a strong random value in production');
    }
    logger.warn('Using default JWT secret — not safe for production');
  }

  const encKey = process.env.APP_ENCRYPTION_KEY;
  if (!encKey || encKey.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: APP_ENCRYPTION_KEY must be at least 16 characters in production');
    }
    logger.warn('APP_ENCRYPTION_KEY not set — 2FA and credential storage will fail');
  }
}

async function start() {
  validateSecrets();

  const app = Fastify({ logger: false });

  // Security headers
  await app.register(helmet);

  // CORS
  await app.register(cors, {
    origin: process.env.APP_URL?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // JWT plugin (registered by authRoutes, but we need it for the hook)
  await app.register(import('@fastify/jwt'), {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    sign: { expiresIn: '7d' },
  });

  // Global authentication hook
  app.addHook('onRequest', async (request, reply) => {
    // Skip public paths
    if (PUBLIC_PATHS.some((p) => request.url.startsWith(p))) return;

    const auth = verifyToken(request);
    if (!auth) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    // Enforce MFA for users who have it enabled
    if (!auth.mfaVerified) {
      const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { mfaEnabled: true } });
      if (user?.mfaEnabled) {
        return reply.code(403).send({ success: false, error: { code: 'MFA_REQUIRED', message: '2FA verification required' } });
      }
    }

    (request as any).auth = auth;
  });

  // Routes
  await app.register(authRoutes);
  await app.register(healthRoutes);
  await app.register(strategyRoutes);
  await app.register(botRoutes);
  await app.register(binanceRoutes);
  await app.register(positionRoutes);
  await app.register(orderRoutes);
  await app.register(backtestRoutes);
  await app.register(settingsRoutes);
  await app.register(liquidityRoutes);

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
    logger.info({ port, host }, 'CryptoRSI API started');
    logger.info(`Health check: http://${host}:${port}/api/health`);
  } catch (err) {
    logger.fatal(err, 'Failed to start server');
    process.exit(1);
  }
}

start();
