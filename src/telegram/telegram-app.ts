import { Bot, Context, InputFile } from 'grammy';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import type { TelegramConfig } from './types.js';
import { SessionManager, type SessionInfo } from '../slack/session-manager.js';
import { chunkMessage, formatTodos } from '../slack/message-formatter.js';
import { extractImagePaths } from '../utils/image-extractor.js';
import { Scheduler } from '../scheduler/index.js';

// Telegram has a 4096 character limit per message
const MAX_MESSAGE_LENGTH = 4000;
const AFK_CODE_DIR = `${homedir()}/.afk-code`;

interface SessionTracking {
  sessionId: string;
  sessionName: string;
  projectName: string;
  lastActivity: Date;
}

export function createTelegramApp(config: TelegramConfig) {
  const bot = new Bot(config.botToken);

  const activeSessions = new Map<string, SessionTracking>();
  const telegramSentMessages = new Set<string>();
  let currentSessionId: string | null = null; // Explicitly selected session

  // Message queue for rate limiting (Telegram allows ~30 msg/sec but be conservative)
  const messageQueue: Array<() => Promise<void>> = [];
  let processingQueue = false;

  async function processQueue() {
    if (processingQueue) return;
    processingQueue = true;

    while (messageQueue.length > 0) {
      const fn = messageQueue.shift();
      if (fn) {
        try {
          await fn();
        } catch (err) {
          console.error('[Telegram] Error sending message:', err);
        }
        if (messageQueue.length > 0) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
    }

    processingQueue = false;
  }

  async function sendMessage(
    text: string,
    parseMode: 'Markdown' | 'HTML' | undefined = 'Markdown',
    options?: { disable_notification?: boolean }
  ) {
    messageQueue.push(async () => {
      try {
        await bot.api.sendMessage(config.chatId, text, {
          parse_mode: parseMode,
          disable_notification: options?.disable_notification,
        });
      } catch (err: any) {
        // If markdown fails, try without formatting
        if (parseMode && err.message?.includes('parse')) {
          await bot.api.sendMessage(config.chatId, text, {
            disable_notification: options?.disable_notification,
          });
        } else {
          throw err;
        }
      }
    });
    processQueue();
  }

  async function sendChunkedMessage(
    text: string,
    prefix?: string,
    options?: { disable_notification?: boolean }
  ) {
    const chunks = chunkMessage(text, MAX_MESSAGE_LENGTH);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = prefix && i === 0 ? `${prefix} ${chunks[i]}` : chunks[i];
      await sendMessage(chunk, 'Markdown', options);
    }
  }

  // Create session manager with Telegram event handlers
  const sessionManager = new SessionManager({
    onSessionStart: async (session) => {
      // Extract project name from working directory for better session identification
      const projectName = session.cwd.split('/').filter(Boolean).pop() || 'unknown';
      activeSessions.set(session.id, {
        sessionId: session.id,
        sessionName: session.name,
        projectName: projectName,
        lastActivity: new Date(),
      });

      // Format command name: "claude --foo --bar" → "claude (foo, bar)"
      const parts = session.name.split(' ');
      const cmd = parts[0];
      const args = parts.slice(1).map((a) => a.replace(/^-+/, ''));
      const sessionLabel = args.length > 0 ? `${cmd} (${args.join(', ')})` : cmd;

      await sendMessage(
        `Session started: ${sessionLabel}\n` + `Directory: \`${session.cwd}\``
      );
    },

    onSessionEnd: async (sessionId) => {
      const tracking = activeSessions.get(sessionId);
      const name = tracking?.sessionName || sessionId;

      activeSessions.delete(sessionId);

      await sendMessage(`Session ended: ${name}`);
    },

    onSessionUpdate: async (sessionId, name) => {
      const tracking = activeSessions.get(sessionId);
      if (tracking) {
        tracking.sessionName = name;
        tracking.lastActivity = new Date();
      }
    },

    onSessionStatus: async (sessionId, _status) => {
      const tracking = activeSessions.get(sessionId);
      if (tracking) {
        tracking.lastActivity = new Date();
      }
    },

    onMessage: async (sessionId, role, content) => {
      const tracking = activeSessions.get(sessionId);
      if (!tracking) return;

      tracking.lastActivity = new Date();

      if (role === 'user') {
        const contentKey = content.trim();
        if (telegramSentMessages.has(contentKey)) {
          telegramSentMessages.delete(contentKey);
          return;
        }
        // Skip HEARTBEAT prompts (auto-generated, no need to relay)
        if (contentKey.startsWith('[HEARTBEAT')) {
          return;
        }
        await sendChunkedMessage(content, `_User (terminal):_`, { disable_notification: true });
      } else {
        await sendChunkedMessage(content, `_Claude Code:_`);

        // Extract and upload any images mentioned in the response
        const session = sessionManager.getSession(sessionId);
        const images = extractImagePaths(content, session?.cwd);
        for (const image of images) {
          try {
            console.log(`[Telegram] Uploading image: ${image.resolvedPath}`);
            const isGif = image.resolvedPath.toLowerCase().endsWith('.gif');
            messageQueue.push(async () => {
              if (isGif) {
                await bot.api.sendAnimation(config.chatId, new InputFile(image.resolvedPath), {
                  caption: `📎 ${image.originalPath}`,
                });
              } else {
                await bot.api.sendPhoto(config.chatId, new InputFile(image.resolvedPath), {
                  caption: `📎 ${image.originalPath}`,
                });
              }
            });
            processQueue();
          } catch (err) {
            console.error('[Telegram] Failed to upload image:', err);
          }
        }
      }
    },

    onTodos: async (sessionId, todos) => {
      const tracking = activeSessions.get(sessionId);
      if (!tracking || todos.length === 0) return;

      const todosText = formatTodos(todos);
      await sendMessage(`_Claude Code:_ *Tasks:*\n${todosText}`);
    },

    onToolCall: async (_sessionId, _tool) => {
      // Disabled to reduce message volume
    },

    onToolResult: async (_sessionId, _result) => {
      // Disabled to reduce message volume
    },

    onPlanModeChange: async (sessionId, inPlanMode) => {
      const tracking = activeSessions.get(sessionId);
      if (!tracking) return;

      const status = inPlanMode
        ? 'Planning mode - Claude is designing a solution'
        : 'Execution mode - Claude is implementing';

      await sendMessage(`_Claude Code:_ ${status}`);
    },
  });

  function getCurrentSession(): SessionTracking | null {
    // If explicit session selected, use it
    if (currentSessionId) {
      const session = activeSessions.get(currentSessionId);
      if (session) return session;
      // Session ended, clear selection
      currentSessionId = null;
    }

    // Auto-select if only one session
    if (activeSessions.size === 1) {
      return activeSessions.values().next().value;
    }

    return null;
  }

  function getSessionByName(name: string): SessionTracking | null {
    const nameLower = name.toLowerCase();
    for (const tracking of activeSessions.values()) {
      if (tracking.sessionName.toLowerCase().startsWith(nameLower)) {
        return tracking;
      }
    }
    return null;
  }

  function getMostRecentSession(): SessionTracking | null {
    let mostRecent: SessionTracking | null = null;
    for (const tracking of activeSessions.values()) {
      if (!mostRecent || tracking.lastActivity > mostRecent.lastActivity) {
        mostRecent = tracking;
      }
    }
    return mostRecent;
  }

  // Initialize Scheduler (Heartbeat + Cron)
  const scheduler = new Scheduler({
    sessionManager,
    getActiveSessionId: () => {
      const current = getCurrentSession();
      if (current) return current.sessionId;
      const recent = getMostRecentSession();
      return recent?.sessionId || null;
    },
    isSessionBusy: (sessionId: string) => sessionManager.isSessionBusy(sessionId),
    notify: (message: string) => {
      sendMessage(message, 'Markdown', { disable_notification: true });
    },
  });

  // Handle incoming messages
  bot.on('message:text', async (ctx) => {
    // Only respond to messages from the configured chat
    if (ctx.chat.id.toString() !== config.chatId) return;

    const text = ctx.message.text;

    // Handle commands
    if (text.startsWith('/')) {
      await handleCommand(ctx, text.trim());
      return;
    }

    // Get current session
    const current = getCurrentSession();

    if (!current) {
      if (activeSessions.size === 0) {
        await ctx.reply('No active sessions. Start one with:\n`afk-code run -- claude`', { parse_mode: 'Markdown' });
      } else {
        // Multiple sessions, need to select one
        const list = Array.from(activeSessions.values())
          .map((s) => `• \`${s.sessionName}\``)
          .join('\n');
        await ctx.reply(
          `Multiple sessions active. Select one first:\n\n${list}\n\nUse: \`/switch <name>\``,
          { parse_mode: 'Markdown' }
        );
      }
      return;
    }

    telegramSentMessages.add(text.trim());

    const sent = sessionManager.sendInput(current.sessionId, text);
    if (!sent) {
      telegramSentMessages.delete(text.trim());
      await ctx.reply('Failed to send input - session not connected.');
    }
  });

  async function handleCommand(ctx: Context, text: string) {
    const [command, ...args] = text.split(' ');
    const sessionArg = args[0];

    let targetSession: SessionTracking | null = null;
    if (sessionArg && !sessionArg.startsWith('/')) {
      for (const tracking of activeSessions.values()) {
        if (tracking.sessionName.toLowerCase().startsWith(sessionArg.toLowerCase())) {
          targetSession = tracking;
          break;
        }
      }
    }
    if (!targetSession) {
      targetSession = getMostRecentSession();
    }

    switch (command.toLowerCase()) {
      case '/start': {
        await ctx.reply(
          `*AFK Code Telegram Bot*\n\n` +
            `This bot lets you monitor and interact with Claude Code sessions.\n` +
            `Heartbeat and Cron scheduler are active.\n\n` +
            `Start a session with:\n` +
            `\`afk-code run -- claude\`\n\n` +
            `Type /help for available commands.`,
          { parse_mode: 'Markdown' }
        );
        break;
      }

      case '/sessions': {
        if (activeSessions.size === 0) {
          await ctx.reply('No active sessions. Start one with `afk-code run -- claude`');
          return;
        }

        const current = getCurrentSession();
        const list = Array.from(activeSessions.values())
          .map((s) => {
            const isCurrent = current && s.sessionId === current.sessionId;
            const displayName = `${s.projectName}/${s.sessionName}`;
            return isCurrent ? `• *${displayName}* ← current` : `• ${displayName}`;
          })
          .join('\n');

        await ctx.reply(`*Active Sessions:*\n${list}\n\nUse \`/switch <name>\` to change`, { parse_mode: 'Markdown' });
        break;
      }

      case '/switch':
      case '/select': {
        if (!sessionArg) {
          if (activeSessions.size === 0) {
            await ctx.reply('No active sessions.');
            return;
          }
          const current = getCurrentSession();
          const list = Array.from(activeSessions.values())
            .map((s) => {
              const isCurrent = current && s.sessionId === current.sessionId;
              const displayName = `${s.projectName}/${s.sessionName}`;
              return isCurrent ? `• *${displayName}* ← current` : `• ${displayName}`;
            })
            .join('\n');
          await ctx.reply(`*Sessions:*\n${list}\n\nUse: \`/switch <name>\``, { parse_mode: 'Markdown' });
          return;
        }
        const session = getSessionByName(sessionArg);
        if (session) {
          currentSessionId = session.sessionId;
          await ctx.reply(`Switched to: *${session.sessionName}*`, { parse_mode: 'Markdown' });
        } else {
          await ctx.reply(`Session not found: ${sessionArg}`);
        }
        break;
      }

      case '/background':
      case '/bg': {
        if (!targetSession) {
          await ctx.reply('No active session.');
          return;
        }
        const sent = sessionManager.sendInput(targetSession.sessionId, '\x02');
        await ctx.reply(sent ? 'Sent background command (Ctrl+B)' : 'Failed - session not connected.');
        break;
      }

      case '/interrupt':
      case '/stop': {
        if (!targetSession) {
          await ctx.reply('No active session.');
          return;
        }
        const sent = sessionManager.sendInput(targetSession.sessionId, '\x1b');
        await ctx.reply(sent ? 'Sent interrupt (Escape)' : 'Failed - session not connected.');
        break;
      }

      case '/mode': {
        if (!targetSession) {
          await ctx.reply('No active session.');
          return;
        }
        const sent = sessionManager.sendInput(targetSession.sessionId, '\x1b[Z');
        await ctx.reply(sent ? 'Sent mode toggle (Shift+Tab)' : 'Failed - session not connected.');
        break;
      }

      case '/compact': {
        if (!targetSession) {
          await ctx.reply('No active session.');
          return;
        }
        const sent = sessionManager.sendInput(targetSession.sessionId, '/compact\n');
        await ctx.reply(sent ? 'Sent /compact' : 'Failed - session not connected.');
        break;
      }

      case '/model': {
        if (!targetSession) {
          await ctx.reply('No active session.');
          return;
        }
        const modelArg = args.slice(targetSession === getSessionByName(args[0] || '') ? 1 : 0).join(' ');
        if (!modelArg) {
          await ctx.reply('Usage: `/model <opus|sonnet|haiku>`', { parse_mode: 'Markdown' });
          return;
        }
        const sent = sessionManager.sendInput(targetSession.sessionId, `/model ${modelArg}\n`);
        await ctx.reply(sent ? `Sent /model ${modelArg}` : 'Failed - session not connected.');
        break;
      }

      // --- OpenClaw integration commands ---

      case '/heartbeat': {
        const hb = scheduler.getHeartbeat();
        if (!hb) {
          await ctx.reply('Heartbeat engine not initialized.');
          return;
        }

        const statusLines = [
          `*Heartbeat Status*`,
          `Enabled: ${hb.enabled ? 'Yes' : 'No'}`,
          `Interval: ${hb.intervalMinutes} min`,
          `Beat count: ${hb.beatCount}`,
          `Last beat: ${hb.lastBeatTime || 'Never'}`,
          `Consecutive skips: ${hb.consecutiveSkips}`,
        ];
        await ctx.reply(statusLines.join('\n'), { parse_mode: 'Markdown' });
        break;
      }

      case '/wakeup': {
        await ctx.reply('Triggering Heartbeat...');
        const triggered = await scheduler.triggerHeartbeat();
        if (!triggered) {
          await ctx.reply('Failed to trigger Heartbeat. No active session?');
        }
        break;
      }

      case '/cron': {
        const cronEngine = scheduler.getCron();
        if (!cronEngine) {
          await ctx.reply('Cron engine not initialized.');
          return;
        }

        const jobs = cronEngine.listJobs();
        if (jobs.length === 0) {
          await ctx.reply('No cron jobs configured. Edit `~/.afk-code/cron.yaml` to add jobs.', { parse_mode: 'Markdown' });
          return;
        }

        const jobList = jobs
          .map((j) => `• *${j.name}* (\`${j.schedule}\`) - ${j.enabled ? 'Active' : 'Disabled'}`)
          .join('\n');
        await ctx.reply(`*Cron Jobs:*\n${jobList}`, { parse_mode: 'Markdown' });
        break;
      }

      case '/memory': {
        try {
          const memoryContent = await readFile(`${AFK_CODE_DIR}/MEMORY.md`, 'utf-8');
          const preview = memoryContent.substring(0, MAX_MESSAGE_LENGTH - 100);
          await ctx.reply(`*MEMORY.md:*\n\n${preview}`, { parse_mode: 'Markdown' });
        } catch {
          await ctx.reply('MEMORY.md not found. Create it at `~/.afk-code/MEMORY.md`', { parse_mode: 'Markdown' });
        }
        break;
      }

      case '/soul': {
        try {
          const soulContent = await readFile(`${AFK_CODE_DIR}/SOUL.md`, 'utf-8');
          const preview = soulContent.substring(0, MAX_MESSAGE_LENGTH - 100);
          await ctx.reply(`*SOUL.md:*\n\n${preview}`, { parse_mode: 'Markdown' });
        } catch {
          await ctx.reply('SOUL.md not found. Create it at `~/.afk-code/SOUL.md`', { parse_mode: 'Markdown' });
        }
        break;
      }

      case '/help': {
        await ctx.reply(
          `*AFK Code Commands:*\n\n` +
            `*Session:*\n` +
            `/sessions - List active sessions\n` +
            `/switch <name> - Switch to a session\n` +
            `/model <name> - Switch model\n` +
            `/compact - Compact conversation\n` +
            `/background - Send Ctrl+B\n` +
            `/interrupt - Send Escape\n` +
            `/mode - Toggle mode (Shift+Tab)\n\n` +
            `*Autonomous:*\n` +
            `/heartbeat - Heartbeat status\n` +
            `/wakeup - Trigger Heartbeat now\n` +
            `/cron - List cron jobs\n` +
            `/memory - Show MEMORY.md\n` +
            `/soul - Show SOUL.md\n\n` +
            `/help - Show this message\n\n` +
            `_Messages go to the current session (auto-selected if only one)._`,
          { parse_mode: 'Markdown' }
        );
        break;
      }

      default:
        // Ignore unknown commands
        break;
    }
  }

  return { bot, sessionManager, scheduler };
}
