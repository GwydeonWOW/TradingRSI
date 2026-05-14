import type { FastifyInstance } from 'fastify';
import { prisma } from '../../infrastructure/db/prisma.js';
import { getBotState, setBotState, resetBotState } from './state.js';
import { getEvents, runEvaluationCycle } from './strategyLoop.js';
import { createAuditEvent } from '../audit/helpers.js';

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

    // Run first cycle immediately
    runEvaluationCycle().catch(() => {});

    return { success: true, data: getBotState() };
  });

  // POST /api/bot/stop
  app.post('/api/bot/stop', async () => {
    const state = getBotState();
    if (state.status === 'idle') {
      return { success: false, error: { code: 'NOT_RUNNING', message: 'Bot is not running' } };
    }

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
