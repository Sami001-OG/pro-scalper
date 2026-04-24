import React, { useEffect, useState } from 'react';
import { Activity, TrendingUp, TrendingDown, Clock, DollarSign, AlertCircle, CheckCircle2, PlayCircle, BarChart3 } from 'lucide-react';
import { format } from 'date-fns';

interface BotStatus {
  isRunning: boolean;
  lastUpdate: number;
  currentTrend: string;
  fundingRate: number;
  openInterest: number;
  rsi15m: number;
  price: number;
}

interface Signal {
  id: string;
  timestamp: number;
  type: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  tp: number;
  slMult?: number;
  tpMult?: number;
  status: 'OPEN' | 'CLOSED' | 'STOPPED' | 'LIQUIDATED';
  pnl: number;
}

interface BacktestResult {
  slMultiplier?: number;
  tpMultiplier?: number;
  leverage?: number;
  useRandomAtr?: boolean;
  totalTrades: number;
  winningTrades: number;
  winRate: number;
  totalPnl: number;
  trades: Signal[];
  error?: string;
}

interface OptimizeResult {
  best: {
    sl: number; tp: number;
    totalTrades: number; winRate: number; totalPnl: number;
  };
  top10: Array<{
    sl: number; tp: number;
    totalTrades: number; winRate: number; totalPnl: number;
  }>;
  error?: string;
}

