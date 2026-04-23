# BTC Trading Bot Dashboard

This is a comprehensive dashboard for a Bitcoin automated trading bot. It provides real-time monitoring, backtesting capabilities, and brute-force optimization for trading strategies.

## Features

- **Real-time Monitoring**: View the current status of the trading bot and monitor live signals.
- **Backtesting**: Test trading strategies against historical data with configurable parameters (SL/TP multipliers, leverage, ATR usage).
- **Brute Force Optimization**: Automatically find the best Stop Loss (SL) and Take Profit (TP) multiplier combinations to maximize Profit and Loss (PnL).
- **Telegram Alerts**: Receive instant notifications for new trading signals and trade updates (SL/TP hits) directly to your Telegram.

## Architecture

- **Frontend**: A React-based dashboard built with Vite and Tailwind CSS, communicating with the backend via WebSockets for real-time updates.
- **Backend**: A Node.js/Express server that runs the trading bot, manages WebSocket connections, and executes backtesting/optimization routines.
- **Trading Engine**: Uses `ccxt` for exchange integration and `technicalindicators` for calculating trading signals.

## Deployment

This application is designed to be deployed on platforms supporting persistent Node.js servers (e.g., Railway, Render).

### Environment Variables

To run the bot, ensure the following environment variables are configured in your deployment platform:

- `BINANCE_API_KEY`: Your Binance API key.
- `BINANCE_API_SECRET`: Your Binance API secret.
- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token.
- `TELEGRAM_CHAT_ID`: The Telegram chat ID for alerts.
- `GEMINI_API_KEY`: (Optional) API key for Gemini AI integration.

## Project Link

You can access the live dashboard here:
https://only-btc-trading-production.up.railway.app/
