import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { startBot, getBotStatus, getRecentSignals } from './server/bot';
import { runBacktest, runBruteForceOptimization } from './server/backtest';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());

  // API routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/status', (req, res) => {
    res.json(getBotStatus());
  });

  app.get('/api/signals', (req, res) => {
    res.json(getRecentSignals());
  });

  app.get('/api/test-telegram', async (req, res) => {
    try {
      const { sendTelegramMessage } = await import('./server/telegram');
      await sendTelegramMessage('🔔 *TEST MESSAGE* 🔔\n\nYour Telegram connection is working perfectly! Live trades will appear here as soon as market conditions trigger them.');
      res.json({ success: true, message: 'Test message sent to Telegram' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/backtest', async (req, res) => {
    try {
      const slMultiplier = req.query.sl ? parseFloat(req.query.sl as string) : 1.5;
      const tpMultiplier = req.query.tp ? parseFloat(req.query.tp as string) : 3.0;
      const leverage = req.query.leverage ? parseFloat(req.query.leverage as string) : 1;
      const useRandomAtr = req.query.randomAtr === 'true';

      const results = await runBacktest(slMultiplier, tpMultiplier, leverage, useRandomAtr);
      res.json(results);
    } catch (error) {
      console.error('Backtest error:', error);
      res.status(500).json({ error: 'Failed to run backtest' });
    }
  });

  app.get('/api/optimize', async (req, res) => {
    try {
      const leverage = req.query.leverage ? parseFloat(req.query.leverage as string) : 1;
      const results = await runBruteForceOptimization(leverage);
      res.json(results);
    } catch (error) {
      console.error('Optimization error:', error);
      res.status(500).json({ error: 'Failed to run optimization' });
    }
  });

  // Start the trading bot
  startBot().catch(err => console.error('Failed to start bot:', err));

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Setup WebSocket Server for Frontend
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws) => {
    console.log('Frontend client connected to WS');
    
    // Send initial state
    ws.send(JSON.stringify({
      type: 'INIT',
      status: getBotStatus(),
      signals: getRecentSignals()
    }));

    // We can broadcast updates periodically or on change.
    // Since price updates very frequently, let's throttle broadcasts to 1s.
    const interval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'UPDATE',
          status: getBotStatus(),
          signals: getRecentSignals()
        }));
      }
    }, 1000);

    ws.on('close', () => {
      clearInterval(interval);
    });
  });
}

startServer();
