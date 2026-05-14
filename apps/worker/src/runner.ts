import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
  level: process.env.LOG_LEVEL ?? 'info',
});

let running = true;

async function main() {
  logger.info('CryptoRSI v2 Worker starting...');
  logger.info(`Environment: ${process.env.NODE_ENV ?? 'development'}`);

  // DB connection placeholder - will use Prisma when DB is available
  logger.info('Worker initialized successfully');

  const intervalMs = 60_000; // 1 minute
  let cycleCount = 0;

  while (running) {
    cycleCount++;
    logger.debug({ cycle: cycleCount }, 'Worker heartbeat');

    // TODO: Phase 2 - Strategy evaluation loop
    // await strategyLoop();

    // TODO: Phase 5 - Reconciliation loop
    // await reconciliationLoop();

    await sleep(intervalMs);
  }

  logger.info('Worker shutdown complete');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal');
  running = false;
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

main().catch((err) => {
  logger.fatal(err, 'Worker crashed');
  process.exit(1);
});
