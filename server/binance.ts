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

export async function fetchOHLCV(symbol: string, timeframe: string, limit: number = 100) {
  try {
    const ohlcv = await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
    return ohlcv.map(candle => ({
      timestamp: candle[0],
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5],
    }));
  } catch (error) {
    console.error(`Error fetching OHLCV for ${symbol} ${timeframe}:`, error);
    return [];
  }
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
