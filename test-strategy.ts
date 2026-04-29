import { runBacktest } from './server/backtest';

async function test() {
  console.log("Analyzing Strategy Configurations...");
  
  const testParams = [
    { sl: 1.5, tp: 2.0 },
    { sl: 2.0, tp: 3.0 },
    { sl: 2.5, tp: 2.5 },
    { sl: 3.0, tp: 1.5 },
    { sl: 2.2, tp: 2.8 },
  ];

  for (const p of testParams) {
    let res = await runBacktest(p.sl, p.tp, 1, 1000, 10);
    console.log(`SL: ${p.sl.toFixed(1)}%, TP: ${p.tp.toFixed(1)}% -> Trades: ${res.totalTrades}, Win Rate: ${res.winRate.toFixed(2)}%, PnL: $${res.totalDollarPnL.toFixed(2)}`);
  }
}
test().catch(console.error);
