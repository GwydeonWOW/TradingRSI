import type { ExchangeEnvironment, BinanceEnvironmentConfig } from '../types/index.js';

export const BINANCE_ENVIRONMENTS: Record<ExchangeEnvironment, BinanceEnvironmentConfig> = {
  demo: {
    restBaseUrl: 'https://demo-api.binance.com/api',
    streamBaseUrl: 'wss://demo-stream.binance.com/ws',
    wsApiBaseUrl: 'wss://demo-ws-api.binance.com/ws-api/v3',
  },
  testnet: {
    restBaseUrl: 'https://testnet.binance.vision/api',
    streamBaseUrl: 'wss://stream.testnet.binance.vision/ws',
    wsApiBaseUrl: 'wss://ws-api.testnet.binance.vision/ws-api/v3',
  },
  production: {
    restBaseUrl: 'https://api.binance.com/api',
    streamBaseUrl: 'wss://stream.binance.com/ws',
    wsApiBaseUrl: 'wss://ws-api.binance.com/ws-api/v3',
  },
};

export const APP_VERSION = '0.1.0';
