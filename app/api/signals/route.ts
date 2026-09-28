import { NextRequest, NextResponse } from 'next/server';
import { fetchTopAltcoins } from '@/lib/binance';
import { processSymbol } from '@/lib/detector';
import { CoinSignal, ScanResult } from '@/lib/types';

// In-memory cache for fast serverless responses
let cachedSignals: ScanResult = {
  lastUpdated: 0,
  totalScanned: 0,
  signals: [],
};

const CACHE_TTL_MS = 20000; // 20 seconds cache

export const dynamic = 'force-dynamic';
export const maxDuration = 45; // 45s timeout on Singapore Edge/Serverless

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limitParam = parseInt(searchParams.get('limit') || '180', 10);
  const limit = Math.min(Math.max(limitParam, 20), 200);
  const now = Date.now();

  // Return cached result if still fresh and covers requested amount
  if (
    cachedSignals.signals.length >= limit &&
    now - cachedSignals.lastUpdated < CACHE_TTL_MS
  ) {
    return NextResponse.json(cachedSignals);
  }

  try {
    const topTickers = await fetchTopAltcoins(limit);
    if (!topTickers || topTickers.length === 0) {
      return NextResponse.json(cachedSignals);
    }

    // Process in parallel chunks of 25
    const batchSize = 25;
    const allSignals: CoinSignal[] = [];

    for (let i = 0; i < topTickers.length; i += batchSize) {
      const batch = topTickers.slice(i, i + batchSize);
      const results = await Promise.all(batch.map((ticker) => processSymbol(ticker)));
      for (const res of results) {
        if (res) allSignals.push(res);
      }
    }

    // Sort by confluence score descending, then by volume
    allSignals.sort((a, b) => {
      if (b.confluenceScore !== a.confluenceScore) {
        return b.confluenceScore - a.confluenceScore;
      }
      return b.volume24hUsd - a.volume24hUsd;
    });

    cachedSignals = {
      lastUpdated: now,
      totalScanned: allSignals.length,
      signals: allSignals,
    };

    return NextResponse.json(cachedSignals);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to scan signals', details: error?.message },
      { status: 500 }
    );
  }
}