export default function App() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [activeTab, setActiveTab] = useState<'live' | 'backtest'>('live');
  const [backtestData, setBacktestData] = useState<BacktestResult | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [leverage, setLeverage] = useState(1);
  const [slMultiplier, setSlMultiplier] = useState(0.3);
  const [tpMultiplier, setTpMultiplier] = useState(0.6);
  const [optimizeData, setOptimizeData] = useState<OptimizeResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  useEffect(() => {
    // Connect to backend WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'INIT' || data.type === 'UPDATE') {
          setStatus(data.status);
          setSignals(data.signals);
        }
      } catch (e) {
        console.error('Error parsing WS message', e);
      }
    };

    ws.onclose = () => {
      console.log('WS disconnected');
    };

    return () => {
      ws.close();
    };
  }, []);

  const runBacktest = async () => {
    setIsBacktesting(true);
    setOptimizeData(null);
    try {
      const res = await fetch(`/api/backtest?leverage=${leverage}&sl=${slMultiplier}&tp=${tpMultiplier}`);
      if (!res.ok) {
         throw new Error(`API returned ${res.status}`);
      }
      const data = await res.json();
      setBacktestData(data);
    } catch (e) {
      console.error('Backtest failed', e);
      setBacktestData(null);
    } finally {
      setIsBacktesting(false);
    }
  };

  const runOptimize = async () => {
    setIsOptimizing(true);
    setBacktestData(null);
    try {
      const res = await fetch(`/api/optimize?leverage=${leverage}`);
      if (!res.ok) {
        throw new Error(`API returned ${res.status}`);
      }
      const data = await res.json();
      setOptimizeData({
        best: data[0] || { sl: 0, tp: 0, totalTrades: 0, winRate: 0, totalPnl: 0 },
        top10: data
      });
    } catch (e) {
      console.error('Optimization failed', e);
      setOptimizeData(null);
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-neutral-800 pb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Activity className="text-blue-500" />
              Crypto Signal Generator
            </h1>
            <p className="text-neutral-400 mt-1">Multi-Coin Perpetual Trading Bot (BTC, ETH, SOL)</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-neutral-900 p-1 rounded-lg border border-neutral-800">
              <button 
                onClick={() => setActiveTab('live')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'live' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}
              >
                Live Monitor
              </button>
              <button 
                onClick={() => setActiveTab('backtest')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'backtest' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}
              >
                Backtest
              </button>
            </div>
            {activeTab === 'live' && (
              <div className="flex items-center gap-3">
                <button 
                  onClick={async () => {
                    try {
                      await fetch('/api/test-telegram');
                      alert('Test message sent! Check your Telegram app. If it didn\\'t arrive, your TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing or incorrect in Render environment variables.');
                    } catch(e) {
                      alert('Failed to send test message');
                    }
                  }}
                  className="px-4 py-2 bg-[#0088cc]/10 hover:bg-[#0088cc]/20 text-[#0088cc] border border-[#0088cc]/30 rounded-full text-sm font-medium transition-colors"
                >
                  Test Telegram
                </button>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${status?.isRunning ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                  <div className={`w-2 h-2 rounded-full ${status?.isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                  {status?.isRunning ? 'Bot Active' : 'Bot Offline'}
                </div>
              </div>
            )}
          </div>
        </header>

        {activeTab === 'live' ? (
          <>
            {status && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatusCard 
                  title="Current Price (Live)" 
                  value={`$${(status?.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  icon={<DollarSign className="text-neutral-400" />}
                />
                <StatusCard 
                  title="Trend (5m)" 
                  value={status?.currentTrend || 'UNKNOWN'}
                  valueColor={status?.currentTrend === 'BULLISH' ? 'text-green-500' : status?.currentTrend === 'BEARISH' ? 'text-red-500' : 'text-yellow-500'}
                  icon={status?.currentTrend === 'BULLISH' ? <TrendingUp className="text-green-500" /> : <TrendingDown className="text-red-500" />}
                />
                <StatusCard 
                  title="Funding Rate" 
                  value={`${((status?.fundingRate || 0) * 100).toFixed(4)}%`}
                  valueColor={(status?.fundingRate || 0) < 0 ? 'text-green-500' : 'text-red-500'}
                  icon={<Activity className="text-neutral-400" />}
                />
                <StatusCard 
                  title="5m StochRSI(K)" 
                  value={(status?.rsi15m || 0).toFixed(2)}
                  valueColor={(status?.rsi15m || 0) < 20 ? 'text-green-500' : (status?.rsi15m || 0) > 80 ? 'text-red-500' : 'text-neutral-50'}
                  icon={<Activity className="text-neutral-400" />}
                />
              </div>
            )}

            <div className="space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-neutral-400" />
                Recent Signals & Trades
              </h2>
              
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                {signals.length === 0 ? (
                  <div className="p-8 text-center text-neutral-500 flex flex-col items-center justify-center">
                    <AlertCircle className="w-8 h-8 mb-3 opacity-50" />
                    <p>No signals generated yet.</p>
                    <p className="text-sm mt-1">Waiting for market conditions to align...</p>
                  </div>
                ) : (
                  <SignalTable signals={signals} />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-neutral-400" />
                  Strategy Backtest & Optimization
                </h2>
                <p className="text-neutral-400 text-sm mt-1">Simulate strategy over historical data</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
                  <label className="text-xs text-neutral-400">SL%:</label>
                  <input 
                    type="number" 
                    min="0.1" max="4.99" step="0.1"
                    value={slMultiplier} 
                    onChange={(e) => setSlMultiplier(Number(e.target.value))}
                    className="w-12 bg-transparent text-sm font-mono focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
                  <label className="text-xs text-neutral-400">TP%:</label>
                  <input 
                    type="number" 
                    min="0.1" max="4.99" step="0.1"
                    value={tpMultiplier} 
                    onChange={(e) => setTpMultiplier(Number(e.target.value))}
                    className="w-12 bg-transparent text-sm font-mono focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
                  <label className="text-xs text-neutral-400">Leverage:</label>
                  <input 
                    type="number" 
                    min="1" max="100" step="1"
                    value={leverage} 
                    onChange={(e) => setLeverage(Number(e.target.value))}
                    className="w-16 bg-transparent text-sm font-mono focus:outline-none"
                  />
                </div>
                <button 
                  onClick={runOptimize}
                  disabled={isOptimizing || isBacktesting}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
                >
                  {isOptimizing ? (
                    <Activity className="w-4 h-4 animate-spin" />
                  ) : (
                    <Activity className="w-4 h-4" />
                  )}
                  {isOptimizing ? 'Optimizing...' : 'Brute Force Optimize'}
                </button>
                <button 
                  onClick={runBacktest}
                  disabled={isBacktesting || isOptimizing}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
                >
                  {isBacktesting ? (
                    <Activity className="w-4 h-4 animate-spin" />
                  ) : (
                    <PlayCircle className="w-4 h-4" />
                  )}
                  {isBacktesting ? 'Running Simulation...' : 'Run Backtest'}
                </button>
              </div>
            </div>

            {optimizeData && !optimizeData.error && (
              <div className="space-y-6">
                <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl">
                  <h3 className="text-lg font-semibold mb-4 text-purple-400">Best Parameters Found</h3>
                  <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                      <p className="text-sm text-neutral-400">Stop Loss (%)</p>
                      <p className="text-xl font-bold">{optimizeData.best.sl}%</p>
                    </div>
                    <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                      <p className="text-sm text-neutral-400">Take Profit (%)</p>
                      <p className="text-xl font-bold">{optimizeData.best.tp}%</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatusCard title="Total Trades" value={optimizeData.best.totalTrades} icon={<Activity className="text-neutral-400" />} />
                    <StatusCard title="Win Rate" value={`${optimizeData.best.winRate.toFixed(1)}%`} valueColor={optimizeData.best.winRate > 50 ? 'text-green-500' : 'text-red-500'} icon={<CheckCircle2 className="text-neutral-400" />} />
                    <StatusCard title="Total PnL" value={`${optimizeData.best.totalPnl > 0 ? '+' : ''}${optimizeData.best.totalPnl.toFixed(2)}%`} valueColor={optimizeData.best.totalPnl > 0 ? 'text-green-500' : 'text-red-500'} icon={<DollarSign className="text-neutral-400" />} />
                  </div>
                </div>

                <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-neutral-800 bg-neutral-950/50">
                    <h3 className="font-medium">Top 10 Configurations</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-neutral-950/50 text-neutral-400 border-b border-neutral-800">
                        <tr>
                          <th className="px-6 py-4 font-medium">Rank</th>
                          <th className="px-6 py-4 font-medium">SL / TP</th>
                          <th className="px-6 py-4 font-medium">Trades</th>
                          <th className="px-6 py-4 font-medium">Win Rate</th>
                          <th className="px-6 py-4 font-medium">Total PnL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800/50">
                        {optimizeData.top10.map((res, idx) => (
                          <tr key={idx} className="hover:bg-neutral-800/20 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-neutral-400">#{idx + 1}</td>
                            <td className="px-6 py-4 whitespace-nowrap font-mono">
                              {res.sl}% / {res.tp}%
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">{res.totalTrades}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{res.winRate.toFixed(1)}%</td>
                            <td className="px-6 py-4 whitespace-nowrap font-mono text-green-500">+{res.totalPnl.toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {backtestData && !backtestData.error && (
              <>
                <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl mb-6">
                  <h3 className="text-lg font-semibold mb-4 text-blue-400">Backtest Results</h3>
                  <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                      <p className="text-sm text-neutral-400">Stop Loss (%)</p>
                      <p className="text-xl font-bold">{backtestData.slMultiplier}%</p>
                    </div>
                    <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                      <p className="text-sm text-neutral-400">Take Profit (%)</p>
                      <p className="text-xl font-bold">{backtestData.tpMultiplier}%</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <StatusCard title="Total Trades" value={backtestData.totalTrades} icon={<Activity className="text-neutral-400" />} />
                    <StatusCard title="Win Rate" value={`${backtestData.winRate.toFixed(1)}%`} valueColor={backtestData.winRate > 50 ? 'text-green-500' : 'text-red-500'} icon={<CheckCircle2 className="text-neutral-400" />} />
                    <StatusCard title="Winning Trades" value={backtestData.winningTrades} valueColor="text-green-500" icon={<TrendingUp className="text-neutral-400" />} />
                    <StatusCard title="Total PnL" value={`${backtestData.totalPnl > 0 ? '+' : ''}${backtestData.totalPnl.toFixed(2)}%`} valueColor={backtestData.totalPnl > 0 ? 'text-green-500' : 'text-red-500'} icon={<DollarSign className="text-neutral-400" />} />
                  </div>
                </div>

                <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-neutral-800 bg-neutral-950/50">
                    <h3 className="font-medium">Backtest Trade History</h3>
                  </div>
                  {backtestData.trades.length === 0 ? (
                    <div className="p-8 text-center text-neutral-500">No trades taken during this period.</div>
                  ) : (
                    <SignalTable signals={backtestData.trades} />
                  )}
                </div>
              </>
            )}

            {backtestData?.error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl flex items-center gap-3">
                <AlertCircle className="w-5 h-5" />
                {backtestData.error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SignalTable({ signals }: { signals: Signal[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-950/50 text-neutral-400 border-b border-neutral-800">
          <tr>
            <th className="px-6 py-4 font-medium">Time</th>
            <th className="px-6 py-4 font-medium">Coin</th>
            <th className="px-6 py-4 font-medium">Type</th>
            <th className="px-6 py-4 font-medium">Entry</th>
            <th className="px-6 py-4 font-medium">Stop Loss (%)</th>
            <th className="px-6 py-4 font-medium">Take Profit (%)</th>
            <th className="px-6 py-4 font-medium">Status</th>
            <th className="px-6 py-4 font-medium">PnL</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800/50">
          {signals.map((signal) => (
            <tr key={signal.id} className="hover:bg-neutral-800/20 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-neutral-300">
                {format(signal.timestamp, 'MMM dd, HH:mm:ss')}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-neutral-200 font-medium">
                {signal.symbol || 'BTC/USDT:USDT'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${
                  signal.type === 'LONG' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                }`}>
                  {signal.type === 'LONG' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {signal.type}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap font-mono">
                ${signal.entryPrice.toFixed(2)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap font-mono text-red-400">
                ${signal.stopLoss.toFixed(2)} {signal.slMult ? `(${signal.slMult.toFixed(2)}%)` : ''}
              </td>
              <td className="px-6 py-4 whitespace-nowrap font-mono text-neutral-400">
                <span className="text-green-400">${signal.tp.toFixed(2)} {signal.tpMult ? `(${signal.tpMult.toFixed(2)}%)` : ''}</span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <StatusBadge status={signal.status} />
              </td>
              <td className={`px-6 py-4 whitespace-nowrap font-mono font-medium ${
                signal.pnl > 0 ? 'text-green-500' : signal.pnl < 0 ? 'text-red-500' : 'text-neutral-500'
              }`}>
                {signal.pnl > 0 ? '+' : ''}{signal.pnl.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusCard({ title, value, icon, valueColor = 'text-neutral-50' }: { title: string, value: string | number, icon: React.ReactNode, valueColor?: string }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-neutral-400 mb-1">{title}</p>
        <p className={`text-2xl font-semibold tracking-tight ${valueColor}`}>{value}</p>
      </div>
      <div className="p-2 bg-neutral-800/50 rounded-lg">
        {icon}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Signal['status'] }) {
  const styles = {
    OPEN: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    CLOSED: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
    STOPPED: 'bg-red-500/10 text-red-500 border-red-500/20',
    LIQUIDATED: 'bg-red-600/20 text-red-600 font-bold border-red-600/30',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${styles[status] || styles.STOPPED}`}>
      {status === 'OPEN' && <Activity className="w-3 h-3 mr-1 animate-pulse" />}
      {status === 'CLOSED' ? <CheckCircle2 className="w-3 h-3 mr-1" /> : null}
      {status === 'LIQUIDATED' ? <AlertCircle className="w-3 h-3 mr-1" /> : null}
      {status}
    </span>
  );
}
