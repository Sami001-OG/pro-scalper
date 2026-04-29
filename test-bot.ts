import { startBot } from './server/bot';

async function test() {
  try {
    console.log("Starting bot...");
    await startBot();
    console.log("Bot started successfully.");
    process.exit(0);
  } catch (e) {
    console.error("Error starting bot:", e);
    process.exit(1);
  }
}
test();
