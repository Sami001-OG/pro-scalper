import { fetchOHLCV } from './server/binance';

async function test() {
  try {
    console.log("Fetching 15m data...");
    const data = await fetchOHLCV('BTC/USDT:USDT', '15m', 10);
    console.log("Success! Data length:", data.length);
  } catch (e) {
    console.error("Error:", e);
  }
}
test();
