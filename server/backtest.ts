import { fetchOHLCV } from './binance';
import { calculateEMA, calculateStochRSI, calculateEWO, calculateVWAP } from './indicators';
import { Signal, calculateNetPnLPct, calculateLiqDistPct } from './bot';
import fs from 'fs';
import path from 'path';

const SYMBOL = 'BTC/USDT:USDT';

async function getHistoricalData(timeframe: string, limit: number) {
  const localPath = path.join(process.cwd(), 'server', 'data', `btc_${timeframe}.json`);
  
  // Try to load from cache
  if (fs.existsSync(localPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(localPath, 'utf8'));
      // If we have enough data and it's fresh (less than 1 hour old), use it
      const stats = fs.statSync(localPath);
      const isFresh = (Date.now() - stats.mtimeMs) < 60 * 60 * 1000;
      
      if (data.length >= limit && isFresh) {
        return data.slice(-limit);
      }
    } catch (e) {
      console.error(`Error reading local data for ${timeframe}:`, e);
    }
  }
  
  console.log(`Fetching ${limit} fresh candles for ${timeframe}...`);
  const allCandles = [];
  const maxPerRequest = 1000;
  let endTime = Date.now();
  
  const timeframesInMs: Record<string, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000
  };
  const stepMs = timeframesInMs[timeframe] || 5 * 60 * 1000;
  
  try {
     const { exchange } = await import('./binance');
     for (let i = 0; i < limit; i += maxPerRequest) {
       const fetchLimit = Math.min(maxPerRequest, limit - i);
       // Binance fetchOHLCV: symbol, timeframe, since, limit
       // We calculate 'since' to get the batch ending at `endTime`
       const sinceTime = endTime - (fetchLimit * stepMs);
       
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
       // Move endTime back past the candles we just fetched
       const earliestFetched = formatted[0].timestamp;
       endTime = earliestFetched - stepMs;
       
       if (ohlcv.length < fetchLimit) break; // End of available history
       await new Promise(res => setTimeout(res, 100)); // Rate limit buffer
     }
  } catch (error) {
     console.error('Error fetching paginated historical data:', error);
  }
  
  allCandles.sort((a,b) => a.timestamp - b.timestamp);
  const result = allCandles.slice(-limit);

  // Store in cache
  try {
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(localPath, JSON.stringify(result));
  } catch (e) {
    console.error('Failed to save data cache:', e);
  }

  return result;
}

let cachedDataPromise: Promise<any> | null = null;

function padIndicator(indicatorArray: any[], originalLength: number, fillObj: any = null) {
  const paddingLength = Math.max(0, originalLength - indicatorArray.length);
  const padding = Array(paddingLength).fill(fillObj);
  return padding.concat(indicatorArray);
}

