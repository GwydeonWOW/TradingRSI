import { WebSocket } from 'ws';
import { BINANCE_ENVIRONMENTS } from '@cryptorsi/shared';
import type { ExchangeEnvironment } from '@cryptorsi/shared';
import { logger } from '../logger/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KlineUpdate {
  symbol: string;
  interval: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
  time: number;
}

export interface ExecutionReportEvent {
  eventType: string;
  eventTime: number;
  symbol: string;
  clientOrderId: string;
  side: string;
  orderType: string;
  timeInForce: string;
  orderStatus: string;
  orderRejectReason: string;
  orderId: number;
  price: string;
  origQty: string;
  executedQty: string;
  cumulativeQuoteQty: string;
  lastExecutedPrice: string;
  lastExecutedQty: string;
  commission: string;
  commissionAsset: string;
}

interface KlineStreamMessage {
  stream: string;
  data: {
    e: string;
    E: number;
    s: string;
    k: {
      t: number;
      T: number;
      s: string;
      i: string;
      o: string;
      c: string;
      h: string;
      l: string;
      v: string;
      x: boolean;
    };
  };
}

interface OutboundAccountPositionEvent {
  eventType: string;
  eventTime: number;
  balances: Array<{ a: string; f: string; l: string }>;
}

// ---------------------------------------------------------------------------
// BinanceStreamManager
// ---------------------------------------------------------------------------

export class BinanceStreamManager {
  private klineWs: WebSocket | null = null;
  private userWs: WebSocket | null = null;
  private listenKey: string | null = null;
  private listenKeyCreatedAt: number | null = null;
  private listenKeyInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private environment: ExchangeEnvironment;
  private apiKey: string;
  private apiSecret: string;
  private subscriptions: Map<string, (update: KlineUpdate) => void> = new Map();
  private onExecutionReport: ((report: ExecutionReportEvent) => Promise<void>) | null = null;
  private running = false;

  constructor(environment: ExchangeEnvironment, apiKey: string, apiSecret: string) {
    this.environment = environment;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.reconnectAttempts = 0;

    if (this.subscriptions.size > 0) {
      this.connectKlineStream();
    }

    await this.connectUserStream();
    logger.info({ environment: this.environment }, 'BinanceStreamManager started');
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.listenKeyInterval) {
      clearInterval(this.listenKeyInterval);
      this.listenKeyInterval = null;
    }

    if (this.klineWs) {
      this.klineWs.removeAllListeners();
      this.klineWs.close();
      this.klineWs = null;
    }

    if (this.userWs) {
      this.userWs.removeAllListeners();
      this.userWs.close();
      this.userWs = null;
    }

    this.listenKey = null;
    this.listenKeyCreatedAt = null;
    this.subscriptions.clear();
    this.reconnectAttempts = 0;

