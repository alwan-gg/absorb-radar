import { NextRequest, NextResponse } from 'next/server';
import { fetchAllAltcoins } from '@/lib/binance';
import { processSymbol } from '@/lib/detector';
import { CoinSignal, ScanResult } from '@/lib/types';

// Chunk cache store (keyed by `${offset}-${limit}`)
const chunkCache = new Map<string, { timestamp: number; signals: CoinSignal[]; total: number }>();
const CACHE_TTL_MS = 25000; // 25s cache per chunk

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '150', 10), 200);
  const cacheKey = `${offset}-${limit}`;
  const now = Date.now();

  const cached = chunkCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({
      lastUpdated: cached.timestamp,
      offset,
      limit,
      totalAvailable: cached.total,
      totalScanned: cached.signals.length,
      signals: cached.signals,
    });
  }

  try {
    const { tickers, total } = await fetchAllAltcoins(offset, limit);
    if (!tickers || tickers.length === 0) {
      return NextResponse.json({
        lastUpdated: now,
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
