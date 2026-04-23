import { fetchOHLCV, fetchFundingRate, fetchOpenInterest } from './binance';
import { calculateEMA, calculateStochRSI, calculateEWO, calculateVWAP } from './indicators';
import { sendTelegramMessage } from './telegram';
import { startBinanceWS, LiveKline } from './binance-ws';

const SYMBOL = 'BTC/USDT:USDT'; // CCXT format for perpetual futures

export interface Signal {
  id: string;
  symbol: string;
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

let botStatus: any = {
  isRunning: false,
  lastUpdate: 0,
  currentTrend: 'UNKNOWN',
  fundingRate: 0,
  openInterest: 0,
  rsi15m: 0, 
  price: 0,
};

let recentSignals: Signal[] = [];
let activeTrades: Signal[] = [];

// Track multiple assets
const SYMBOLS = ['BTC/USDT:USDT', 'ETH/USDT:USDT', 'SOL/USDT:USDT'];

let ohlcvData: Record<string, any[]> = {
  'BTC/USDT:USDT': [],
  'ETH/USDT:USDT': [],
  'SOL/USDT:USDT': []
};
let latestStochRSI: Record<string, {k: number, d: number}> = {
  'BTC/USDT:USDT': {k:0, d:0},
  'ETH/USDT:USDT': {k:0, d:0},
  'SOL/USDT:USDT': {k:0, d:0}
};

// Mutable multiplier values configurable via Telegram (now representing % moves)
export let currentSlMult = 1.1;
export let currentTpMult = 1.9;

export function updateMultipliers(sl: number | null, tp: number | null) {
  if (sl !== null && !isNaN(sl)) currentSlMult = sl;
  if (tp !== null && !isNaN(tp)) currentTpMult = tp;
}

export function getMultipliers() {
  return { sl: currentSlMult, tp: currentTpMult };
}

export function getBotStatus() {
  return botStatus;
}

export function getRecentSignals() {
  return recentSignals;
}

async function initData() {
  for (const symbol of SYMBOLS) {
    const ohlcv = await fetchOHLCV(symbol, '5m', 500);
    ohlcvData[symbol] = ohlcv;
  }
}

function updateKlineArray(arr: any[], kline: LiveKline) {
  if (arr.length === 0) return;
  const last = arr[arr.length - 1];
  if (kline.timestamp === last.timestamp) {
    last.open = kline.open;
    last.high = kline.high;
    last.low = kline.low;
    last.close = kline.close;
    last.volume = kline.volume;
  } else if (kline.timestamp > last.timestamp) {
    arr.push({
      timestamp: kline.timestamp,
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
      volume: kline.volume
    });
    if (arr.length > 500) arr.shift();
  }
}

async function analyzeMarketRealtime() {
  try {
    for (const symbol of SYMBOLS) {
      const ohlcv5m = ohlcvData[symbol];
      if (ohlcv5m.length < 200) continue;

      const close5m = ohlcv5m.map(c => c.close);
      const high5m = ohlcv5m.map(c => c.high);
      const low5m = ohlcv5m.map(c => c.low);
      const vol5m = ohlcv5m.map(c => c.volume);
      const time5m = ohlcv5m.map(c => c.timestamp);

      const ema9 = calculateEMA(close5m, 9);
      const ema21 = calculateEMA(close5m, 21);
      const stochRSI = calculateStochRSI(close5m, 14, 14, 3, 3);
      const ewo = calculateEWO(high5m, low5m, close5m);
      const vwap = calculateVWAP(high5m, low5m, close5m, vol5m, time5m);

      const currentPrice = close5m[close5m.length - 1];
      
      // Validate arrays
      if (!ema9.length || !ema21.length || !stochRSI.length || !ewo.length || !vwap.length) continue;

      const currentEma9 = ema9[ema9.length - 1];
      const currentEma21 = ema21[ema21.length - 1];
      const currentVWAP = vwap[vwap.length - 1];
      
      // update globally for manageActiveTrades
      latestStochRSI[symbol] = stochRSI[stochRSI.length - 1];

      const currentStoch = stochRSI[stochRSI.length - 1];
      const prevStoch = stochRSI[stochRSI.length - 2];
      
      const currentEWO = ewo[ewo.length - 1];
      const prevEWO = ewo[ewo.length - 2];

      const trend = currentEma9 > currentEma21 ? 'BULLISH' : 'BEARISH';

      // Update Status (using BTC for overall bot status for now, or just setting last processed)
      if (symbol === 'BTC/USDT:USDT') {
        botStatus = {
          ...botStatus,
          isRunning: true,
          lastUpdate: Date.now(),
          currentTrend: trend,
          rsi15m: currentStoch.k, // reusing field for now
          price: currentPrice,
        };
      }

      // Check if we already have an open trade for THIS symbol
      if (activeTrades.find(t => t.symbol === symbol)) continue;

      let signal: Signal | null = null;
      const SL_PCT = currentSlMult / 100;
      const TP_PCT = currentTpMult / 100;

      // Confluence Scalper Long logic
      const stochCrossUpOverSold = prevStoch.k < 20 && currentStoch.k >= 20; 
      const ewoTurnsPositive = prevEWO <= 0 && currentEWO > 0;
      const stochCrossDownOverBought = prevStoch.k > 80 && currentStoch.k <= 80;
      const ewoTurnsNegative = prevEWO >= 0 && currentEWO < 0;

      if (trend === 'BULLISH' && currentPrice > currentVWAP && stochCrossUpOverSold && currentEWO > 0) {
        signal = {
          id: Math.random().toString(36).substring(7),
          symbol: symbol,
          timestamp: Date.now(),
          type: 'LONG',
          entryPrice: currentPrice,
          stopLoss: currentPrice * (1 - SL_PCT),
          tp: currentPrice * (1 + TP_PCT),
          status: 'OPEN',
          pnl: 0,
          slMult: currentSlMult,
          tpMult: currentTpMult
        };
      } else if (trend === 'BEARISH' && currentPrice < currentVWAP && stochCrossDownOverBought && currentEWO < 0) {
        signal = {
          id: Math.random().toString(36).substring(7),
          symbol: symbol,
          timestamp: Date.now(),
          type: 'SHORT',
          entryPrice: currentPrice,
          stopLoss: currentPrice * (1 + SL_PCT),
          tp: currentPrice * (1 - TP_PCT),
          status: 'OPEN',
          pnl: 0,
          slMult: currentSlMult,
          tpMult: currentTpMult
        };
      }

      if (signal) {
        activeTrades.push(signal);
        recentSignals.unshift({ ...signal });
        if (recentSignals.length > 20) recentSignals.pop();

        sendTelegramMessage(`coin : ${symbol.split('/')[0].toLowerCase()}usdt\ndirection : ${signal.type.toLowerCase()}\nentry:${signal.entryPrice.toFixed(4)}\ntp:${signal.tp.toFixed(4)}\nsl:${signal.stopLoss.toFixed(4)}`);
      }
    }

  } catch (err) {
    console.error('Error analyzing market:', err);
  }
}

function manageActiveTrades(symbol: string, currentPrice: number) {
  for (let i = activeTrades.length - 1; i >= 0; i--) {
    let trade = activeTrades[i];
    if (trade.symbol !== symbol) continue;

    let closed = false;

    // Check Stoch RSI Reversal (K crosses D backwards) or Momentum reversal
    const stochRSI = latestStochRSI[symbol];
    const isStochReversedLong = stochRSI.k < stochRSI.d;
    const isStochReversedShort = stochRSI.k > stochRSI.d;

    if (trade.type === 'LONG') {
      trade.pnl = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;

      if (isStochReversedLong && trade.pnl > 0.1) {
        trade.status = 'CLOSED';
        closed = true;
        sendTelegramMessage(`⚠️ *EARLY EXIT (StochRSI Reversal)* ⚠️\n\n*Pair:* ${symbol}\n*Type:* ${trade.type}\n*Price:* $${currentPrice.toFixed(4)}\n*PnL:* +${trade.pnl.toFixed(2)}%`);
      } else if (currentPrice <= trade.stopLoss) {
        trade.status = 'STOPPED';
        closed = true;
        sendTelegramMessage(`🛑 *STOP LOSS HIT* 🛑\n\n*Pair:* ${symbol}\n*Type:* ${trade.type}\n*Price:* $${currentPrice.toFixed(4)}`);
      } else if (currentPrice >= trade.tp) {
        trade.status = 'CLOSED';
        closed = true;
        sendTelegramMessage(`✅ *TAKE PROFIT HIT* ✅\n\n*Pair:* ${symbol}\n*Type:* ${trade.type}\n*Price:* $${currentPrice.toFixed(4)}`);
      }
    } else {
      trade.pnl = ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;

      if (isStochReversedShort && trade.pnl > 0.1) {
        trade.status = 'CLOSED';
        closed = true;
        sendTelegramMessage(`⚠️ *EARLY EXIT (StochRSI Reversal)* ⚠️\n\n*Pair:* ${symbol}\n*Type:* ${trade.type}\n*Price:* $${currentPrice.toFixed(4)}\n*PnL:* +${trade.pnl.toFixed(2)}%`);
      } else if (currentPrice >= trade.stopLoss) {
        trade.status = 'STOPPED';
        closed = true;
        sendTelegramMessage(`🛑 *STOP LOSS HIT* 🛑\n\n*Pair:* ${symbol}\n*Type:* ${trade.type}\n*Price:* $${currentPrice.toFixed(4)}`);
      } else if (currentPrice <= trade.tp) {
        trade.status = 'CLOSED';
        closed = true;
        sendTelegramMessage(`✅ *TAKE PROFIT HIT* ✅\n\n*Pair:* ${symbol}\n*Type:* ${trade.type}\n*Price:* $${currentPrice.toFixed(4)}`);
      }
    }

    if (closed) {
      const idx = recentSignals.findIndex(s => s.id === trade.id);
      if (idx !== -1) {
        recentSignals[idx] = { ...trade };
      }
      activeTrades.splice(i, 1);
    }
  }
}

export async function startBot() {
  console.log('Starting Trading Bot (5m Confluence Scalper)...');
  await initData();

  // Async loop for periodic updates (Funding and OI for BTC temporarily)
  setInterval(async () => {
    try {
      const funding = await fetchFundingRate('BTC/USDT:USDT');
      const oi = await fetchOpenInterest('BTC/USDT:USDT');
      botStatus.fundingRate = funding;
      botStatus.openInterest = oi;
    } catch (e) {
      console.error('Failed to update funding/OI:', e);
    }
  }, 60000);

  // Setup Binance WebSocket for real-time price updates
  startBinanceWS({
    onKlineUpdate: (kline: LiveKline) => {
      if (kline.timeframe === '5m') { // Match new timeframe
        const symbol = Object.keys(ohlcvData).find(s => s.startsWith(kline.symbol)) || kline.symbol + '/USDT:USDT'; // Map e.g. BTCUSDT to BTC/USDT:USDT
        
        let matchingSymbol = SYMBOLS[0];
        if (kline.symbol === 'BTCUSDT') matchingSymbol = 'BTC/USDT:USDT';
        if (kline.symbol === 'ETHUSDT') matchingSymbol = 'ETH/USDT:USDT';
        if (kline.symbol === 'SOLUSDT') matchingSymbol = 'SOL/USDT:USDT';

        updateKlineArray(ohlcvData[matchingSymbol], kline);

        if (matchingSymbol === 'BTC/USDT:USDT') {
           botStatus.price = kline.close;
        }
        
        // Manage active trades on every tick!
        manageActiveTrades(matchingSymbol, kline.close);
      }
    },
    onFundingUpdate: (fundingRate: number) => {
      botStatus.fundingRate = fundingRate;
    }
  });

  // Run strategy generation loop every 10 seconds
  setInterval(() => {
    analyzeMarketRealtime();
  }, 10000);
}
