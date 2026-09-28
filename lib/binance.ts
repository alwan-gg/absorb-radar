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
  quoteVolume: string; // 24h volume in USDT
}

let cachedUniverse: { timestamp: number; tickers: Binance24hTicker[] } = {
  timestamp: 0,
  tickers: [],
};

export async function fetchAllAltcoins(offset: number = 0, limit: number = 150): Promise<{ tickers: Binance24hTicker[]; total: number }> {
  try {
    const now = Date.now();
    // Cache the 24h tickers list for 60 seconds to prevent hammering the ticker endpoint
    if (cachedUniverse.tickers.length === 0 || now - cachedUniverse.timestamp > 60000) {
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
        const filtered = data
          .filter((item) => item.symbol.endsWith('USDT') && !item.symbol.includes('_') && parseFloat(item.quoteVolume) > 10000)
          .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
        cachedUniverse = { timestamp: now, tickers: filtered };
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