export async function prepareData() {
  if (cachedDataPromise) return cachedDataPromise;

  cachedDataPromise = (async () => {
    try {
      // 1 Month of 5m candles = 30 days * 24h * 12 candles/h = 8640
      const limit = 30 * 24 * 12;
      const ohlcv5m = await getHistoricalData('5m', limit);

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

export async function runBacktest(slPct: number, tpPct: number, leverage = 1, initialCapital = 1000, marginPct = 10) {
  const data = await prepareData();
  const { ohlcv5m, ema9, ema21, ewo, vwap, stochRSI } = data;

  let trades: any[] = [];
  let activeTrade: any | null = null;
  let currentCapital = initialCapital;

  for (let i = 100; i < ohlcv5m.length; i++) {
    if (currentCapital <= 0) break;

    const candle = ohlcv5m[i];
    const timestamp = candle.timestamp;
    const currentPrice = candle.close;
    const high = candle.high;
    const low = candle.low;

    if (activeTrade) {
      let closed = false;

      if (activeTrade.type === 'LONG') {
        const currentPriceChange = ((low - activeTrade.entryPrice) / activeTrade.entryPrice) * 100;
        const potentialNetPnl = calculateNetPnLPct(currentPriceChange, leverage);
        
        if (potentialNetPnl <= -100) {
          activeTrade.status = 'LIQUIDATED';
          activeTrade.pnl = -100;
          closed = true;
        }
        else if (low <= activeTrade.stopLoss) {
          activeTrade.status = 'STOPPED';
          activeTrade.pnl = Math.max(-100, calculateNetPnLPct(-slPct, leverage));
          closed = true;
        } else if (high >= activeTrade.tp) {
          activeTrade.status = 'CLOSED';
          activeTrade.pnl = calculateNetPnLPct(tpPct, leverage);
          closed = true;
        }
      } else {
        const currentPriceChange = ((activeTrade.entryPrice - high) / activeTrade.entryPrice) * 100;
        const potentialNetPnl = calculateNetPnLPct(currentPriceChange, leverage);

        if (potentialNetPnl <= -100) {
          activeTrade.status = 'LIQUIDATED';
          activeTrade.pnl = -100;
          closed = true;
        }
        else if (high >= activeTrade.stopLoss) {
          activeTrade.status = 'STOPPED';
          activeTrade.pnl = Math.max(-100, calculateNetPnLPct(-slPct, leverage));
          closed = true;
        } else if (low <= activeTrade.tp) {
          activeTrade.status = 'CLOSED';
          activeTrade.pnl = calculateNetPnLPct(tpPct, leverage);
          closed = true;
        }
      }

      if (closed) {
        activeTrade.dollarPnL = (activeTrade.marginUsed * (activeTrade.pnl / 100));
        currentCapital += activeTrade.dollarPnL;
        trades.push({ ...activeTrade });
        activeTrade = null;
      }
      
      if (activeTrade) continue;
    }

    // Signals
    const currentStoch = stochRSI[i];
    const prevStoch = stochRSI[i - 1];
    const currentEWO = ewo[i];
    if (!currentStoch || !prevStoch || currentEWO === null || ema9[i] === null || ema21[i] === null || vwap[i] === null) continue;

    const trend = ema9[i] > ema21[i] ? 'BULLISH' : 'BEARISH';
    const stochCrossUpOverSold = prevStoch.k < 20 && currentStoch.k >= 20;
    const stochCrossDownOverBought = prevStoch.k > 80 && currentStoch.k <= 80;

    if (trend === 'BULLISH' && currentPrice > vwap[i] && stochCrossUpOverSold && currentEWO > 0) {
      const liqDist = calculateLiqDistPct(leverage);
      const effectiveSlPct = Math.min(slPct, liqDist * 0.99);
      
      const sl = currentPrice * (1 - (effectiveSlPct/100));
      const tp = currentPrice * (1 + (tpPct/100));
      const liqPrice = currentPrice * (1 - (liqDist/100));
      const marginUsed = currentCapital * (marginPct / 100);

      activeTrade = {
        id: Math.random().toString(36).substring(7),
        timestamp,
        type: 'LONG',
        symbol: SYMBOL,
        entryPrice: currentPrice,
        stopLoss: sl,
        tp: tp,
        liquidationPrice: liqPrice,
        status: 'OPEN',
        pnl: 0,
        slMult: effectiveSlPct,
        tpMult: tpPct,
        marginUsed: marginUsed,
        capitalAtEntry: currentCapital
      };
    } else if (trend === 'BEARISH' && currentPrice < vwap[i] && stochCrossDownOverBought && currentEWO < 0) {
      const liqDist = calculateLiqDistPct(leverage);
      const effectiveSlPct = Math.min(slPct, liqDist * 0.99);

      const sl = currentPrice * (1 + (effectiveSlPct/100));
      const tp = currentPrice * (1 - (tpPct/100));
      const liqPrice = currentPrice * (1 + (liqDist/100));
      const marginUsed = currentCapital * (marginPct / 100);

      activeTrade = {
        id: Math.random().toString(36).substring(7),
        timestamp,
        type: 'SHORT',
        symbol: SYMBOL,
        entryPrice: currentPrice,
        stopLoss: sl,
        tp: tp,
        liquidationPrice: liqPrice,
        status: 'OPEN',
        pnl: 0,
        slMult: effectiveSlPct,
        tpMult: tpPct,
        marginUsed: marginUsed,
        capitalAtEntry: currentCapital
      };
    }
  }

  const winningTrades = trades.filter(t => t.pnl > 0).length;
  const liquidations = trades.filter(t => t.status === 'LIQUIDATED').length;
  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const totalDollarPnL = currentCapital - initialCapital;

  return {
    slMultiplier: slPct,
    tpMultiplier: tpPct,
    leverage,
    initialCapital,
    marginPct,
    totalTrades,
    winningTrades,
    liquidations,
    winRate,
    totalDollarPnL,
    finalCapital: currentCapital,
    trades: trades.reverse(),
  };
}

export async function runBruteForceOptimization(initialCapital = 1000) {
  const data = await prepareData();
  const { ohlcv5m, ema9, ema21, ewo, vwap, stochRSI } = data;

  const signals: any[] = [];
  for (let i = 101; i < ohlcv5m.length; i++) {
    const currentPrice = ohlcv5m[i].close;
    const currentStoch = stochRSI[i];
    const prevStoch = stochRSI[i - 1];
    const currentEWO = ewo[i];
    if (!currentStoch || !prevStoch || currentEWO === null || ema9[i] === null || ema21[i] === null || vwap[i] === null) continue;
    const trend = ema9[i] > ema21[i] ? 'BULLISH' : 'BEARISH';
    const stochCrossUpOverSold = prevStoch.k < 20 && currentStoch.k >= 20;
    const stochCrossDownOverBought = prevStoch.k > 80 && currentStoch.k <= 80;

    if (trend === 'BULLISH' && currentPrice > vwap[i] && stochCrossUpOverSold && currentEWO > 0) {
      signals.push({ index: i, type: 'LONG', entryPrice: currentPrice });
    } else if (trend === 'BEARISH' && currentPrice < vwap[i] && stochCrossDownOverBought && currentEWO < 0) {
      signals.push({ index: i, type: 'SHORT', entryPrice: currentPrice });
    }
  }

  // Pre-calculate exits for 0.1% increments up to 100.0% (1000 steps)
  const STEPS = 1001;
  const exitMatrix_Up = new Int32Array(signals.length * STEPS).fill(ohlcv5m.length);
  const exitMatrix_Down = new Int32Array(signals.length * STEPS).fill(ohlcv5m.length);

  for (let s = 0; s < signals.length; s++) {
    const sig = signals[s];
    let maxUp = 0; let maxDown = 0;
    for (let j = sig.index + 1; j < ohlcv5m.length; j++) {
      const h = ohlcv5m[j].high; const l = ohlcv5m[j].low;
      const up = sig.type === 'LONG' ? (h - sig.entryPrice)/sig.entryPrice*100 : (sig.entryPrice - l)/sig.entryPrice*100;
      const down = sig.type === 'LONG' ? (sig.entryPrice - l)/sig.entryPrice*100 : (h - sig.entryPrice)/sig.entryPrice*100;
      
      if (up > maxUp) {
        const start = Math.floor(maxUp * 10) + 1; 
        const end = Math.min(STEPS - 1, Math.floor(up * 10));
        for (let p = start; p <= end; p++) exitMatrix_Up[s * STEPS + p] = j;
        maxUp = Math.max(maxUp, up);
      }
      if (down > maxDown) {
        const start = Math.floor(maxDown * 10) + 1; 
        const end = Math.min(STEPS - 1, Math.floor(down * 10));
        for (let p = start; p <= end; p++) exitMatrix_Down[s * STEPS + p] = j;
        maxDown = Math.max(maxDown, down);
      }
      if (maxUp >= 100 && maxDown >= 100) break;
    }
  }

  const results: any[] = [];
  const topBuffer: any[] = [];
  const topN = 50;

    for (let lev = 1; lev <= 50; lev++) {
      // Calculate liquidation distance for this leverage
      const liqDist = calculateLiqDistPct(lev);
      // Max allowable SL index based on liquidation proximity
      const maxSLStep = Math.max(1, Math.floor(liqDist * 0.99 * 10));

      for (let sLi = 1; sLi <= 49; sLi++) {
        // Force the chosen SL to be safe (before liquidation)
        const effectiveSLStep = Math.min(sLi, maxSLStep);
        
        for (let tPi = 1; tPi <= 49; tPi++) {
          const tradePnls: number[] = [];
          let lastIdx = -1; let wins = 0; let liquidations = 0;
          
          for (let s = 0; s < signals.length; s++) {
            if (signals[s].index < lastIdx) continue;
            
            const iUp = exitMatrix_Up[s * STEPS + tPi];
            const iDown = exitMatrix_Down[s * STEPS + effectiveSLStep];
            
            const exitIdx = Math.min(iUp, iDown);
            if (exitIdx >= ohlcv5m.length) break;

            let pnl = 0;
            if (exitIdx === iDown) {
              pnl = calculateNetPnLPct(-(effectiveSLStep / 10), lev);
            } else {
              pnl = calculateNetPnLPct(tPi / 10, lev);
            }
            
            if (pnl > 0) wins++;
            tradePnls.push(pnl);
            lastIdx = exitIdx;
          }

        if (tradePnls.length > 5) {
          let bestForThisParams = { totalPnl: -Infinity, mar: 1, cap: 1000 };
          for (let mar = 1; mar <= 20; mar++) {
            let cap = initialCapital;
            for (let k = 0; k < tradePnls.length; k++) {
              cap += (cap * (mar / 100)) * (tradePnls[k] / 100);
              if (cap <= 0) { cap = 0; break; }
            }
            
            const totalPnl = (cap - initialCapital) / initialCapital * 100;
            if (totalPnl > bestForThisParams.totalPnl) {
              bestForThisParams = { totalPnl, mar, cap };
            }
          }

          if (bestForThisParams.totalPnl > 0) {
            if (topBuffer.length < topN || bestForThisParams.totalPnl > topBuffer[topBuffer.length - 1].totalPnl) {
              topBuffer.push({
                sl: sLi/10, tp: tPi/10, leverage: lev, margin: bestForThisParams.mar,
                totalTrades: tradePnls.length, winRate: (wins/tradePnls.length)*100,
                totalPnl: bestForThisParams.totalPnl, dollarPnL: bestForThisParams.cap - initialCapital,
                liquidations
              });
              topBuffer.sort((a, b) => b.totalPnl - a.totalPnl);
              if (topBuffer.length > topN) topBuffer.length = topN;
            }
          }
        }
      }
    }
  }
  return topBuffer;
}
