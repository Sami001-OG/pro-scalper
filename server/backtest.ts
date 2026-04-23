import { fetchOHLCV } from './binance';
import { calculateEMA, calculateStochRSI, calculateEWO, calculateVWAP } from './indicators';
import { Signal } from './bot';
import fs from 'fs';
import path from 'path';

const SYMBOL = 'BTC/USDT:USDT';

async function getHistoricalData(timeframe: string, limit: number) {
  const localPath = path.join(process.cwd(), 'server', 'data', `btc_${timeframe}.json`);
  if (fs.existsSync(localPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(localPath, 'utf8'));
      return data.slice(-limit);
    } catch (e) {
      console.error(`Error reading local data for ${timeframe}:`, e);
    }
  }
  
  // Pagination logic to fetch up to limit elements
  const allCandles = [];
  const maxPerRequest = 1000;
  let since: number | undefined = undefined;
  
  // Start from past and walk forward or just get latest
  // Actually, easiest way is to fetch backwards in time by specifying endTime.
  // Wait, binance ccxt supports since. But since we want the most recent `limit` candles:
  // we do latest first, then decrement endTime.
  let endTime = Date.now();
  const timeframesInMs: Record<string, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000
  };
  const stepMs = timeframesInMs[timeframe] || 5 * 60 * 1000;
  
  try {
     for (let i = 0; i < limit; i += maxPerRequest) {
       const fetchLimit = Math.min(maxPerRequest, limit - i);
       // We want candles ending at `endTime`
       const sinceTime = endTime - (fetchLimit * stepMs);
       const { exchange } = await import('./binance');
       
       const ohlcv = await exchange.fetchOHLCV(SYMBOL, timeframe, sinceTime, fetchLimit);
       if (!ohlcv || ohlcv.length === 0) break;
       
       const formatted = ohlcv.map(candle => ({
          timestamp: candle[0],
          open: candle[1],
          high: candle[2],
          low: candle[3],
          close: candle[4],
          volume: candle[5],
       }));
       
       allCandles.unshift(...formatted);
       endTime = sinceTime - stepMs; // move window back
       
       // Give it a tiny rest to avoid rate limits
       await new Promise(res => setTimeout(res, 50));
     }
  } catch (error) {
     console.error('Error fetching paginated historical data:', error);
  }
  
  // Provide what we could gather
  allCandles.sort((a,b) => a.timestamp - b.timestamp);
  return allCandles;
}

let cachedDataPromise: Promise<any> | null = null;

function padIndicator(indicatorArray: any[], originalLength: number, fillObj: any = null) {
  const paddingLength = originalLength - indicatorArray.length;
  const padding = Array(paddingLength).fill(fillObj);
  return padding.concat(indicatorArray);
}

export async function prepareData() {
  if (cachedDataPromise) return cachedDataPromise;

  cachedDataPromise = (async () => {
    try {
      const ohlcv5m = await getHistoricalData('5m', 15000);

      if (ohlcv5m.length < 300) {
        throw new Error('Not enough historical data');
      }

      const close5m = ohlcv5m.map((c: any) => c.close);
      const high5m = ohlcv5m.map((c: any) => c.high);
      const low5m = ohlcv5m.map((c: any) => c.low);
      const vol5m = ohlcv5m.map((c: any) => c.volume);
      const time5m = ohlcv5m.map((c: any) => c.timestamp);

      const ema9 = padIndicator(calculateEMA(close5m, 9), ohlcv5m.length);
      const ema21 = padIndicator(calculateEMA(close5m, 21), ohlcv5m.length);
      const ewo = calculateEWO(high5m, low5m, close5m); 
      const vwap = calculateVWAP(high5m, low5m, close5m, vol5m, time5m); 
      const stochRSI = padIndicator(calculateStochRSI(close5m, 14, 14, 3, 3), ohlcv5m.length, {k: 50, d: 50, stochRSI: 50});
      
      return {
        ohlcv5m,
        ema9,
        ema21,
        ewo,
        vwap,
        stochRSI
      };
    } catch (e) {
      cachedDataPromise = null;
      throw e;
    }
  })();

  return cachedDataPromise;
}

