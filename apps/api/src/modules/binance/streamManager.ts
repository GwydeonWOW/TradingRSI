import { WebSocket } from 'ws';
import { BINANCE_ENVIRONMENTS } from '@cryptorsi/shared';
import { logger } from '../../infrastructure/logger/index.js';
import { getBinanceCredentials } from '../../infrastructure/credentials/index.js';

type BinanceEnv = 'demo' | 'testnet' | 'production';

function getEnv(): BinanceEnv {
  return (process.env.BINANCE_ENV ?? 'demo') as BinanceEnv;
}

interface StreamState {
  klineWs: WebSocket | null;
  userWs: WebSocket | null;
  listenKey: string | null;
  listenKeyCreatedAt: number | null;
  subscriptions: string[];
  klineConnected: boolean;
  userStreamConnected: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  listenKeyKeepaliveTimer: ReturnType<typeof setInterval> | null;
}

const state: StreamState = {
  klineWs: null,
  userWs: null,
  listenKey: null,
  listenKeyCreatedAt: null,
  subscriptions: [],
  klineConnected: false,
  userStreamConnected: false,
  reconnectTimer: null,
  listenKeyKeepaliveTimer: null,
};

export function getStreamStatus() {
  return {
    klineConnected: state.klineConnected,
    userStreamConnected: state.userStreamConnected,
    listenKeyAge: state.listenKeyCreatedAt ? Date.now() - state.listenKeyCreatedAt : null,
    subscriptionsCount: state.subscriptions.length,
  };
}

export async function startStreams(symbols: string[], intervals: string[]): Promise<void> {
  const env = getEnv();
  const envConfig = BINANCE_ENVIRONMENTS[env];

  // Stop any existing connections first
  await stopStreams();

  // Start kline stream
  const streams = symbols.flatMap((symbol) =>
    intervals.map((interval) => `${symbol.toLowerCase()}@kline_${interval}`),
  );
  state.subscriptions = streams;

  if (streams.length > 0) {
    const streamPath = streams.length === 1 ? streams[0] : `streams/${streams.map((s) => s).join('/')}`;
    const klineUrl = `${envConfig.streamBaseUrl}/${streamPath}`;

    logger.info({ klineUrl, streamCount: streams.length }, 'Connecting to Binance kline stream');

    state.klineWs = new WebSocket(klineUrl);

    state.klineWs.on('open', () => {
      state.klineConnected = true;
      logger.info('Kline stream connected');
    });

    state.klineWs.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.e === 'kline') {
          logger.debug({
            symbol: msg.s,
            interval: msg.k?.i,
            close: msg.k?.c,
            isClosed: msg.k?.x,
          }, 'Kline update');
        }
      } catch {
        // Ignore parse errors
      }
    });

    state.klineWs.on('close', () => {
      state.klineConnected = false;
      logger.info('Kline stream disconnected');
    });

    state.klineWs.on('error', (err: Error) => {
      state.klineConnected = false;
      logger.error({ err }, 'Kline stream error');
    });
  }

  // Start user data stream (best-effort — not all environments support it)
  const creds = await getBinanceCredentials(env);
  if (creds) {
    try {
      const listenKeyRes = await fetch(`${envConfig.restBaseUrl}/v3/userDataStream`, {
        method: 'POST',
        headers: { 'X-MBX-APIKEY': creds.apiKey },
      });
      if (listenKeyRes.ok) {
        const { listenKey } = (await listenKeyRes.json()) as { listenKey: string };
        state.listenKey = listenKey;
        state.listenKeyCreatedAt = Date.now();

        const userWsUrl = `${envConfig.streamBaseUrl}/${listenKey}`;
        logger.info('Connecting to Binance user data stream');

        state.userWs = new WebSocket(userWsUrl);

        state.userWs.on('open', () => {
          state.userStreamConnected = true;
          logger.info('User data stream connected');
        });

        state.userWs.on('message', (data: Buffer) => {
          try {
            const msg = JSON.parse(data.toString());
            logger.debug({ eventType: msg.e }, 'User stream event');
          } catch {
            // Ignore
          }
        });

        state.userWs.on('close', () => {
          state.userStreamConnected = false;
          logger.info('User data stream disconnected');
        });

        state.userWs.on('error', (err: Error) => {
          state.userStreamConnected = false;
          logger.error({ err }, 'User data stream error');
        });

        // Keep listen key alive every 30 minutes
        state.listenKeyKeepaliveTimer = setInterval(async () => {
          if (!state.listenKey) return;
          try {
            await fetch(`${envConfig.restBaseUrl}/v3/userDataStream?listenKey=${state.listenKey}`, {
              method: 'PUT',
              headers: { 'X-MBX-APIKEY': creds.apiKey },
            });
            logger.debug('Listen key keepalive sent');
          } catch (err) {
            logger.error({ err }, 'Listen key keepalive failed');
          }
        }, 30 * 60 * 1000);
      } else {
        logger.warn({ status: listenKeyRes.status }, 'User data stream not available (listen key creation failed) — kline stream active');
      }
    } catch (err) {
      logger.warn({ err }, 'User data stream not available — kline stream active');
    }
  }
}

export async function stopStreams(): Promise<void> {
  // Clear timers
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  if (state.listenKeyKeepaliveTimer) {
    clearInterval(state.listenKeyKeepaliveTimer);
    state.listenKeyKeepaliveTimer = null;
  }

  // Close kline WebSocket
  if (state.klineWs) {
    state.klineWs.removeAllListeners();
    if (state.klineWs.readyState === WebSocket.OPEN || state.klineWs.readyState === WebSocket.CONNECTING) {
      state.klineWs.close();
    }
    state.klineWs = null;
  }

  // Close user data WebSocket
  if (state.userWs) {
    state.userWs.removeAllListeners();
    if (state.userWs.readyState === WebSocket.OPEN || state.userWs.readyState === WebSocket.CONNECTING) {
      state.userWs.close();
    }
    state.userWs = null;
  }

  // Close listen key
  if (state.listenKey) {
    const env = getEnv();
    const envConfig = BINANCE_ENVIRONMENTS[env];
    const creds = await getBinanceCredentials(env);
    if (creds) {
      try {
        await fetch(`${envConfig.restBaseUrl}/v3/userDataStream?listenKey=${state.listenKey}`, {
          method: 'DELETE',
          headers: { 'X-MBX-APIKEY': creds.apiKey },
        });
      } catch {
        // Best effort
      }
    }
    state.listenKey = null;
    state.listenKeyCreatedAt = null;
  }

  state.klineConnected = false;
  state.userStreamConnected = false;
  state.subscriptions = [];
}
