import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'cryptorsi_symbols';
const LIQUIDITY_SYMBOLS_KEY = 'cryptorsi_liquidity_symbols';

const DEFAULT_SYMBOLS: string[] = [];
const ALL_AVAILABLE = [
  'BTCUSDC', 'ETHUSDC', 'BNBUSDC', 'SOLUSDC', 'XRPUSDC', 'ADAUSDC',
  'DOGEUSDC', 'DOTUSDC', 'AVAXUSDC', 'LINKUSDC', 'UNIUSDC',
  'ATOMUSDC', 'LTCUSDC', 'NEARUSDC', 'ARBUSDC', 'OPUSDC', 'APTUSDC',
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT',
  'DOGEUSDT', 'DOTUSDT', 'AVAXUSDT', 'LINKUSDT', 'UNIUSDT',
  'ATOMUSDT', 'LTCUSDT', 'NEARUSDT', 'ARBUSDT', 'OPUSDT', 'APTUSDT',
];

const LIQUIDITY_SYMBOLS = ['BTCUSDC', 'ETHUSDC', 'SOLUSDC', 'BNBUSDC'];

export function getSymbols(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_SYMBOLS;
}

export function getLiquiditySymbols(): string[] {
  return LIQUIDITY_SYMBOLS;
}

export function getAllAvailableSymbols(): string[] {
  return ALL_AVAILABLE;
}

export function saveSymbols(symbols: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
}

export function useSymbols() {
  const [symbols, setSymbols] = useState<string[]>(getSymbols);

  useEffect(() => {
    saveSymbols(symbols);
  }, [symbols]);

  const addSymbol = useCallback((symbol: string) => {
    setSymbols((prev) => {
      const upper = symbol.toUpperCase().trim();
      if (prev.includes(upper) || !upper) return prev;
      return [...prev, upper];
    });
  }, []);

  const removeSymbol = useCallback((symbol: string) => {
    setSymbols((prev) => prev.filter((s) => s !== symbol));
  }, []);

  const setAll = useCallback((symbols: string[]) => {
    setSymbols(symbols.map((s) => s.toUpperCase().trim()).filter(Boolean));
  }, []);

  return { symbols, addSymbol, removeSymbol, setAll };
}
