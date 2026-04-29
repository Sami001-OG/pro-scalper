import ccxt from 'ccxt';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.BINANCE_API_KEY;
const secret = process.env.BINANCE_API_SECRET;

export const exchange = new ccxt.binance({
  ...(apiKey && secret ? { apiKey, secret } : {}),
  enableRateLimit: true,
  options: {
    defaultType: 'future', // Use futures market for BTC/USDT Perpetual
  },
});

export const fallbackExchange = new ccxt.bybit({ enableRateLimit: true });

export async function fetchOHLCV(symbol: string, timeframe: string, limit: number = 100) {
  let ohlcv: number[][] = [];
  try {
    ohlcv = await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
  } catch (error: any) {
    console.error(`Binance fetch failed for ${symbol}, trying Bybit fallback... (${error.message})`);
    try {
      ohlcv = await fallbackExchange.fetchOHLCV(symbol, timeframe, undefined, limit);
    } catch (fallbackError) {
      console.error(`Fallback fetch also failed for ${symbol}:`, fallbackError);
      return [];
    }
  }

  return ohlcv.map(candle => ({
    timestamp: candle[0],
    open: candle[1],
    high: candle[2],
    low: candle[3],
    close: candle[4],
    volume: candle[5],
  }));
}

export async function fetchFundingRate(symbol: string) {
  try {
    const fundingRateInfo = await exchange.fetchFundingRate(symbol);
    return fundingRateInfo.fundingRate; // e.g., 0.0001 for 0.01%
  } catch (error) {
    console.error(`Error fetching funding rate for ${symbol}:`, error);
    return 0;
  }
}

export async function fetchOpenInterest(symbol: string) {
  try {
    const oi = await exchange.fetchOpenInterest(symbol);
    return oi.openInterestAmount;
  } catch (error) {
    console.error(`Error fetching open interest for ${symbol}:`, error);
    return 0;
  }
}
