import { Timeframe, AbsorbStatus, TFSpan, CoinSignal } from './types';
import { fetchKlineData, fetchOpenInterest, Binance24hTicker } from './binance';

export function analyzeCandleAbsorption(klines: any[], tf: Timeframe): TFSpan {
  if (!klines || klines.length < 21) {
    return {
      tf,
      status: 'NEUTRAL',
      volSpikeRatio: 1,
      priceChangePct: 0,
      cvdDeltaUsd: 0,
      cvdRatio: 0.5,
      rangePct: 0,
      candleCloseTs: 0,
    };
  }

  // Use closed candle (klines[klines.length - 2]) for reliable signal, or last candle if checking live
  const targetCandle = klines[klines.length - 2] || klines[klines.length - 1];
  const prevCandles = klines.slice(-22, -2);
  // Binance kline[6] = close time of the candle (ms). Fallback to open + tf.
  const candleCloseTs = parseInt(targetCandle[6], 10) || 0;

  const open = parseFloat(targetCandle[1]);
  const high = parseFloat(targetCandle[2]);
  const low = parseFloat(targetCandle[3]);
  const close = parseFloat(targetCandle[4]);
  const totalVol = parseFloat(targetCandle[5]);
  const quoteVol = parseFloat(targetCandle[7]);
  const takerBuyVol = parseFloat(targetCandle[9]);
  const takerBuyQuoteVol = parseFloat(targetCandle[10]);

  // Volume Moving Average (20 periods)
  const volSum = prevCandles.reduce((acc, k) => acc + parseFloat(k[5]), 0);
  const avgVol = volSum / Math.max(1, prevCandles.length);
  const volSpikeRatio = avgVol > 0 ? parseFloat((totalVol / avgVol).toFixed(2)) : 1;

  // CVD calculation
  const takerSellQuoteVol = quoteVol - takerBuyQuoteVol;
  const cvdDeltaUsd = takerBuyQuoteVol - takerSellQuoteVol;
  const cvdRatio = quoteVol > 0 ? parseFloat((takerBuyQuoteVol / quoteVol).toFixed(2)) : 0.5;

  // Price Range & Movement
  const range = high - low;
  const rangePct = close > 0 ? parseFloat(((range / close) * 100).toFixed(2)) : 0;
  const priceChangePct = open > 0 ? parseFloat((((close - open) / open) * 100).toFixed(2)) : 0;

  // Absorption Logic
  let status: AbsorbStatus = 'NEUTRAL';
  const isVolSpike = volSpikeRatio >= 1.35;

  if (isVolSpike) {
    // 1. Bullish Absorption: High sell delta (Aggressive sellers) but price refuses to break down
    // (Strong passive limit bids absorb all market sells, wick rejection at bottom or green close)
    const lowerWick = Math.min(open, close) - low;
    const body = Math.abs(close - open);
    const isAggressiveSelling = cvdRatio <= 0.42 || cvdDeltaUsd < -50000;
    const isPriceHolding = priceChangePct >= -0.4 || lowerWick > body * 0.8;

    if (isAggressiveSelling && isPriceHolding) {
      status = 'BULLISH_ABSORB';
    }

    // 2. Bearish Absorption: High buy delta (Aggressive buyers) but price refuses to break up
    // (Strong passive limit asks absorb all market buys, wick rejection at top or red close)
    const upperWick = high - Math.max(open, close);
    const isAggressiveBuying = cvdRatio >= 0.58 || cvdDeltaUsd > 50000;
    const isPriceCapped = priceChangePct <= 0.4 || upperWick > body * 0.8;

    if (isAggressiveBuying && isPriceCapped) {
      status = 'BEARISH_ABSORB';
    }
  }

  return {
    tf,
    status,
    volSpikeRatio,
    priceChangePct,
    cvdDeltaUsd: Math.round(cvdDeltaUsd),
    cvdRatio,
    rangePct,
    candleCloseTs,
  };
}

export async function processSymbol(ticker: Binance24hTicker): Promise<CoinSignal | null> {
  const timeframes: Timeframe[] = ['5m', '15m', '1h', '4h', '1d'];
  const tfResults: Partial<Record<Timeframe, TFSpan>> = {};

  try {
    // Fetch klines for all timeframes in parallel
    const klinePromises = timeframes.map((tf) => fetchKlineData(ticker.symbol, tf, 25));
    const [oiRaw, ...klineDataList] = await Promise.all([
      fetchOpenInterest(ticker.symbol),
      ...klinePromises,
    ]);

    let confluenceScore = 0;
    let lastSignalTs = 0;
    let lastSignalTf: Timeframe | null = null;
    let topVolSpike = 1;

    timeframes.forEach((tf, index) => {
      const klines = klineDataList[index];
      const span = analyzeCandleAbsorption(klines, tf);
      tfResults[tf] = span;
      if (span.volSpikeRatio > topVolSpike) topVolSpike = span.volSpikeRatio;
      if (span.status !== 'NEUTRAL') {
        confluenceScore += 1;
        // freshest absorb candle across all TFs
        if (span.candleCloseTs > lastSignalTs) {
          lastSignalTs = span.candleCloseTs;
          lastSignalTf = tf;
        }
      }
    });

    const price = parseFloat(ticker.lastPrice);
    const oiUsd = oiRaw * price;

    return {
      symbol: ticker.symbol,
      price,
      priceChange24h: parseFloat(ticker.priceChangePercent),
      volume24hUsd: parseFloat(ticker.quoteVolume),
      openInterestUsd: Math.round(oiUsd),
      updatedAt: Date.now(),
      confluenceScore,
      timeframes: tfResults as Record<Timeframe, TFSpan>,
      lastSignalTs,
      lastSignalTf,
      topVolSpike: parseFloat(topVolSpike.toFixed(2)),
    };
  } catch (error) {
    return null;
  }
}
