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

export async function fetchTopAltcoins(limit: number = 180): Promise<Binance24hTicker[]> {
  try {
    const res = await fetch(`${FAPI_BASE}/ticker/24hr`, { 
      headers: DEFAULT_HEADERS,
      cache: 'no-store'
    });
    if (!res.ok) {
      console.error(`Binance ticker/24hr HTTP ${res.status}: ${res.statusText}`);
      return [];
    }
    const data: Binance24hTicker[] = await res.json();
    
    if (!Array.isArray(data)) return [];

    return data
      .filter((item) => item.symbol.endsWith('USDT') && !item.symbol.includes('_'))
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, limit);
  } catch (error) {
    console.error('Failed to fetch 24h ticker:', error);
    return [];
  }
}

export async function fetchKlineData(symbol: string, interval: Timeframe, limit: number = 25) {
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