    logger.info('BinanceStreamManager stopped');
  }

  subscribeKline(symbol: string, interval: string, callback: (update: KlineUpdate) => void): void {
    const key = `${symbol.toLowerCase()}@kline_${interval}`;
    this.subscriptions.set(key, callback);

    // Reconnect kline stream if already running
    if (this.running) {
      this.connectKlineStream();
    }
  }

  setExecutionReportHandler(handler: (report: ExecutionReportEvent) => Promise<void>): void {
    this.onExecutionReport = handler;
  }

  getStatus(): {
    klineConnected: boolean;
    userConnected: boolean;
    listenKeyAge: number | null;
    subscriptionsCount: number;
  } {
    return {
      klineConnected: this.klineWs?.readyState === WebSocket.OPEN,
      userConnected: this.userWs?.readyState === WebSocket.OPEN,
      listenKeyAge: this.listenKeyCreatedAt ? Date.now() - this.listenKeyCreatedAt : null,
      subscriptionsCount: this.subscriptions.size,
    };
  }

  // ---------------------------------------------------------------------------
  // Private: Kline stream
  // ---------------------------------------------------------------------------

  private buildKlineStreamUrl(): string {
    const config = BINANCE_ENVIRONMENTS[this.environment];
    const streams = Array.from(this.subscriptions.keys());
    if (streams.length === 0) return '';
    if (streams.length === 1) {
      return `${config.streamBaseUrl}/${streams[0]}`;
    }
    return `${config.streamBaseUrl}/stream?streams=${streams.join('/')}`;
  }

  private connectKlineStream(): void {
    if (this.klineWs) {
      this.klineWs.removeAllListeners();
      this.klineWs.close();
      this.klineWs = null;
    }

    const url = this.buildKlineStreamUrl();
    if (!url) return;

    logger.info({ url }, 'Connecting to kline stream');

    const ws = new WebSocket(url);

    ws.on('open', () => {
      this.reconnectAttempts = 0;
      logger.info('Kline stream connected');
    });

    ws.on('message', (raw: Buffer) => {
      try {
        this.handleKlineMessage(JSON.parse(raw.toString()));
      } catch (err) {
        logger.error({ err }, 'Failed to parse kline message');
      }
    });

    ws.on('error', (err: Error) => {
      logger.error({ err }, 'Kline stream error');
    });

    ws.on('close', (code: number, reason: Buffer) => {
      logger.warn({ code, reason: reason.toString() }, 'Kline stream closed');
      if (this.running) {
        this.scheduleReconnect(() => this.connectKlineStream());
      }
    });

    this.klineWs = ws;
  }

  private handleKlineMessage(data: unknown): void {
    // Combined stream format wraps data in { stream, data }
    const msg = data as KlineStreamMessage;
    const payload = msg.data ?? data;
    const k = (payload as KlineStreamMessage['data']).k;
    if (!k) return;

    const update: KlineUpdate = {
      symbol: (payload as KlineStreamMessage['data']).s,
      interval: k.i,
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
      volume: parseFloat(k.v),
      isClosed: k.x,
      time: k.t,
    };

    const key = `${update.symbol.toLowerCase()}@kline_${update.interval}`;
    const callback = this.subscriptions.get(key);
    if (callback) {
      callback(update);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: User Data Stream
  // ---------------------------------------------------------------------------

  private async connectUserStream(): Promise<void> {
    try {
      await this.createListenKey();
      if (!this.listenKey) return;

      this.openUserStreamWebSocket();
      this.startListenKeyKeepalive();
    } catch (err) {
      logger.error({ err }, 'Failed to connect user stream');
      if (this.running) {
        this.scheduleReconnect(() => this.connectUserStream());
      }
    }
  }

  private async createListenKey(): Promise<void> {
    const config = BINANCE_ENVIRONMENTS[this.environment];
    const url = `${config.restBaseUrl}/v3/userDataStream`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to create listen key: ${response.status} ${body}`);
    }
    const data = await response.json() as { listenKey: string };
    this.listenKey = data.listenKey;
    this.listenKeyCreatedAt = Date.now();
    logger.info({ listenKey: this.listenKey }, 'Listen key created');
  }

  private async keepAliveListenKey(): Promise<void> {
    if (!this.listenKey) return;
    const config = BINANCE_ENVIRONMENTS[this.environment];
    const url = `${config.restBaseUrl}/v3/userDataStream?listenKey=${this.listenKey}`;
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'X-MBX-APIKEY': this.apiKey },
      });
      if (!response.ok) {
        const body = await response.text();
        logger.error({ status: response.status, body }, 'Failed to keep-alive listen key');
      }
    } catch (err) {
      logger.error({ err }, 'Failed to keep-alive listen key');
    }
  }

  private startListenKeyKeepalive(): void {
    if (this.listenKeyInterval) clearInterval(this.listenKeyInterval);
    // Keep alive every 30 minutes
    this.listenKeyInterval = setInterval(() => {
      this.keepAliveListenKey().catch((err) => {
        logger.error({ err }, 'Listen key keepalive failed');
      });
    }, 30 * 60 * 1000);
  }

  private openUserStreamWebSocket(): void {
    if (!this.listenKey) return;
    if (this.userWs) {
      this.userWs.removeAllListeners();
      this.userWs.close();
    }

    const config = BINANCE_ENVIRONMENTS[this.environment];
    const url = `${config.streamBaseUrl}/${this.listenKey}`;
    logger.info({ url: url.replace(this.listenKey, '***') }, 'Connecting to user data stream');

    const ws = new WebSocket(url);

    ws.on('open', () => {
      this.reconnectAttempts = 0;
      logger.info('User data stream connected');
    });

    ws.on('message', (raw: Buffer) => {
      try {
        this.handleUserMessage(JSON.parse(raw.toString()));
      } catch (err) {
        logger.error({ err }, 'Failed to parse user stream message');
      }
    });

    ws.on('error', (err: Error) => {
      logger.error({ err }, 'User data stream error');
    });

    ws.on('close', (code: number, reason: Buffer) => {
      logger.warn({ code, reason: reason.toString() }, 'User data stream closed');
      if (this.running) {
        this.scheduleReconnect(() => this.connectUserStream());
      }
    });

    this.userWs = ws;
  }

  private handleUserMessage(data: unknown): void {
    const event = data as { e: string };
    if (!event.e) return;

    switch (event.e) {
      case 'executionReport': {
        const report: ExecutionReportEvent = {
          eventType: event.e,
          eventTime: (data as { E: number }).E,
          symbol: (data as { s: string }).s,
          clientOrderId: (data as { c: string }).c,
          side: (data as { S: string }).S,
          orderType: (data as { o: string }).o,
          timeInForce: (data as { f: string }).f,
          orderStatus: (data as { X: string }).X,
          orderRejectReason: (data as { r: string }).r,
          orderId: (data as { i: number }).i,
          price: (data as { P: string }).P,
          origQty: (data as { q: string }).q,
          executedQty: (data as { z: string }).z,
          cumulativeQuoteQty: (data as { Z: string }).Z,
          lastExecutedPrice: (data as { L: string }).L,
          lastExecutedQty: (data as { l: string }).l,
          commission: (data as { n: string }).n,
          commissionAsset: (data as { N: string }).N,
        };

        logger.info({
          symbol: report.symbol,
          orderId: report.orderId,
          status: report.orderStatus,
          side: report.side,
        }, 'executionReport received');

        if (this.onExecutionReport) {
          this.onExecutionReport(report).catch((err: unknown) => {
            logger.error({ err }, 'Execution report handler failed');
          });
        }
        break;
      }
      case 'outboundAccountPosition': {
        const acct = data as unknown as OutboundAccountPositionEvent;
        logger.info({ balancesCount: acct.balances?.length }, 'outboundAccountPosition received');
        break;
      }
      default:
        logger.debug({ eventType: event.e }, 'Unhandled user stream event');
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Reconnection with exponential backoff
  // ---------------------------------------------------------------------------

  private scheduleReconnect(connectFn: () => void | Promise<void>): void {
    if (!this.running) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    logger.info({ delay, attempt: this.reconnectAttempts }, 'Scheduling reconnect');
    setTimeout(async () => {
      if (this.running) {
        try {
          await connectFn();
        } catch (err) {
          logger.error({ err }, 'Reconnect failed');
        }
      }
    }, delay);
  }
}
