import type { FastifyInstance } from 'fastify';
import { prisma } from '../../infrastructure/db/prisma.js';
import { getBotState, setBotState, resetBotState } from './state.js';
import { getEvents, runEvaluationCycle } from './strategyLoop.js';
import { createAuditEvent } from '../audit/helpers.js';
import { BinanceStreamManager, processExecutionReport } from '../../infrastructure/websocket/index.js';
import { BINANCE_ENVIRONMENTS } from '@cryptorsi/shared';
import { logger } from '../../infrastructure/logger/index.js';
import { getBinanceCredentials } from '../../infrastructure/credentials/index.js';

// Singleton stream manager
let streamManager: BinanceStreamManager | null = null;
let cycleTimer: NodeJS.Timeout | null = null;
const CYCLE_INTERVAL_MS = 60_000;

function startCycleLoop() {
  stopCycleLoop();
  cycleTimer = setInterval(() => {
    const state = getBotState();
    if (state.status === 'running') {
      runEvaluationCycle().catch((err) => {
        logger.error({ err }, 'Scheduled evaluation cycle failed');
      });
    }
  }, CYCLE_INTERVAL_MS);
}

function stopCycleLoop() {
  if (cycleTimer) {
    clearInterval(cycleTimer);
    cycleTimer = null;
  }
}

