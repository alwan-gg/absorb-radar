'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight, 
  RefreshCw, 
  Volume2, 
  VolumeX, 
  ExternalLink, 
  Search, 
  ShieldAlert,
  Zap,
  TrendingUp,
  BarChart2,
  CheckCircle2
} from 'lucide-react';
import { CoinSignal, Timeframe } from '@/lib/types';

export default function Dashboard() {
  const [signalsMap, setSignalsMap] = useState<Record<string, CoinSignal>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [scanningProgress, setScanningProgress] = useState<{ loaded: number; total: number }>({ loaded: 0, total: 720 });
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [search, setSearch] = useState<string>('');
  const [filterType, setFilterType] = useState<'ALL' | 'BULLISH' | 'BEARISH' | 'CONFLUENCE'>('ALL');
  const [selectedTf, setSelectedTf] = useState<Timeframe | 'ALL'>('ALL');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const isFetchingRef = useRef<boolean>(false);

  // Fetch a single chunk
  const fetchChunk = async (offset: number, limit: number = 150) => {
    try {
      const res = await fetch(`/api/signals?offset=${offset}&limit=${limit}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  // Continuous Full-Market Scanner
  const loadAllAltcoins = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);

    try {
      // 1. First chunk (Instant priority: Top 150 volume coins)
      const firstData = await fetchChunk(0, 150);
      let totalAvailable = 720;

      if (firstData && firstData.signals) {
        totalAvailable = firstData.totalAvailable || 720;
        setSignalsMap((prev) => {
          const next = { ...prev };
          firstData.signals.forEach((s: CoinSignal) => {
            next[s.symbol] = s;
          });
          return next;
        });
        setScanningProgress({ loaded: firstData.signals.length, total: totalAvailable });
        setLastRefreshed(new Date());
      }

      // 2. Fetch remaining chunks in background pipeline (offsets 150, 300, 450, 600...)
      const offsets: number[] = [];
      for (let off = 150; off < totalAvailable; off += 150) {
        offsets.push(off);
      }

      // Parallel chunk requests
      const chunkResults = await Promise.all(offsets.map((off) => fetchChunk(off, 150)));

      setSignalsMap((prev) => {
        const next = { ...prev };
        let count = Object.keys(prev).length;
        chunkResults.forEach((chunk) => {
          if (chunk && chunk.signals) {
            chunk.signals.forEach((s: CoinSignal) => {
              next[s.symbol] = s;
            });
          }
        });
        count = Object.keys(next).length;
        setScanningProgress({ loaded: count, total: totalAvailable });
        return next;
      });

      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    loadAllAltcoins();
    const interval = setInterval(loadAllAltcoins, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Convert map to sorted array
  const allSignalsList = useMemo(() => {
    const list = Object.values(signalsMap);
    return list.sort((a, b) => {
      if (b.confluenceScore !== a.confluenceScore) {
        return b.confluenceScore - a.confluenceScore;
      }
      return b.volume24hUsd - a.volume24hUsd;
    });
  }, [signalsMap]);

  // Stats calculation
  const stats = useMemo(() => {
    let bullish = 0;
    let bearish = 0;
    let confluence = 0;

    allSignalsList.forEach((s) => {
      const hasBull = Object.values(s.timeframes).some((t) => t.status === 'BULLISH_ABSORB');
      const hasBear = Object.values(s.timeframes).some((t) => t.status === 'BEARISH_ABSORB');
      if (hasBull) bullish++;
      if (hasBear) bearish++;
      if (s.confluenceScore >= 2) confluence++;
    });

    return { bullish, bearish, confluence, total: allSignalsList.length };
  }, [allSignalsList]);

  // Filtered list
  const filteredSignals = useMemo(() => {
    return allSignalsList.filter((item) => {
      if (search && !item.symbol.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }

      if (selectedTf !== 'ALL') {
        const tfData = item.timeframes[selectedTf];
        if (!tfData || tfData.status === 'NEUTRAL') return false;
      }

      if (filterType === 'BULLISH') {
        return Object.values(item.timeframes).some((t) => t.status === 'BULLISH_ABSORB');
      }
      if (filterType === 'BEARISH') {
        return Object.values(item.timeframes).some((t) => t.status === 'BEARISH_ABSORB');
      }
      if (filterType === 'CONFLUENCE') {
        return item.confluenceScore >= 2;
      }

      return true;
    });
  }, [allSignalsList, search, filterType, selectedTf]);

  const formatUsd = (num: number) => {
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
  };

  const renderTfBadge = (tf: Timeframe, span: any) => {
    if (!span) return null;
    const isBull = span.status === 'BULLISH_ABSORB';
    const isBear = span.status === 'BEARISH_ABSORB';

    let colorClasses = 'bg-slate-800/60 text-slate-400 border-slate-700/50';
    let label = '—';

    if (isBull) {
      colorClasses = 'bg-emerald-950/70 text-emerald-400 border-emerald-500/50 shadow-sm shadow-emerald-900/30';
      label = 'BUY ABSORB';
    } else if (isBear) {
      colorClasses = 'bg-rose-950/70 text-rose-400 border-rose-500/50 shadow-sm shadow-rose-900/30';
      label = 'SELL ABSORB';
    }

    return (
      <div 
        key={tf}
        title={`${tf.toUpperCase()} | Vol: ${span.volSpikeRatio}x | CVD Ratio: ${(span.cvdRatio * 100).toFixed(0)}% | Delta: ${formatUsd(span.cvdDeltaUsd)}`}
        className={`flex flex-col items-center justify-center px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all ${colorClasses}`}
      >
        <span className="font-bold text-[10px] text-slate-300">{tf}</span>
        <span className="text-[9px] font-semibold tracking-wider whitespace-nowrap mt-0.5">
          {label}
        </span>
        <span className="text-[8px] opacity-70 mt-0.5">
          {span.volSpikeRatio > 1 ? `${span.volSpikeRatio}x vol` : ''}
        </span>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400 shadow-lg shadow-cyan-950/50">
              <Zap className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                ABSORB & FLOW RADAR
                <span className="text-xs font-mono bg-cyan-950 text-cyan-400 border border-cyan-800 px-2.5 py-0.5 rounded-full font-normal flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-cyan-400" /> 100% ALL ALTCOINS
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Scanning All {scanningProgress.total}+ USDT Perpetuals • Multi-TF Absorption • CVD Delta • OI
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
          {/* Progress Indicator */}
          <div className="text-right font-mono text-xs">
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5 justify-end">
              <span className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
              {loading ? 'Scanning Pipeline' : 'Sync Active'}
            </div>
            <p className="text-slate-200 font-semibold mt-0.5">
              {scanningProgress.loaded} / {scanningProgress.total} Pairs
            </p>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border text-xs font-medium transition-all flex items-center gap-1.5 ${
              soundEnabled
                ? 'bg-cyan-950/60 border-cyan-600/60 text-cyan-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={loadAllAltcoins}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh All
          </button>
        </div>
      </header>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">All Altcoins Tracked</span>
            <BarChart2 className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-white mt-2">{stats.total}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Entire Binance USDT Futures market</p>
        </div>

        <div className="bg-emerald-950/30 border border-emerald-900/40 p-4 rounded-2xl">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-medium">Bullish Absorption</span>
            <TrendingUp className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-400 mt-2">{stats.bullish}</p>
          <p className="text-[10px] text-emerald-500/70 mt-0.5">Passive whale limit bids</p>
        </div>

        <div className="bg-rose-950/30 border border-rose-900/40 p-4 rounded-2xl">
          <div className="flex items-center justify-between text-rose-400">
            <span className="text-xs font-medium">Bearish Absorption</span>
            <ShieldAlert className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold font-mono text-rose-400 mt-2">{stats.bearish}</p>
          <p className="text-[10px] text-rose-500/70 mt-0.5">Passive whale limit asks</p>
        </div>

        <div className="bg-purple-950/30 border border-purple-900/40 p-4 rounded-2xl">
          <div className="flex items-center justify-between text-purple-400">
            <span className="text-xs font-medium">Multi-TF Confluence</span>
            <Activity className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold font-mono text-purple-400 mt-2">{stats.confluence}</p>
          <p className="text-[10px] text-purple-400/70 mt-0.5">≥ 2 Timeframes aligned</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/40 border border-slate-800 p-3 rounded-2xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search all 700+ coins (e.g. 1000PEPE, DOGE, SOL, JUP, WIF, SUI, NEAR)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-800/80 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {(['ALL', 'BULLISH', 'BEARISH', 'CONFLUENCE'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterType(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                filterType === cat
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {cat === 'ALL' && 'All Coins'}
              {cat === 'BULLISH' && '🟢 Bullish Absorb'}
              {cat === 'BEARISH' && '🔴 Bearish Absorb'}
              {cat === 'CONFLUENCE' && '⚡ High Confluence'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 border-l border-slate-800 pl-3">
          {(['ALL', '5m', '15m', '1h', '4h', '1d'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setSelectedTf(tf)}
              className={`px-2 py-1 rounded text-[11px] font-mono font-medium ${
                selectedTf === tf
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Main Signal Matrix Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase font-mono text-[10px]">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Pair / Price</th>
                <th className="py-3.5 px-4 font-semibold">24h Vol / OI</th>
                <th className="py-3.5 px-4 font-semibold text-center">5m</th>
                <th className="py-3.5 px-4 font-semibold text-center">15m</th>
                <th className="py-3.5 px-4 font-semibold text-center">1h</th>
                <th className="py-3.5 px-4 font-semibold text-center">4h</th>
                <th className="py-3.5 px-4 font-semibold text-center">1d</th>
                <th className="py-3.5 px-4 font-semibold text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredSignals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    {loading ? 'Connecting & scanning all 700+ Altcoins in real-time...' : 'No signals match your filter criteria.'}
                  </td>
                </tr>
              ) : (
                filteredSignals.map((item) => {
                  const isUp = item.priceChange24h >= 0;
                  const cleanSymbol = item.symbol.replace('USDT', '');

                  return (
                    <tr key={item.symbol} className="hover:bg-slate-800/30 transition-colors">
                      {/* Pair & Price */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white font-mono">{cleanSymbol}</span>
                          <span className="text-[10px] text-slate-500 font-mono">/USDT</span>
                          {item.confluenceScore >= 2 && (
                            <span className="text-[9px] bg-purple-950 text-purple-300 border border-purple-800 px-1.5 py-0.2 rounded font-mono">
                              {item.confluenceScore} TF
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-mono text-slate-200">${item.price}</span>
                          <span className={`text-[11px] font-mono flex items-center ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {item.priceChange24h.toFixed(2)}%
                          </span>
                        </div>
                      </td>

                      {/* 24h Vol & Open Interest */}
                      <td className="py-4 px-4 font-mono">
                        <div className="text-slate-300 font-medium">{formatUsd(item.volume24hUsd)}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">OI: {formatUsd(item.openInterestUsd)}</div>
                      </td>

                      {/* Timeframe Badges */}
                      <td className="py-4 px-2 text-center">{renderTfBadge('5m', item.timeframes['5m'])}</td>
                      <td className="py-4 px-2 text-center">{renderTfBadge('15m', item.timeframes['15m'])}</td>
                      <td className="py-4 px-2 text-center">{renderTfBadge('1h', item.timeframes['1h'])}</td>
                      <td className="py-4 px-2 text-center">{renderTfBadge('4h', item.timeframes['4h'])}</td>
                      <td className="py-4 px-2 text-center">{renderTfBadge('1d', item.timeframes['1d'])}</td>

                      {/* External TradingView Link */}
                      <td className="py-4 px-4 text-center">
                        <a
                          href={`https://www.tradingview.com/chart/?symbol=BINANCE:${item.symbol}.P`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] font-medium transition-all"
                        >
                          Chart <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Educational Footer */}
      <footer className="bg-slate-900/30 border border-slate-800/60 p-4 rounded-xl text-xs text-slate-400 space-y-1">
        <div className="font-semibold text-slate-300 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-cyan-400" /> Absorption Methodology:
        </div>
        <p>
          <strong className="text-emerald-400">Bullish Absorb:</strong> Extreme taker sell volume / negative CVD delta, but price fails to make lower lows due to heavy institutional limit buy orders (Passive accumulation).
        </p>
        <p>
          <strong className="text-rose-400">Bearish Absorb:</strong> Extreme taker buy volume / positive CVD delta, but price fails to make higher highs due to heavy institutional limit sell orders (Passive distribution).
        </p>
      </footer>
    </div>
  );
}
