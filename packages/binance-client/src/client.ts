import type { ExchangeEnvironment } from '@cryptorsi/shared';
import { BINANCE_ENVIRONMENTS } from '@cryptorsi/shared';
import { buildSignedQuery } from './signer.js';

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

function parseKline(raw: (string | number)[]): Kline {
  return {
    openTime: raw[0] as number,
    open: raw[1] as string,
    high: raw[2] as string,
    low: raw[3] as string,
    close: raw[4] as string,
    volume: raw[5] as string,
    closeTime: raw[6] as number,
    quoteVolume: raw[7] as string,
    trades: raw[8] as number,
  };
}

export function createBinanceClient(
  environment: ExchangeEnvironment,
  credentials: BinanceCredentials,
): BinanceClient {
  const config = BINANCE_ENVIRONMENTS[environment];
  if (!config) throw new Error(`Unknown Binance environment: ${environment}`);
  if (environment === 'production' && process.env.ALLOW_LIVE_TRADING !== 'true') {
    throw new Error('Live trading is disabled by hard guard');
  }

  async function publicGet(path: string, params?: Record<string, string>): Promise<unknown> {
    const url = new URL(path, config.restBaseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    const response = await fetch(url.toString());
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Binance API error ${response.status}: ${body}`);
    }
    return response.json();
  }

  async function signedGet(path: string, params: Record<string, string>): Promise<unknown> {
    const queryString = buildSignedQuery(params, credentials.apiSecret);
    const url = `${config.restBaseUrl}${path}?${queryString}`;
    const response = await fetch(url, {
      headers: { 'X-MBX-APIKEY': credentials.apiKey },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Binance API error ${response.status}: ${body}`);
    }
    return response.json();
  }

  async function signedPost(path: string, params: Record<string, string>): Promise<unknown> {
    const queryString = buildSignedQuery(params, credentials.apiSecret);
    const url = `${config.restBaseUrl}${path}?${queryString}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': credentials.apiKey },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Binance API error ${response.status}: ${body}`);
    }
    return response.json();
  }

  return {
    async ping(): Promise<boolean> {
      try {
        await publicGet('/v3/ping');
        return true;
      } catch {
        return false;
      }
    },

    async getTime(): Promise<number> {
      const data = await publicGet('/v3/time') as { serverTime: number };
      return data.serverTime;
    },

    async getKlines(params: KlineParams): Promise<Kline[]> {
      const queryParams: Record<string, string> = {
        symbol: params.symbol,
        interval: params.interval,
      };
      if (params.startTime) queryParams.startTime = params.startTime.toString();
      if (params.endTime) queryParams.endTime = params.endTime.toString();
      if (params.limit) queryParams.limit = params.limit.toString();

      const data = await publicGet('/v3/klines', queryParams) as (string | number)[][];
      return data.map(parseKline);
    },

    async getPrice(symbol: string): Promise<string> {
      const data = await publicGet('/v3/ticker/price', { symbol }) as { price: string };
      return data.price;
    },

    async getAccount(): Promise<AccountInfo> {
      const data = await signedGet('/v3/account', {});
      return data as AccountInfo;
    },

    async testOrder(params: CreateOrderParams): Promise<void> {
      const queryParams: Record<string, string> = {
        symbol: params.symbol,
        side: params.side,
        type: params.type,
      };
      if (params.quoteOrderQty) queryParams.quoteOrderQty = params.quoteOrderQty;
      if (params.quantity) queryParams.quantity = params.quantity;
      if (params.price) queryParams.price = params.price;
      if (params.newClientOrderId) queryParams.newClientOrderId = params.newClientOrderId;
      queryParams.newOrderRespType = params.newOrderRespType ?? 'FULL';
      await signedPost('/v3/order/test', queryParams);
    },

    async createOrder(params: CreateOrderParams): Promise<OrderResponse> {
      const queryParams: Record<string, string> = {
        symbol: params.symbol,
        side: params.side,
        type: params.type,
      };
      if (params.quoteOrderQty) queryParams.quoteOrderQty = params.quoteOrderQty;
      if (params.quantity) queryParams.quantity = params.quantity;
      if (params.price) queryParams.price = params.price;
      if (params.newClientOrderId) queryParams.newClientOrderId = params.newClientOrderId;
      queryParams.newOrderRespType = params.newOrderRespType ?? 'FULL';
      const data = await signedPost('/v3/order', queryParams);
      return data as OrderResponse;
    },

    async getOrder(params: { symbol: string; orderId?: number; clientOrderId?: string }): Promise<OrderResponse> {
      const queryParams: Record<string, string> = { symbol: params.symbol };
      if (params.orderId) queryParams.orderId = params.orderId.toString();
      if (params.clientOrderId) queryParams.origClientOrderId = params.clientOrderId;
      const data = await signedGet('/v3/order', queryParams);
      return data as OrderResponse;
    },
  };
}
