import { Timeframe } from './types';

const FAPI_BASE = 'https://fapi.binance.com/fapi/v1';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

export interface Binance24hTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

let cachedUniverse: { timestamp: number; tickers: Binance24hTicker[]; includeStocks: boolean } = {
  timestamp: 0,
  tickers: [],
  includeStocks: false,
};

// TradFi (stocks/index) symbols from exchangeInfo — cached 1h.
// Binance contractType TRADIFI_PERPETUAL / underlyingType EQUITY = saham & index.
let cachedTradFi: { timestamp: number; symbols: Set<string> } = {
  timestamp: 0,
  symbols: new Set<string>(),
};

async function fetchTradFiSymbols(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedTradFi.symbols.size > 0 && now - cachedTradFi.timestamp < 3600000) {
    return cachedTradFi.symbols;
  }
  try {
    const res = await fetch(`${FAPI_BASE}/exchangeInfo`, {
      headers: DEFAULT_HEADERS,
      cache: 'no-store',
    });
    if (!res.ok) return cachedTradFi.symbols;
    const data = await res.json();
    const symbols = new Set<string>(
      (data.symbols || [])
        .filter((s: any) => s.contractType === 'TRADIFI_PERPETUAL' || s.underlyingType === 'EQUITY')
        .map((s: any) => s.symbol)
    );
    if (symbols.size > 0) cachedTradFi = { timestamp: now, symbols };
    return cachedTradFi.symbols;
  } catch (error) {
    console.error('Failed to fetch exchangeInfo:', error);
    return cachedTradFi.symbols;
  }
}

export async function fetchAllAltcoins(offset: number = 0, limit: number = 150, includeStocks: boolean = false): Promise<{ tickers: Binance24hTicker[]; total: number }> {
  try {
    const now = Date.now();
    // Cache universe list for 5 minutes (300,000ms) for high efficiency
    const stale = now - cachedUniverse.timestamp > 300000;
    const modeChanged = cachedUniverse.includeStocks !== includeStocks;
    if (cachedUniverse.tickers.length === 0 || stale || modeChanged) {
      const res = await fetch(`${FAPI_BASE}/ticker/24hr`, { 
        headers: DEFAULT_HEADERS,
        cache: 'no-store'
      });
      if (!res.ok) {
        console.error(`Binance ticker/24hr HTTP ${res.status}: ${res.statusText}`);
        return { tickers: [], total: 0 };
      }
      const data: Binance24hTicker[] = await res.json();
      if (Array.isArray(data)) {
        let filtered = data
          .filter((item) => item.symbol.endsWith('USDT') && !item.symbol.includes('_') && parseFloat(item.quoteVolume) > 10000)
          .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
        if (!includeStocks) {
          const tradfi = await fetchTradFiSymbols();
          if (tradfi.size > 0) {
            filtered = filtered.filter((item) => !tradfi.has(item.symbol));
          }
        }
        cachedUniverse = { timestamp: now, tickers: filtered, includeStocks };
      }
    }

    const total = cachedUniverse.tickers.length;
    const sliced = cachedUniverse.tickers.slice(offset, offset + limit);
    return { tickers: sliced, total };
  } catch (error) {
    console.error('Failed to fetch altcoin universe:', error);
    return { tickers: [], total: 0 };
  }
}

export async function fetchKlineData(symbol: string, interval: Timeframe, limit: number = 22) {
  try {
    const url = `${FAPI_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { 
      headers: DEFAULT_HEADERS,
      cache: 'no-store' 
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    return null;
  }
}

export async function fetchOpenInterest(symbol: string): Promise<number> {
  try {
    const res = await fetch(`${FAPI_BASE}/openInterest?symbol=${symbol}`, { 
      headers: DEFAULT_HEADERS,
      cache: 'no-store' 
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return parseFloat(data.openInterest || '0');
  } catch (error) {
    return 0;
  }
}
