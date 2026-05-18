import { homedir } from 'os';
import { mkdir, writeFile, readFile, access } from 'fs/promises';
import * as readline from 'readline';
import { setupFileLogger } from '../utils/logger.js';

const CONFIG_DIR = `${homedir()}/.afk-code`;
const TELEGRAM_CONFIG_FILE = `${CONFIG_DIR}/telegram.env`;

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function telegramSetup(): Promise<void> {
  console.log(`
┌─────────────────────────────────────────────────────────────┐
│                AFK Code Telegram Setup                       │
└─────────────────────────────────────────────────────────────┘

This will configure a Telegram bot for monitoring Claude Code sessions.

Step 1: Create a Telegram Bot
─────────────────────────────
1. Open Telegram and search for @BotFather
2. Send /newbot and follow the prompts
3. Choose a name (e.g., "AFK Code")
4. Choose a username (e.g., "my_afk_code_bot")
5. Copy the bot token BotFather gives you
`);

  const botToken = await prompt('Bot Token: ');

  if (!botToken || !botToken.includes(':')) {
    console.error('Invalid bot token. It should look like: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz');
    process.exit(1);
  }

  console.log(`
Step 2: Get Your Chat ID
────────────────────────
1. Start a chat with your new bot in Telegram
2. Send it any message (e.g., "hello")
3. Visit this URL in your browser:
   https://api.telegram.org/bot${botToken}/getUpdates
4. Find "chat":{"id":YOUR_CHAT_ID} in the response
5. Copy the numeric chat ID
`);

  const chatId = await prompt('Chat ID: ');

  if (!chatId || !/^-?\d+$/.test(chatId)) {
    console.error('Invalid chat ID. It should be a number (can be negative for groups).');
    process.exit(1);
  }

  // Save configuration
  await mkdir(CONFIG_DIR, { recursive: true });

  const envContent = `# AFK Code Telegram Configuration
TELEGRAM_BOT_TOKEN=${botToken}
TELEGRAM_CHAT_ID=${chatId}
`;

  await writeFile(TELEGRAM_CONFIG_FILE, envContent);

  console.log(`
Configuration saved to ${TELEGRAM_CONFIG_FILE}

To start the Telegram bot, run:
  afk-code telegram

Then start a Claude Code session with:
  afk-code run -- claude

Your bot will send session updates to your Telegram chat!
`);
}

async function loadEnvFile(path: string): Promise<Record<string, string>> {
  if (!(await fileExists(path))) return {};

  const content = await readFile(path, 'utf-8');
  const config: Record<string, string> = {};

  for (const line of content.split('\n')) {
    if (line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...valueParts] = line.split('=');
    config[key.trim()] = valueParts.join('=').trim();
  }
  return config;
}

export async function telegramRun(): Promise<void> {
  // Set up file logging (idempotent — safe to call on each restart)
  setupFileLogger();

  // Load config
  const globalConfig = await loadEnvFile(TELEGRAM_CONFIG_FILE);
  const localConfig = await loadEnvFile(`${process.cwd()}/.env`);

  const config: Record<string, string> = {
    ...globalConfig,
    ...localConfig,
  };

  // Environment variables take highest precedence
  if (process.env.TELEGRAM_BOT_TOKEN) config.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (process.env.TELEGRAM_CHAT_ID) config.TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  // Validate required config
  const required = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    console.error(`Missing config: ${missing.join(', ')}`);
    console.error('');
    console.error('Run "afk-code telegram setup" for guided configuration.');
    process.exit(1);
  }

  // Cancel any lingering long-poll connection from a previous run (e.g. after Mac sleep).
  // Sending getUpdates?timeout=0 forces Telegram to resolve the old request immediately,
  // so the next bot.start() won't get a 409 Conflict.
  console.log('[AFK Code] Cancelling any lingering Telegram long-poll (getUpdates?timeout=0)...');
  try {
    const cancelRes = await fetch(
      `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/getUpdates?timeout=0`,
    );
    console.log(`[AFK Code] Long-poll cancel response: HTTP ${cancelRes.status}`);
    const WAIT_MS = 35000;
    const STEP_MS = 5000;
    console.log(`[AFK Code] Waiting ${WAIT_MS / 1000}s for Telegram to release the connection...`);
    for (let elapsed = STEP_MS; elapsed <= WAIT_MS; elapsed += STEP_MS) {
      await new Promise<void>((r) => setTimeout(r, STEP_MS));
      console.log(`[AFK Code] Connection wait: ${elapsed / 1000}/${WAIT_MS / 1000}s`);
    }
  } catch (err: any) {
    console.warn(`[AFK Code] Long-poll cancel failed (continuing anyway): ${err?.message ?? err}`);
  }

  console.log('[AFK Code] Starting Telegram bot...');

  // Import and create the Telegram app
  const { createTelegramApp } = await import('../telegram/telegram-app.js');

  const telegramConfig = {
    botToken: config.TELEGRAM_BOT_TOKEN,
    chatId: config.TELEGRAM_CHAT_ID,
  };

  const { bot, sessionManager, scheduler, stop: stopWatchdog } = createTelegramApp(telegramConfig);

  // Start session manager
  console.log('[AFK Code] Starting session manager...');
  try {
    await sessionManager.start();
    console.log('[AFK Code] Session manager started');
  } catch (err) {
    console.error('[AFK Code] Failed to start session manager:', err);
    throw err;
  }

  // Start scheduler (Heartbeat + Cron)
  console.log('[AFK Code] Starting scheduler (Heartbeat + Cron)...');
  try {
    await scheduler.start();
    console.log('[AFK Code] Scheduler started');
  } catch (err) {
    console.error('[AFK Code] Failed to start scheduler:', err);
    // Non-fatal - continue without scheduler
  }

  // Signal handler: stop bot gracefully (don't call process.exit here - let auto-restart loop decide)
  const onSignal = () => {
    stopWatchdog();
    scheduler.stop();
    sessionManager.stop();
    bot.stop();
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  // Start bot (awaited so telegramRun() blocks until bot stops, enabling auto-restart)
  console.log('[AFK Code] Calling bot.start()...');
  try {
    await bot.start({
      onStart: (botInfo) => {
        console.log(`[AFK Code] Telegram bot @${botInfo.username} is running!`);
        console.log('[AFK Code] Heartbeat + Cron scheduler active');
        console.log('');
        console.log('Start a Claude Code session with: afk-code run -- claude');
      },
    });
    console.log('[AFK Code] bot.start() resolved (bot stopped normally)');
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    const is409 = msg.includes('409');
    console.error(`[AFK Code] bot.start() threw: ${msg}${is409 ? ' [409 long-poll conflict]' : ''}`);
    throw err;
  } finally {
    console.log('[AFK Code] Cleaning up signal handlers and resources...');
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    stopWatchdog();
    scheduler.stop();
    sessionManager.stop();
    try {
      await bot.stop();
      console.log('[AFK Code] bot.stop() completed');
    } catch (err: any) {
      console.warn(`[AFK Code] bot.stop() error (non-fatal): ${err?.message ?? err}`);
    }
  }
}
