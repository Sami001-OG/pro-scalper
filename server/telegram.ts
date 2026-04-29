import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { updateMultipliers, getMultipliers } from './bot';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

let bot: TelegramBot | null = null;

try {
  if (token) {
    bot = new TelegramBot(token, { polling: true });

    bot.onText(/\/setsl (.+)/, (msg, match) => {
      const val = parseFloat(match![1]);
      if (!isNaN(val)) {
        updateMultipliers(val, null);
        bot!.sendMessage(msg.chat.id, `✅ Stop Loss target updated to *${val}%*`, { parse_mode: 'Markdown' });
      } else {
        bot!.sendMessage(msg.chat.id, `❌ Invalid value for SL.`);
      }
    });

    bot.onText(/\/settp (.+)/, (msg, match) => {
      const val = parseFloat(match![1]);
      if (!isNaN(val)) {
        updateMultipliers(null, val);
        bot!.sendMessage(msg.chat.id, `✅ Take Profit target updated to *${val}%*`, { parse_mode: 'Markdown' });
      } else {
        bot!.sendMessage(msg.chat.id, `❌ Invalid value for TP.`);
      }
    });

    bot.onText(/\/status/, (msg) => {
      const { sl, tp } = getMultipliers();
      bot!.sendMessage(msg.chat.id, `📊 *Bot Status*\n\n*SL Target:* ${sl}%\n*TP Target:* ${tp}%`, { parse_mode: 'Markdown' });
    });

    bot.on('polling_error', (error: any) => {
      if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
        console.error('⚠️ Telegram Bot Conflict: Another instance of this bot is already running elsewhere (likely on your local computer or another server). Please close other instances to resolve this.');
        // Optionally stop polling to prevent spamming Telegram servers
        bot!.stopPolling();
      } else {
        console.error('Telegram polling error:', error);
      }
    });

    console.log('Telegram bot configured with polling mode');
    bot.sendMessage(chatId, `🤖 *Algorithmic Trading Bot Started*\n\n_Active Strategy: Confluence Scalper (5m)_\n\nUse commands to update parameters:\n\`/setsl [number]\` - Change Stop Loss %\n\`/settp [number]\` - Change Take Profit %\n\`/status\` - View Current Config`, { parse_mode: 'Markdown' }).catch(console.error);
  }
} catch (error) {
  console.error('Failed to initialize Telegram bot:', error);
}

export async function sendTelegramMessage(message: string) {
  if (!bot || !chatId) {
    console.warn('Telegram bot not configured, skipping message:', message);
    return;
  }
  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error sending Telegram message:', error);
  }
}