export async function botRoutes(app: FastifyInstance) {
  // GET /api/bot/status
  app.get('/api/bot/status', async () => {
    const state = getBotState();
    let strategyName = null;
    if (state.activeStrategyId) {
      const strategy = await prisma.strategy.findUnique({
        where: { id: state.activeStrategyId },
        select: { name: true },
      });
      strategyName = strategy?.name ?? null;
    }
    return { success: true, data: { ...state, strategyName } };
  });

  // GET /api/bot/events
  app.get('/api/bot/events', async (request) => {
    const limit = Number((request.query as { limit?: string }).limit) || 50;
    return { success: true, data: getEvents(limit) };
  });

  // GET /api/bot/stream-status
  app.get('/api/bot/stream-status', async () => {
    if (!streamManager) {
      return {
        success: true,
        data: {
          klineConnected: false,
          userConnected: false,
          listenKeyAge: null,
          subscriptionsCount: 0,
          active: false,
        },
      };
    }
    return { success: true, data: { ...streamManager.getStatus(), active: true } };
  });

  // POST /api/bot/start-streams
  app.post('/api/bot/start-streams', async () => {
    const state = getBotState();
    if (!state.activeStrategyId) {
      return { success: false, error: { code: 'NO_STRATEGY', message: 'No active strategy' } };
    }

    const strategy = await prisma.strategy.findUnique({
      where: { id: state.activeStrategyId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    if (!strategy || strategy.versions.length === 0) {
      return { success: false, error: { code: 'INVALID_STRATEGY', message: 'Strategy not found' } };
    }

    const creds = await getBinanceCredentials();
    if (!creds) {
      return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Binance credentials not configured. Go to Settings.' } };
    }

    const env = (process.env.BINANCE_ENV ?? 'demo') as 'demo' | 'testnet' | 'production';
    const config = strategy.versions[0]!.config as { symbols: string[]; timeframes: string[] };

    // Stop existing manager if any
    if (streamManager) {
      await streamManager.stop();
    }

    streamManager = new BinanceStreamManager(env, creds.apiKey, creds.apiSecret);
    streamManager.setExecutionReportHandler(processExecutionReport);

    // Subscribe to kline streams for all symbol/timeframe combinations
    for (const symbol of config.symbols) {
      for (const timeframe of config.timeframes) {
        streamManager.subscribeKline(symbol, timeframe, (update) => {
          logger.debug({
            symbol: update.symbol,
            interval: update.interval,
            close: update.close,
            isClosed: update.isClosed,
          }, 'Kline update');
        });
      }
    }

    await streamManager.start();

    await createAuditEvent({
      actorType: 'user',
      eventType: 'streams_started',
      entityType: 'bot',
      payload: {
        strategyId: state.activeStrategyId,
        symbols: config.symbols,
        timeframes: config.timeframes,
        environment: env,
      },
    });

    return { success: true, data: streamManager.getStatus() };
  });

  // POST /api/bot/stop-streams
  app.post('/api/bot/stop-streams', async () => {
    if (streamManager) {
      await streamManager.stop();
      streamManager = null;
    }

    await createAuditEvent({
      actorType: 'user',
      eventType: 'streams_stopped',
      entityType: 'bot',
      payload: {},
    });

    return { success: true, data: { message: 'Streams stopped' } };
  });

  // POST /api/bot/start
  app.post('/api/bot/start', async (request) => {
    const state = getBotState();
    if (state.status === 'running') {
      return { success: false, error: { code: 'ALREADY_RUNNING', message: 'Bot is already running' } };
    }

    const { strategyId } = request.body as { strategyId?: string };
    if (!strategyId) {
      return { success: false, error: { code: 'MISSING_STRATEGY', message: 'strategyId is required' } };
    }

    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    if (!strategy || strategy.status !== 'active') {
      return { success: false, error: { code: 'INVALID_STRATEGY', message: 'Strategy not found or not active' } };
    }

    setBotState({
      status: 'running',
      activeStrategyId: strategyId,
      activeStrategyVersionId: strategy.versions[0]?.id ?? null,
      startedAt: Date.now(),
      cycleCount: 0,
      errorMessage: null,
    });

    await createAuditEvent({
      actorType: 'user',
      eventType: 'bot_started',
      entityType: 'bot',
      payload: { strategyId, strategyName: strategy.name },
    });

    // Start WebSocket streams for non-simulation modes
    if (strategy.mode !== 'simulation') {
      const creds = await getBinanceCredentials();
      if (creds) {
        const env = (process.env.BINANCE_ENV ?? 'demo') as 'demo' | 'testnet' | 'production';
        const config = strategy.versions[0]!.config as { symbols: string[]; timeframes: string[] };

        // Stop existing manager if any
        if (streamManager) {
          await streamManager.stop();
        }

        streamManager = new BinanceStreamManager(env, creds.apiKey, creds.apiSecret);
        streamManager.setExecutionReportHandler(processExecutionReport);

        for (const symbol of config.symbols) {
          for (const timeframe of config.timeframes) {
            streamManager.subscribeKline(symbol, timeframe, (update) => {
              logger.debug({
                symbol: update.symbol,
                interval: update.interval,
                close: update.close,
                isClosed: update.isClosed,
              }, 'Kline update');
            });
          }
        }

        await streamManager.start().catch((err) => {
          logger.error({ err }, 'Failed to start WebSocket streams');
        });
      }
    }

    // Run first cycle immediately, then every CYCLE_INTERVAL_MS
    runEvaluationCycle().catch(() => {});
    startCycleLoop();

    return { success: true, data: getBotState() };
  });

  // POST /api/bot/stop
  app.post('/api/bot/stop', async () => {
    const state = getBotState();
    if (state.status === 'idle') {
      return { success: false, error: { code: 'NOT_RUNNING', message: 'Bot is not running' } };
    }

    // Stop streams
    if (streamManager) {
      await streamManager.stop();
      streamManager = null;
    }

    stopCycleLoop();
    resetBotState();

    await createAuditEvent({
      actorType: 'user',
      eventType: 'bot_stopped',
      entityType: 'bot',
      payload: {},
    });

    return { success: true, data: getBotState() };
  });

  // POST /api/bot/evaluate-now
  app.post('/api/bot/evaluate-now', async () => {
    const state = getBotState();
    if (state.status !== 'running') {
      return { success: false, error: { code: 'NOT_RUNNING', message: 'Bot must be running to evaluate' } };
    }

    await runEvaluationCycle();
    return { success: true, data: getBotState() };
  });

  // POST /api/bot/kill-switch
  app.post('/api/bot/kill-switch', async () => {
    // Pause all strategies
    await prisma.strategy.updateMany({
      where: { status: 'active' },
      data: { status: 'paused' },
    });

    // Stop streams
    if (streamManager) {
      await streamManager.stop();
      streamManager = null;
    }

    stopCycleLoop();

    resetBotState();

    await createAuditEvent({
      actorType: 'user',
      eventType: 'kill_switch_activated',
      entityType: 'bot',
      payload: { timestamp: Date.now() },
    });

    return { success: true, data: { message: 'Kill switch activated. All strategies paused, bot stopped.' } };
  });
}
