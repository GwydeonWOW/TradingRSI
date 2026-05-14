import pino from 'pino';
import { reconciliationLoop } from './jobs/reconciliationLoop.js';

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

  logger.info('Worker initialized successfully');

  const reconciliationIntervalMs = 5 * 60_000; // 5 minutes
  let cycleCount = 0;

  while (running) {
    cycleCount++;
    logger.debug({ cycle: cycleCount }, 'Worker heartbeat');

    // Run reconciliation every 5 minutes
    await reconciliationLoop();

    await sleep(reconciliationIntervalMs);
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
