#!/usr/bin/env python3
"""
Standalone Altcoin Absorb + CVD + OI Scanner
Run locally or on any cloud worker.
"""

import time
import requests
from concurrent.futures import ThreadPoolExecutor

BINANCE_FAPI = "https://fapi.binance.com/fapi/v1"
TIMEFRAMES = ["5m", "15m", "1h", "4h", "1d"]

def get_top_altcoins(limit=50):
    try:
        res = requests.get(f"{BINANCE_FAPI}/ticker/24hr", timeout=10).json()
        usdt_pairs = [
            item for item in res 
            if item["symbol"].endswith("USDT") and "_" not in item["symbol"]
        ]
        usdt_pairs.sort(key=lambda x: float(x["quoteVolume"]), reverse=True)
        return usdt_pairs[:limit]
    except Exception as e:
        print(f"Error fetching 24hr tickers: {e}")
        return []

def analyze_tf(symbol, tf):
    try:
        url = f"{BINANCE_FAPI}/klines?symbol={symbol}&interval={tf}&limit=25"
        klines = requests.get(url, timeout=5).json()
        if len(klines) < 22:
            return None

        # Closed candle
        candle = klines[-2]
        prev_candles = klines[-22:-2]

        open_p = float(candle[1])
        high_p = float(candle[2])
        low_p = float(candle[3])
        close_p = float(candle[4])
        total_vol = float(candle[5])
        quote_vol = float(candle[7])
        taker_buy_quote = float(candle[10])

        avg_vol = sum(float(k[5]) for k in prev_candles) / len(prev_candles)
        vol_spike = round(total_vol / avg_vol, 2) if avg_vol > 0 else 1.0

        taker_sell_quote = quote_vol - taker_buy_quote
        cvd_delta = taker_buy_quote - taker_sell_quote
        cvd_ratio = round(taker_buy_quote / quote_vol, 2) if quote_vol > 0 else 0.5

        body = abs(close_p - open_p)
        change_pct = round(((close_p - open_p) / open_p) * 100, 2) if open_p > 0 else 0

        status = "NEUTRAL"
        if vol_spike >= 1.35:
            # Bullish Absorb
            lower_wick = min(open_p, close_p) - low_p
            if (cvd_ratio <= 0.42 or cvd_delta < -50000) and (change_pct >= -0.4 or lower_wick > body * 0.8):
                status = "BULLISH_ABSORB"

            # Bearish Absorb
            upper_wick = high_p - max(open_p, close_p)
            if (cvd_ratio >= 0.58 or cvd_delta > 50000) and (change_pct <= 0.4 or upper_wick > body * 0.8):
                status = "BEARISH_ABSORB"

        return {
            "tf": tf,
            "status": status,
            "vol_spike": vol_spike,
            "cvd_delta": int(cvd_delta),
            "cvd_ratio": cvd_ratio,
            "change_pct": change_pct
        }
    except Exception:
        return None

def scan_symbol(item):
    symbol = item["symbol"]
    results = {}
    confluence = 0

    for tf in TIMEFRAMES:
        res = analyze_tf(symbol, tf)
        if res:
            results[tf] = res
            if res["status"] != "NEUTRAL":
                confluence += 1

    return {
        "symbol": symbol,
        "price": float(item["lastPrice"]),
        "change_24h": float(item["priceChangePercent"]),
        "vol_24h": float(item["quoteVolume"]),
        "confluence": confluence,
        "results": results
    }

def main():
    print("Fetching Top Altcoins by Volume...")
    tickers = get_top_altcoins(40)
    print(f"Scanning {len(tickers)} pairs across {TIMEFRAMES}...")

    with ThreadPoolExecutor(max_workers=10) as executor:
        signals = list(executor.map(scan_symbol, tickers))

    signals.sort(key=lambda x: (x["confluence"], x["vol_24h"]), reverse=True)

    print("\n" + "="*85)
    print(f"{'SYMBOL':<12} | {'PRICE':<10} | {'24H %':<8} | {'CONFLUENCE':<10} | 5m      | 15m     | 1h      | 4h      | 1d")
    print("="*85)

    for s in signals:
        if s["confluence"] > 0:
            def format_st(status):
                if status == "BULLISH_ABSORB": return "🟢 BUY "
                if status == "BEARISH_ABSORB": return "🔴 SELL"
                return "  —   "

            t5 = format_st(s["results"].get("5m", {}).get("status", "NEUTRAL"))
            t15 = format_st(s["results"].get("15m", {}).get("status", "NEUTRAL"))
            t1h = format_st(s["results"].get("1h", {}).get("status", "NEUTRAL"))
            t4h = format_st(s["results"].get("4h", {}).get("status", "NEUTRAL"))
            t1d = format_st(s["results"].get("1d", {}).get("status", "NEUTRAL"))

            print(f"{s['symbol']:<12} | ${s['price']:<9.4f} | {s['change_24h']:<+7.2f}% | {s['confluence']:<10} | {t5} | {t15} | {t1h} | {t4h} | {t1d}")

if __name__ == "__main__":
    main()
