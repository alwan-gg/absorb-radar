import { NextRequest, NextResponse } from 'next/server';
import { fetchAllAltcoins } from '@/lib/binance';
import { processSymbol } from '@/lib/detector';
import { CoinSignal } from '@/lib/types';

// Chunk cache store (keyed by `${offset}-${limit}`)
const chunkCache = new Map<string, { timestamp: number; signals: CoinSignal[]; total: number }>();
// 3 minutes (180,000ms) cache TTL - optimum for 5m closed candles & zero resource waste
const CACHE_TTL_MS = 180000;

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '150', 10), 200);
  const forceFresh = searchParams.get('fresh') === '1' || searchParams.get('fresh') === 'true';
  const includeStocks = searchParams.get('stocks') === '1' || searchParams.get('stocks') === 'true';
  const cacheKey = `${offset}-${limit}-stocks${includeStocks ? '1' : '0'}`;
  const now = Date.now();

  const cached = chunkCache.get(cacheKey);
  if (!forceFresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({
      lastUpdated: cached.timestamp,
      cached: true,
      cacheAgeSec: Math.round((now - cached.timestamp) / 1000),
      offset,
      limit,
      totalAvailable: cached.total,
      totalScanned: cached.signals.length,
      signals: cached.signals,
    });
  }

  try {
    const { tickers, total } = await fetchAllAltcoins(offset, limit, includeStocks);
    if (!tickers || tickers.length === 0) {
      return NextResponse.json({
        lastUpdated: now,
        cached: false,
        offset,
        limit,
        totalAvailable: total,
        totalScanned: 0,
        signals: [],
      });
    }

    // Process in parallel chunks of 30
    const batchSize = 30;
    const allSignals: CoinSignal[] = [];

    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      const results = await Promise.all(batch.map((ticker) => processSymbol(ticker)));
      for (const res of results) {
        if (res) allSignals.push(res);
      }
    }

    // Sort within chunk
    allSignals.sort((a, b) => {
      if (b.confluenceScore !== a.confluenceScore) {
        return b.confluenceScore - a.confluenceScore;
      }
      return b.volume24hUsd - a.volume24hUsd;
    });

    chunkCache.set(cacheKey, {
      timestamp: now,
      signals: allSignals,
      total,
    });

    return NextResponse.json({
      lastUpdated: now,
      cached: false,
      offset,
      limit,
      totalAvailable: total,
      totalScanned: allSignals.length,
      signals: allSignals,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to scan chunk', details: error?.message },
      { status: 500 }
    );
  }
}