export async function runBacktest(slPct: number, tpPct: number, leverage = 1, _unused = false) {
  const data = await prepareData();
  const { ohlcv5m, ema9, ema21, ewo, vwap, stochRSI } = data;

  let trades: Signal[] = [];
  let activeTrade: Signal | null = null;
  let pnlHistory: number[] = [];

  for (let i = 100; i < ohlcv5m.length; i++) {
    const candle = ohlcv5m[i];
    const timestamp = candle.timestamp;
    const currentPrice = candle.close;
    const high = candle.high;
    const low = candle.low;

    if (activeTrade) {
      let closed = false;
      
      const stoch = stochRSI[i];
      const isStochReversedLong = stoch && stoch.k < stoch.d;
      const isStochReversedShort = stoch && stoch.k > stoch.d;

      if (activeTrade.type === 'LONG') {
        const currentPnl = (((currentPrice - activeTrade.entryPrice) / activeTrade.entryPrice) * 100) * leverage;
        const minPnl = (((low - activeTrade.entryPrice) / activeTrade.entryPrice) * 100) * leverage;
        
        // Liquidation check
        if (minPnl <= -100) {
          activeTrade.status = 'LIQUIDATED';
          activeTrade.pnl = -100;
          closed = true;
        }
        else if (isStochReversedLong && (((currentPrice - activeTrade.entryPrice) / activeTrade.entryPrice) * 100 > 0.1)) {
           activeTrade.status = 'CLOSED';
           activeTrade.pnl = currentPnl;
           closed = true;
        } else if (low <= activeTrade.stopLoss) {
          activeTrade.status = 'STOPPED';
          activeTrade.pnl = (((activeTrade.stopLoss - activeTrade.entryPrice) / activeTrade.entryPrice) * 100) * leverage;
          closed = true;
        } else if (high >= activeTrade.tp) {
          activeTrade.status = 'CLOSED';
          activeTrade.pnl = (((activeTrade.tp - activeTrade.entryPrice) / activeTrade.entryPrice) * 100) * leverage;
          closed = true;
        }
      } else {
        const currentPnl = (((activeTrade.entryPrice - currentPrice) / activeTrade.entryPrice) * 100) * leverage;
        const minPnl = (((activeTrade.entryPrice - high) / activeTrade.entryPrice) * 100) * leverage;

        // Liquidation check
        if (minPnl <= -100) {
          activeTrade.status = 'LIQUIDATED';
          activeTrade.pnl = -100;
          closed = true;
        }
        else if (isStochReversedShort && (((activeTrade.entryPrice - currentPrice) / activeTrade.entryPrice) * 100 > 0.1)) {
           activeTrade.status = 'CLOSED';
           activeTrade.pnl = currentPnl;
           closed = true;
        } else if (high >= activeTrade.stopLoss) {
          activeTrade.status = 'STOPPED';
          activeTrade.pnl = (((activeTrade.entryPrice - activeTrade.stopLoss) / activeTrade.entryPrice) * 100) * leverage;
          closed = true;
        } else if (low <= activeTrade.tp) {
          activeTrade.status = 'CLOSED';
          activeTrade.pnl = (((activeTrade.entryPrice - activeTrade.tp) / activeTrade.entryPrice) * 100) * leverage;
          closed = true;
        }
      }

      if (closed) {
        trades.push({ ...activeTrade });
        pnlHistory.push(activeTrade.pnl);
        activeTrade = null;
      }
      
      if (activeTrade) continue; // Skip entry logic if we still have a trade
    }

    const currentStoch = stochRSI[i];
    const prevStoch = stochRSI[i - 1];
    const currentEWO = ewo[i];
    const prevEWO = ewo[i - 1];
    
    if (!currentStoch || !prevStoch || currentEWO === null || prevEWO === null || ema9[i] === null || ema21[i] === null || vwap[i] === null) continue;

    const trend = ema9[i] > ema21[i] ? 'BULLISH' : 'BEARISH';
    const stochCrossUpOverSold = prevStoch.k < 20 && currentStoch.k >= 20;
    const stochCrossDownOverBought = prevStoch.k > 80 && currentStoch.k <= 80;

    if (trend === 'BULLISH' && currentPrice > vwap[i] && stochCrossUpOverSold && currentEWO > 0) {
      const sl = currentPrice * (1 - (slPct/100));
      const tp = currentPrice * (1 + (tpPct/100));

      activeTrade = {
        id: Math.random().toString(36).substring(7),
        timestamp,
        type: 'LONG',
        entryPrice: currentPrice,
        stopLoss: sl,
        tp: tp,
        status: 'OPEN',
        pnl: 0,
        slMult: slPct,
        tpMult: tpPct
      };
    } else if (trend === 'BEARISH' && currentPrice < vwap[i] && stochCrossDownOverBought && currentEWO < 0) {
      const sl = currentPrice * (1 + (slPct/100));
      const tp = currentPrice * (1 - (tpPct/100));

      activeTrade = {
        id: Math.random().toString(36).substring(7),
        timestamp,
        type: 'SHORT',
        entryPrice: currentPrice,
        stopLoss: sl,
        tp: tp,
        status: 'OPEN',
        pnl: 0,
        slMult: slPct,
        tpMult: tpPct
      };
    }
  }

  const winningTrades = trades.filter(t => t.pnl > 0).length;
  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const totalPnl = pnlHistory.reduce((a, b) => a + b, 0);

  return {
    slMultiplier: slPct,
    tpMultiplier: tpPct,
    leverage,
    useRandomAtr: false,
    totalTrades,
    winningTrades,
    winRate,
    totalPnl,
    trades: trades.reverse(), // most recent first
  };
}

export async function runBruteForceOptimization(leverage = 1) {
  const tpRange: number[] = [];
  const slRange: number[] = [];
  
  for (let i = 0.1; i <= 4.99; i += 0.1) {
    const val = Number(i.toFixed(1));
    tpRange.push(val);
    slRange.push(val);
  }

  const results = [];

  for (const sl of slRange) {
    for (const tp of tpRange) {
      const res = await runBacktest(sl, tp, leverage, false);
      if (res.totalTrades > 5) {
        results.push({
          sl,
          tp,
          totalTrades: res.totalTrades,
          winRate: res.winRate,
          totalPnl: res.totalPnl,
        });
      }
    }
  }

  return results.sort((a, b) => b.totalPnl - a.totalPnl).slice(0, 10);
}
