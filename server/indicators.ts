import { EMA, ADX, RSI, ATR, MACD, StochasticRSI, SMA } from 'technicalindicators';

export function calculateEMA(prices: number[], period: number) {
  return EMA.calculate({ period, values: prices });
}

export function calculateADX(high: number[], low: number[], close: number[], period: number) {
  return ADX.calculate({ high, low, close, period });
}

export function calculateRSI(prices: number[], period: number) {
  return RSI.calculate({ period, values: prices });
}

export function calculateStochRSI(prices: number[], rsiPeriod = 14, stochasticPeriod = 14, kPeriod = 3, dPeriod = 3) {
  return StochasticRSI.calculate({
    values: prices,
    rsiPeriod,
    stochasticPeriod,
    kPeriod,
    dPeriod
  });
}

export function calculateEWO(high: number[], low: number[], close: number[]) {
  // EWO = SMA(5) - SMA(35) of (H+L)/2
  const midPrices = high.map((h, i) => (h + low[i]) / 2);
  const fastSma = SMA.calculate({ period: 5, values: midPrices });
  const slowSma = SMA.calculate({ period: 35, values: midPrices });

  const ewo = [];
  const offsetFast = midPrices.length - fastSma.length;
  const offsetSlow = midPrices.length - slowSma.length;
  
  for (let i = 0; i < midPrices.length; i++) {
    if (i < offsetSlow) {
      ewo.push(0);
    } else {
      ewo.push(fastSma[i - offsetFast] - slowSma[i - offsetSlow]);
    }
  }
  return ewo;
}

export function calculateATR(high: number[], low: number[], close: number[], period: number) {
  return ATR.calculate({ high, low, close, period });
}

export function calculateMACD(prices: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  return MACD.calculate({
    values: prices,
    fastPeriod,
    slowPeriod,
    signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false
  });
}

export function calculateVWAP(high: number[], low: number[], close: number[], volume: number[], timestamps?: number[]) {
  const vwap = [];
  let cumulativeTypicalPriceVolume = 0;
  let cumulativeVolume = 0;
  
  for (let i = 0; i < close.length; i++) {
    // Reset VWAP at the start of a new UTC day if timestamps are provided
    if (timestamps && i > 0) {
      const currentDay = new Date(timestamps[i]).getUTCDate();
      const prevDay = new Date(timestamps[i-1]).getUTCDate();
      if (currentDay !== prevDay) {
        cumulativeTypicalPriceVolume = 0;
        cumulativeVolume = 0;
      }
    }

    const typicalPrice = (high[i] + low[i] + close[i]) / 3;
    cumulativeTypicalPriceVolume += typicalPrice * volume[i];
    cumulativeVolume += volume[i];
    vwap.push(cumulativeVolume === 0 ? typicalPrice : cumulativeTypicalPriceVolume / cumulativeVolume);
  }
  return vwap;
}