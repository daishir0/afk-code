import { Bot, Context, InputFile } from 'grammy';
import { readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { parse as parseYaml } from 'yaml';
import type { TelegramConfig } from './types.js';
import { SessionManager, type SessionInfo } from '../slack/session-manager.js';
import { chunkMessage, formatTodos } from '../slack/message-formatter.js';
import { extractImagePaths } from '../utils/image-extractor.js';
import { Scheduler } from '../scheduler/index.js';

const execAsync = promisify(exec);

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

  // Per-session message buffer for cross-project context
  const sessionMessageBuffers = new Map<string, Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>>();
  const MESSAGE_BUFFER_SIZE = 10;
  let currentSessionId: string | null = null; // Explicitly selected session
  let primarySessionId: string | null = null; // First session started (Heartbeat/Cron target)
  let pendingSwitchProject: string | null = null; // Project name awaiting session start

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
      // Match cwd against projects.yaml for accurate project name
      const projects = await loadProjects();
      let projectName = session.cwd.split('/').filter(Boolean).pop() || 'unknown';
      for (const [name, path] of projects.entries()) {
        if (session.cwd === path || session.cwd.startsWith(path + '/')) {
          projectName = name;
          break;
        }
      }
      activeSessions.set(session.id, {
        sessionId: session.id,
        sessionName: session.name,
        projectName: projectName,
        lastActivity: new Date(),
      });

      // First session becomes primary (Heartbeat/Cron target)
      if (!primarySessionId) {
        primarySessionId = session.id;
      }

      // Auto-switch to session if it was requested via /switch
      if (pendingSwitchProject && projectName === pendingSwitchProject) {
        currentSessionId = session.id;
        pendingSwitchProject = null;
      }

      // Format display: strip verbose flags for cleaner display
      const HIDDEN_FLAGS = ['--dangerously-skip-permissions'];
      const parts = session.name.split(' ');
      const cmd = parts[0];
      const visibleArgs = parts.slice(1).filter(a => !HIDDEN_FLAGS.includes(a));
      const sessionLabel = visibleArgs.length > 0
        ? `${cmd} (${visibleArgs.map(a => a.replace(/^-+/, '')).join(', ')})`
        : cmd;

      const isPrimary = session.id === primarySessionId ? ' ⭐' : '';
      await sendMessage(
        `Session started: ${projectName}/${sessionLabel}${isPrimary}\n` + `Directory: \`${session.cwd}\``
      );
    },

    onSessionEnd: async (sessionId) => {
      const tracking = activeSessions.get(sessionId);
      const projectName = tracking?.projectName || sessionId;

      activeSessions.delete(sessionId);
      sessionMessageBuffers.delete(sessionId);

      // If primary session ended, clear it
      if (primarySessionId === sessionId) {
        primarySessionId = null;
      }

      // If current session ended, clear it
      if (currentSessionId === sessionId) {
        currentSessionId = null;
      }

      await sendMessage(`Session ended: ${projectName}`);
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

      // Buffer message for cross-project context
      if (!sessionMessageBuffers.has(sessionId)) {
        sessionMessageBuffers.set(sessionId, []);
      }
      const buffer = sessionMessageBuffers.get(sessionId)!;
      buffer.push({ role, content, timestamp: new Date() });
      if (buffer.length > MESSAGE_BUFFER_SIZE) {
        buffer.splice(0, buffer.length - MESSAGE_BUFFER_SIZE);
      }

      if (role === 'user') {
        const contentKey = content.trim();
        if (telegramSentMessages.has(contentKey)) {
          telegramSentMessages.delete(contentKey);
          return;
        }
        const userPrefix = `_User (${tracking.projectName}):_`;
        await sendChunkedMessage(content, userPrefix, { disable_notification: true });
      } else {
        await sendChunkedMessage(content, getSessionPrefix(sessionId));

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
      await sendMessage(`${getSessionPrefix(sessionId)} *Tasks:*\n${todosText}`);
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

      await sendMessage(`${getSessionPrefix(sessionId)} ${status}`);
    },
  });

  // Load registered projects from ~/.afk-code/projects.yaml
  async function loadProjects(): Promise<Map<string, string>> {
    const projects = new Map<string, string>();
    try {
      const content = await readFile(`${AFK_CODE_DIR}/projects.yaml`, 'utf-8');
      const parsed = parseYaml(content);
      if (parsed?.projects) {
        for (const [name, path] of Object.entries(parsed.projects)) {
          const expanded = (path as string).replace(/^~/, homedir());
          projects.set(name, expanded);
        }
      }
    } catch {
      // File not found or parse error
    }
    return projects;
  }

  // Ensure tmux 'afk' session exists
  async function ensureTmuxSession(): Promise<void> {
    try {
      await execAsync('tmux has-session -t afk');
    } catch {
      await execAsync('tmux new-session -d -s afk -n main');
    }
  }

  // Start a Claude Code session in a tmux window
  async function createSessionInTmux(
    name: string,
    dir: string,
    continueFlag: boolean
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const continueArg = continueFlag ? ' --continue' : '';
      const escapedDir = dir.replace(/'/g, "'\\''");
      const cmd = `cd '${escapedDir}' && source ~/.nvm/nvm.sh && afk-code run -- claude --dangerously-skip-permissions${continueArg}`;
      const escapedCmd = cmd.replace(/'/g, "'\\''");
      await execAsync(`tmux new-window -t afk -n '${name}' '${escapedCmd}'`);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  // Get session prefix for messages (always show project name)
  function getSessionPrefix(sessionId: string): string {
    const tracking = activeSessions.get(sessionId);
    const name = tracking?.projectName || 'unknown';
    return `_Claude Code (${name}):_`;
  }

  function getOtherSessionsSummary(excludeSessionId: string): string {
    const summaries: string[] = [];
    for (const [sessionId, messages] of sessionMessageBuffers.entries()) {
      if (sessionId === excludeSessionId || messages.length === 0) continue;
      const tracking = activeSessions.get(sessionId);
      if (!tracking) continue;
      const projectName = tracking.projectName;
      const recent = messages.slice(-5).map(m => {
        const role = m.role === 'user' ? 'User' : 'Claude';
        const truncated = m.content.length > 200
          ? m.content.substring(0, 200) + '...'
          : m.content;
        return `  ${role}: ${truncated}`;
      }).join('\n');
      summaries.push(`[${projectName}]\n${recent}`);
    }
    if (summaries.length === 0) return '';
    return '\n---\n他のアクティブプロジェクトの最近のやりとり:\n' + summaries.join('\n\n');
  }

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

    // Fallback to most recent session
    if (activeSessions.size > 1) {
      return getMostRecentSession();
    }

    return null;
  }

  // Find session by project name or by matching CWD against projects.yaml path
  async function getSessionByProjectName(name: string): Promise<SessionTracking | null> {
    const nameLower = name.toLowerCase();
    // Exact project name match
    for (const tracking of activeSessions.values()) {
      if (tracking.projectName.toLowerCase() === nameLower) {
        return tracking;
      }
    }
    // Partial project name match
    for (const tracking of activeSessions.values()) {
      if (tracking.projectName.toLowerCase().startsWith(nameLower)) {
        return tracking;
      }
    }
    // CWD-based match: check if any active session's cwd matches the project path
    const projects = await loadProjects();
    const projectDir = projects.get(name);
    if (projectDir) {
      for (const tracking of activeSessions.values()) {
        const session = sessionManager.getSession(tracking.sessionId);
        if (session && (session.cwd === projectDir || session.cwd.startsWith(projectDir + '/'))) {
          // Fix the projectName for future lookups
          tracking.projectName = name;
          return tracking;
        }
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
      // Heartbeat/Cron always targets the primary session
      if (primarySessionId && activeSessions.has(primarySessionId)) {
        return primarySessionId;
      }
      return null;
    },
    isSessionBusy: (sessionId: string) => sessionManager.isSessionBusy(sessionId),
    notify: (message: string) => {
      sendMessage(message, 'Markdown', { disable_notification: true });
    },
    getOtherSessionsSummary: (excludeSessionId: string) =>
      getOtherSessionsSummary(excludeSessionId),
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
      await ctx.reply('No active sessions. Use `/switch <project>` to start one.', { parse_mode: 'Markdown' });
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

    // Resolve target session for control commands (interrupt, compact, etc.)
    let targetSession = getCurrentSession();

    switch (command.toLowerCase()) {
      case '/start': {
        await ctx.reply(
          `*AFK Code Telegram Bot*\n\n` +
            `This bot lets you monitor and interact with Claude Code sessions.\n` +
            `Heartbeat and Cron scheduler are active.\n\n` +
            `Use \`/switch <project>\` to start or switch sessions.\n\n` +
            `Type /help for available commands.`,
          { parse_mode: 'Markdown' }
        );
        break;
      }

      case '/switch':
      case '/select': {
        if (!sessionArg) {
          // Show projects list with status
          const projects = await loadProjects();
          if (projects.size === 0) {
            await ctx.reply('No projects configured.\nEdit `~/.afk-code/projects.yaml`', { parse_mode: 'Markdown' });
            return;
          }
          const current = getCurrentSession();
          const lines: string[] = [];
          for (const [name] of projects.entries()) {
            const session = await getSessionByProjectName(name);
            const isActive = !!session;
            const isCurrent = current && session && session.sessionId === current.sessionId;
            const isPrimary = session && session.sessionId === primarySessionId;
            const status = isActive ? '🟢' : '⚪';
            const markers = [
              isCurrent ? '← current' : '',
              isPrimary ? '⭐' : '',
            ].filter(Boolean).join(' ');
            lines.push(`${status} \`${name}\`${markers ? ` ${markers}` : ''}`);
          }
          const list = lines.join('\n');
          await ctx.reply(`*Projects:*\n${list}\n\nUse: \`/switch <project>\`\n⭐ = heartbeat/cron target`, { parse_mode: 'Markdown' });
          return;
        }

        const newFlag = args.includes('--new');
        const continueFlag = !newFlag; // Default: continue. --new for fresh session
        const projectName = args.filter(a => !a.startsWith('--'))[0];

        // Check if already running
        const existing = await getSessionByProjectName(projectName);
        if (existing) {
          currentSessionId = existing.sessionId;
          await ctx.reply(`Switched to: *${existing.projectName}*`, { parse_mode: 'Markdown' });
          return;
        }

        // Not running - try to start it
        const projects = await loadProjects();
        const projectDir = projects.get(projectName);
        if (!projectDir) {
          await ctx.reply(`Project not found: \`${projectName}\`\nUse \`/switch\` to see available projects.`, { parse_mode: 'Markdown' });
          return;
        }

        // Verify directory exists
        try {
          const s = await stat(projectDir);
          if (!s.isDirectory()) throw new Error('Not a directory');
        } catch {
          await ctx.reply(`Directory not found: \`${projectDir}\``, { parse_mode: 'Markdown' });
          return;
        }

        await ensureTmuxSession();

        pendingSwitchProject = projectName;
        await ctx.reply(`Starting \`${projectName}\`...${newFlag ? ' (new)' : ' (continue)'}`, { parse_mode: 'Markdown' });
        const result = await createSessionInTmux(projectName, projectDir, continueFlag);
        if (!result.ok) {
          pendingSwitchProject = null;
          await ctx.reply(`Failed: ${result.error}`);
        }
        break;
      }

      case '/projects': {
        // Alias for /switch without args
        await handleCommand(ctx, '/switch');
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
        const modelArg = args.join(' ');
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

        const primaryTracking = primarySessionId ? activeSessions.get(primarySessionId) : null;
        const targetName = primaryTracking ? primaryTracking.projectName : 'none';

        const statusLines = [
          `*Heartbeat Status*`,
          `Enabled: ${hb.enabled ? 'Yes' : 'No'}`,
          `Target: ${targetName} ⭐`,
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
          await ctx.reply('Failed to trigger Heartbeat. No primary session?');
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
            `/switch <project> - Switch/start session\n` +
            `/projects - List projects\n` +
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
            `_Messages go to the current session._\n` +
            `_⭐ = primary session (heartbeat/cron target)_`,
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
