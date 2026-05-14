import type { ExchangeEnvironment } from '@cryptorsi/shared';
import { BINANCE_ENVIRONMENTS } from '@cryptorsi/shared';

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface KlineParams {
  symbol: string;
  interval: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export interface Kline {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteVolume: string;
  trades: number;
}

export interface CreateOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quoteOrderQty?: string;
  quantity?: string;
  price?: string;
  newOrderRespType?: 'ACK' | 'RESULT' | 'FULL';
  newClientOrderId?: string;
}

export interface OrderResponse {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cumulativeQuoteQty: string;
  status: string;
  type: string;
  side: string;
  fills?: Array<{
    price: string;
    qty: string;
    commission: string;
    commissionAsset: string;
  }>;
}

export interface AccountInfo {
  balances: Array<{
    asset: string;
    free: string;
    locked: string;
  }>;
}

export interface BinanceClient {
  ping(): Promise<boolean>;
  getTime(): Promise<number>;
  getKlines(params: KlineParams): Promise<Kline[]>;
  getPrice(symbol: string): Promise<string>;
  getAccount(): Promise<AccountInfo>;
  testOrder(params: CreateOrderParams): Promise<void>;
  createOrder(params: CreateOrderParams): Promise<OrderResponse>;
  getOrder(params: { symbol: string; orderId?: number; clientOrderId?: string }): Promise<OrderResponse>;
}

export function createBinanceClient(
  environment: ExchangeEnvironment,
  credentials: BinanceCredentials,
): BinanceClient {
  const config = BINANCE_ENVIRONMENTS[environment];

  if (!config) {
    throw new Error(`Unknown Binance environment: ${environment}`);
  }

  if (environment === 'production' && process.env.ALLOW_LIVE_TRADING !== 'true') {
    throw new Error('Live trading is disabled by hard guard');
  }

  // Placeholder - will be implemented in Phase 3
  void credentials;
  void config;
  throw new Error('BinanceClient not implemented yet - coming in Phase 3');
}
