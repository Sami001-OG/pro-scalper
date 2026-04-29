import WebSocket from 'ws';

export interface LiveKline {
  symbol: string;
  timeframe: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

export function startBinanceWS(callbacks: {
  onKlineUpdate: (kline: LiveKline) => void;
  onFundingUpdate: (fundingRate: number) => void;
}) {
  const streams = [
    'btcusdt@kline_5m', 'btcusdt@markPrice'
  ];
  const wsUrl = `wss://fstream.binance.com/market/stream?streams=${streams.join('/')}`;
  
  let ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.log('Connected to Binance WebSocket Streams');
  });

  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (!parsed.data) return;

      const stream = parsed.stream;
      const payload = parsed.data;

      if (stream.includes('kline')) {
        const kline = payload.k;
        const tf = stream.split('_')[1];
        
        callbacks.onKlineUpdate({
          symbol: kline.s,
          timeframe: tf,
          timestamp: kline.t,
          open: parseFloat(kline.o),
          high: parseFloat(kline.h),
          low: parseFloat(kline.l),
          close: parseFloat(kline.c),
          volume: parseFloat(kline.v),
          isClosed: kline.x
        });
      } else if (stream.includes('markPrice')) {
        callbacks.onFundingUpdate(parseFloat(payload.r));
      }
    } catch (e) {
      console.error('Error parsing WS message:', e);
    }
  });

  ws.on('error', (err) => {
    console.error('Binance WS Error:', err);
  });

  ws.on('close', () => {
    console.log('Binance WS Closed. Reconnecting in 5s...');
    setTimeout(() => startBinanceWS(callbacks), 5000);
  });

  return ws;
}
