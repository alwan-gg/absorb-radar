import { Timeframe } from './types';

const FAPI_BASE = 'https://fapi.binance.com/fapi/v1';

export interface Binance24hTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string; // 24h volume in USDT
}

export async function fetchTopAltcoins(limit: number = 60): Promise<Binance24hTicker[]> {
  try {
    const res = await fetch(`${FAPI_BASE}/ticker/24hr`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`Binance API error: ${res.statusText}`);
    const data: Binance24hTicker[] = await res.json();
    
    // Filter only USDT perpetuals and exclude BTC & ETH if we want pure Altcoins, or keep them as benchmark
    return data
      .filter((item) => item.symbol.endsWith('USDT') && !item.symbol.includes('_'))
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, limit);
  } catch (error) {
    console.error('Failed to fetch 24h ticker:', error);
    return [];
  }
}

export async function fetchKlineData(symbol: string, interval: Timeframe, limit: number = 30) {
  try {
    const url = `${FAPI_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    return null;
  }
}

export async function fetchOpenInterest(symbol: string): Promise<number> {
  try {
    const res = await fetch(`${FAPI_BASE}/openInterest?symbol=${symbol}`, { cache: 'no-store' });
    if (!res.ok) return 0;
    const data = await res.json();
    return parseFloat(data.openInterest || '0');
  } catch (error) {
    return 0;
  }
}
