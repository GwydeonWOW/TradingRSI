import type { ExchangeEnvironment } from '@cryptorsi/shared';
import { BINANCE_ENVIRONMENTS } from '@cryptorsi/shared';

export interface KlineStreamEvent {
  eventType: string;
  eventTime: number;
  symbol: string;
  kline: {
    startTime: number;
    endTime: number;
    interval: string;
    open: string;
    close: string;
    high: string;
    low: string;
    volume: string;
    isClosed: boolean;
  };
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

export function getKlineStreamUrl(
  environment: ExchangeEnvironment,
  symbol: string,
  interval: string,
): string {
  const config = BINANCE_ENVIRONMENTS[environment];
  return `${config.streamBaseUrl}/${symbol.toLowerCase()}@kline_${interval}`;
}

export function getCombinedStreamUrl(
  environment: ExchangeEnvironment,
  streams: string[],
): string {
  const config = BINANCE_ENVIRONMENTS[environment];
  return `${config.streamBaseUrl}/stream?streams=${streams.join('/')}`;
}
