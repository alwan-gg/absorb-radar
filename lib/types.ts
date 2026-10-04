export type Timeframe = '5m' | '15m' | '1h' | '4h' | '1d';

export type AbsorbStatus = 'BULLISH_ABSORB' | 'BEARISH_ABSORB' | 'NEUTRAL';

export interface TFSpan {
  tf: Timeframe;
  status: AbsorbStatus;
  volSpikeRatio: number;      // e.g. 2.4x above 20-period volume MA
  priceChangePct: number;     // candle change %
  cvdDeltaUsd: number;        // delta in USD
  cvdRatio: number;           // taker buy vol / total vol (0.0 to 1.0)
  rangePct: number;           // (high - low) / close %
  candleCloseTs: number;      // close time of the evaluated candle (ms epoch)
}

export interface CoinSignal {
  symbol: string;
  price: number;
  priceChange24h: number;
  volume24hUsd: number;
  openInterestUsd: number;
  oiChangePct?: number;
  updatedAt: number;
  confluenceScore: number;    // Count of active absorbed TFs
  timeframes: Record<Timeframe, TFSpan>;
  lastSignalTs: number;       // most recent absorb candle close (0 = none)
  lastSignalTf: Timeframe | null;
  topVolSpike: number;        // max volSpikeRatio across all TFs
}

export interface ScanResult {
  lastUpdated: number;
  totalScanned: number;
  signals: CoinSignal[];
}
