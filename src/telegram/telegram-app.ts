import { Bot, Context, InputFile, InlineKeyboard } from 'grammy';
import { readdir, readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { basename, dirname } from 'path';
import { randomUUID } from 'crypto';
import { parse as parseYaml } from 'yaml';
import type { TelegramConfig } from './types.js';
import { SessionManager, type SessionInfo } from '../slack/session-manager.js';
import { chunkMessage, formatTodos } from '../slack/message-formatter.js';
import { extractImagePaths } from '../utils/image-extractor.js';
import { Scheduler } from '../scheduler/index.js';
import { parseJsonlTurns, copyJsonlTruncated, type ParsedTurn } from './jsonl-parser.js';

const execAsync = promisify(exec);

/** Escape Telegram Markdown special characters in dynamic content */
function escTg(text: string): string {
  return text.replace(/([*_`\[\]~\\])/g, '\\$1');
}

// Telegram has a 4096 character limit per message
const MAX_MESSAGE_LENGTH = 4000;
const AFK_CODE_DIR = `${homedir()}/.afk-code`;

interface SessionTracking {
  sessionId: string;
  sessionName: string;
  projectName: string;
  lastActivity: Date;
  inPlanMode: boolean;
}

interface SnapshotResult {
  state: 'waiting' | 'working' | 'idle' | 'error';
  summary: string;
  detail: string;
}

function analyzeScreenWithClaude(screen: string): Promise<SnapshotResult> {
  const screenSlice = screen.slice(-3000);
  const prompt = `以下のClaude Codeターミナル画面を分析してJSONのみ返してください。コードブロック・説明不要、JSONのみ。

<screen>
${screenSlice}
</screen>

次のJSONを返してください:
{"state":"...","summary":"...","detail":"..."}

state:
- waiting = Yes/No/選択肢ダイアログが表示中（ユーザー操作待ち）
- working = ファイル編集・ツール実行・API呼び出し中
- idle = 入力プロンプトが表示、次のユーザー入力待ち
- error = エラー・クラッシュ・予期しない状態

summary: 15文字以内の状態説明
detail: 40文字以内の詳細`;

  return new Promise<SnapshotResult>((resolve) => {
    let proc: ReturnType<typeof spawn> | null = null;

    const timer = setTimeout(() => {
      proc?.kill();
      resolve({ state: 'error', summary: '分析タイムアウト', detail: '30秒経過' });
    }, 30000);

    proc = spawn('claude', ['-p', prompt], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });

    proc.on('close', () => {
      clearTimeout(timer);
      try {
        const clean = stdout.trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/, '');
        const parsed = JSON.parse(clean);
        const validStates = ['waiting', 'working', 'idle', 'error'] as const;
        const state: SnapshotResult['state'] = validStates.includes(parsed.state) ? parsed.state : 'idle';
        resolve({
          state,
          summary: String(parsed.summary || '状態不明').slice(0, 20),
          detail: String(parsed.detail || '').slice(0, 50),
        });
      } catch {
        resolve({ state: 'idle', summary: '分析失敗', detail: stdout.slice(0, 50) });
      }
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      resolve({ state: 'error', summary: 'Claude CLI起動失敗', detail: err.message.slice(0, 50) });
    });
  });
}

export function createTelegramApp(config: TelegramConfig) {
  const bot = new Bot(config.botToken);

  // Catch all handler errors so they don't crash bot.start() (grammY default rethrows)
  bot.catch((err) => {
    try {
      const updateId = err.ctx?.update?.update_id ?? 'unknown';
      console.error(`[Telegram] Handler error (update_id=${updateId}):`, err.error);
    } catch {
      console.error('[Telegram] Handler error (failed to report details)');
    }
  });

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
  let userExplicitlySelected = false; // True after user has explicitly switched to a session
  let lastExplicitProjectName: string | null = null; // Project name of last explicit /switch
  let primarySessionId: string | null = null; // First session started (Heartbeat/Cron target)
  let pendingSwitchProject: string | null = null; // Project name awaiting session start
  let verboseMode = false; // Show tool calls/results in Telegram
  const planFilePaths = new Map<string, string>(); // sessionId -> last written file path during plan mode
  const waitingForPlanAction = new Set<string>(); // sessionIds waiting for ExitPlanMode user choice
  const waitingForPermission = new Set<string>(); // sessionIds waiting for permission prompt user choice
  const handledExitPlanModeIds = new Set<string>(); // dedup ExitPlanMode across JSONL re-processing

  // Fork tracking
  interface ForkInfo {
    forkSessionId: string;
    parentSessionId: string;
    parentProjectName: string;
    baseProjectName: string;    // Root project name (even for fork-of-fork)
    forkName: string;           // "R1", "R2", etc.
    forkNumber: number;
  }

  const forkRegistry = new Map<string, ForkInfo>();   // forkSessionId -> ForkInfo
  const forkCounters = new Map<string, number>();     // baseProjectName -> next number
  let pendingForkInfo: Omit<ForkInfo, 'forkSessionId'> | null = null;
  let pendingRewind: {
    sessionId: string;
    projectName: string;
    jsonlPath: string;
    cwd: string;
    turnNumber: number;
    endLineIndex: number;
  } | null = null;

  // Message queue for rate limiting (Telegram allows ~30 msg/sec but be conservative)
  const messageQueue: Array<() => Promise<void>> = [];
  let processingQueue = false;

  function drainMessageQueue() {
    messageQueue.length = 0;
    console.log('[Telegram] Message queue drained');
  }

  async function processQueue() {
    if (processingQueue) return;
    processingQueue = true;

    while (messageQueue.length > 0) {
      const fn = messageQueue.shift();
      if (fn) {
        try {
          await fn();
          console.log(`[Telegram] Message sent (queue remaining: ${messageQueue.length})`);
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
    options?: { disable_notification?: boolean; reply_markup?: any }
  ) {
    messageQueue.push(async () => {
      try {
        await bot.api.sendMessage(config.chatId, text, {
          parse_mode: parseMode,
          disable_notification: options?.disable_notification,
          reply_markup: options?.reply_markup,
        });
      } catch (err: any) {
        // If markdown fails, try without formatting
        if (parseMode && err.message?.includes('parse')) {
          await bot.api.sendMessage(config.chatId, text, {
            disable_notification: options?.disable_notification,
            reply_markup: options?.reply_markup,
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
        inPlanMode: false,
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

      // Auto-restore currentSessionId when explicitly-selected project reconnects after restart
      if (!currentSessionId && userExplicitlySelected && lastExplicitProjectName
          && projectName === lastExplicitProjectName) {
        currentSessionId = session.id;
      }

      // Handle pending fork
      if (pendingForkInfo) {
        const forkInfo: ForkInfo = { ...pendingForkInfo, forkSessionId: session.id };
        forkRegistry.set(session.id, forkInfo);
        const tracking = activeSessions.get(session.id);
        if (tracking) {
          tracking.projectName = forkInfo.forkName;
          projectName = forkInfo.forkName;
        }
        currentSessionId = session.id;
        pendingForkInfo = null;
      }

      // Handle pending rewind (switch to new session, kill old tmux window)
      if (pendingRewind) {
        currentSessionId = session.id;
        const oldTracking = activeSessions.get(pendingRewind.sessionId);
        const oldProjectName = oldTracking?.projectName || 'unknown';
        // Kill old tmux window
        try {
          await execAsync(`tmux kill-window -t afk:${oldProjectName}`);
        } catch {
          // Old window may already be gone
        }
        pendingRewind = null;
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
      const list = await buildProjectList();
      await sendMessage(
        `Session started: ${projectName}/${sessionLabel}${isPrimary}\n` + `Directory: \`${session.cwd}\`\n\n${list}`
      );
    },

    onSessionEnd: async (sessionId) => {
      const tracking = activeSessions.get(sessionId);
      const projectName = tracking?.projectName || sessionId;

      // Check if this was a fork session - auto-return to parent
      const forkInfo = forkRegistry.get(sessionId);
      let autoReturnMsg = '';
      if (currentSessionId === sessionId && forkInfo) {
        const parent = activeSessions.get(forkInfo.parentSessionId);
        if (parent) {
          currentSessionId = forkInfo.parentSessionId;
          autoReturnMsg = ` → \`${forkInfo.parentProjectName}\``;
        }
      }
      if (forkInfo) forkRegistry.delete(sessionId);

      activeSessions.delete(sessionId);
      sessionMessageBuffers.delete(sessionId);

      // If primary session ended, clear it
      if (primarySessionId === sessionId) {
        primarySessionId = null;
      }

      // If current session ended, clear it (and no auto-return happened)
      if (currentSessionId === sessionId) {
        currentSessionId = null;
        userExplicitlySelected = false;
      }

      const list = await buildProjectList();
      await sendMessage(`Session ended: ${projectName}${autoReturnMsg}\n\n${list}`);
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
      if (!tracking) {
        console.log(`[Telegram] onMessage: no tracking for session ${sessionId.slice(0, 8)}, dropping ${role} message`);
        return;
      }
      console.log(`[Telegram] onMessage: session=${sessionId.slice(0, 8)} project=${tracking.projectName} role=${role} len=${content.length}`);

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

      // Skip noise messages from Claude Code
      const trimmed = content.trim();
      if (role === 'assistant' && (
        trimmed === 'No response requested.' ||
        trimmed === 'No response requested'
      )) {
        return;
      }

      if (role === 'user') {
        const contentKey = trimmed;
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

    onToolCall: async (sessionId, tool) => {
      const tracking = activeSessions.get(sessionId);
      if (!tracking) return;

      // Track Write/Edit calls during plan mode to find plan file
      if (tracking.inPlanMode && (tool.name === 'Write' || tool.name === 'Edit') && tool.input?.file_path) {
        planFilePaths.set(sessionId, tool.input.file_path);
      }

      // Detect ExitPlanMode → read plan file + present action buttons
      if (tool.name === 'ExitPlanMode') {
        if (handledExitPlanModeIds.has(tool.id)) return;
        handledExitPlanModeIds.add(tool.id);
        const planPath = planFilePaths.get(sessionId);
        if (planPath) {
          try {
            const planContent = await readFile(planPath, 'utf-8');
            const preview = planContent.length > 3500
              ? planContent.substring(0, 3500) + '\n...(truncated)'
              : planContent;
            await sendChunkedMessage(
              `${getSessionPrefix(sessionId)} 📋 *Plan ready:*\n\`\`\`\n${escTg(preview)}\n\`\`\``
            );
          } catch (err) {
            console.error(`[Telegram] Failed to read plan file: ${planPath}`, err);
          }
        }

        // Present action buttons matching terminal prompt order:
        // ❯ 1. Yes, clear context + bypass permissions
        //   2. Yes, bypass permissions
        //   3. Yes, manually approve edits
        //   4. Type here to tell Claude what to change
        const keyboard = new InlineKeyboard()
          .text('1️⃣ Clear ctx + bypass', `plan_action_${sessionId}_1`)
          .text('2️⃣ Bypass perms', `plan_action_${sessionId}_2`)
          .text('3️⃣ Manual approve', `plan_action_${sessionId}_3`);
        waitingForPlanAction.add(sessionId);
        await sendMessage(
          `${getSessionPrefix(sessionId)} Plan ready\\. Select action or type feedback:`,
          'Markdown',
          { reply_markup: keyboard }
        );
        planFilePaths.delete(sessionId);
        return;
      }

      if (!verboseMode) return;
      const input = typeof tool.input === 'string'
        ? tool.input
        : JSON.stringify(tool.input, null, 2);
      const preview = input.length > 300 ? input.substring(0, 300) + '...' : input;
      await sendMessage(
        `${getSessionPrefix(sessionId)} 🔧 \`${tool.name}\`\n\`\`\`\n${preview}\n\`\`\``,
        'Markdown',
        { disable_notification: true }
      );
    },

    onToolResult: async (sessionId, result) => {
      if (!verboseMode) return;
      const tracking = activeSessions.get(sessionId);
      if (!tracking) return;
      const preview = result.content.length > 500
        ? result.content.substring(0, 500) + '...'
        : result.content;
      const icon = result.isError ? '❌' : '✅';
      await sendMessage(
        `${getSessionPrefix(sessionId)} ${icon} Result:\n\`\`\`\n${preview}\n\`\`\``,
        'Markdown',
        { disable_notification: true }
      );
    },

    onPlanModeChange: async (sessionId, inPlanMode) => {
      const tracking = activeSessions.get(sessionId);
      if (!tracking) return;

      tracking.inPlanMode = inPlanMode;
      if (!inPlanMode) {
        waitingForPlanAction.delete(sessionId);
        planFilePaths.delete(sessionId);
      }

      if (inPlanMode) {
        const keyboard = new InlineKeyboard()
          .text('✅ Approve Plan', `plan_approve_${sessionId}`);
        await sendMessage(
          `${getSessionPrefix(sessionId)} 📋 *Planning mode* \\- Claude is designing a solution`,
          'Markdown',
          { reply_markup: keyboard }
        );
      } else {
        await sendMessage(`${getSessionPrefix(sessionId)} 🔨 Execution mode \\- Claude is implementing`);
      }
    },

    onPermissionPrompt: async (sessionId, content) => {
      // Show recent terminal context (last few lines) so user can see what's being asked
      const lines = content.trim().split('\n').filter(Boolean);
      const preview = lines.slice(-10).join('\n');
      const keyboard = new InlineKeyboard()
        .text('1️⃣ Yes', `perm_action_${sessionId}_1`)
        .text('2️⃣ Yes + allow session', `perm_action_${sessionId}_2`)
        .row()
        .text('3️⃣ No', `perm_action_${sessionId}_3`);
      waitingForPermission.add(sessionId);
      await sendMessage(
        `${getSessionPrefix(sessionId)} 🔐 *Permission required*\n\`\`\`\n${escTg(preview)}\n\`\`\``,
        'Markdown',
        { reply_markup: keyboard }
      );
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
    } catch (err) {
      console.error('[Telegram] Failed to load projects.yaml:', err);
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

  // Check if a project directory has any previous conversations
  async function hasExistingConversation(dir: string): Promise<boolean> {
    const encodedPath = dir.replace(/[/._]/g, '-');
    const projectDir = `${homedir()}/.claude/projects/${encodedPath}`;
    try {
      const files = await readdir(projectDir);
      return files.some(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));
    } catch {
      return false;
    }
  }

  // Start a Claude Code session in a tmux window
  async function createSessionInTmux(
    name: string,
    dir: string,
    options: {
      continueFlag?: boolean;
      resumeId?: string;      // --resume <uuid>
      forkSession?: boolean;  // --fork-session
    }
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      let extraArgs = '';
      if (options.resumeId) {
        extraArgs += ` --resume ${options.resumeId}`;
        if (options.forkSession) {
          extraArgs += ' --fork-session';
        }
      } else if (options.continueFlag && await hasExistingConversation(dir)) {
        extraArgs += ' --continue';
      }
      const escapedDir = dir.replace(/'/g, "'\\''");
      const cmd = `unset CLAUDECODE; cd '${escapedDir}' && (source ~/.nvm/nvm.sh 2>/dev/null || true) && CLAUDE_HOOK_TELEGRAM=1 afk-code run --restart -- claude --dangerously-skip-permissions${extraArgs}`;
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
    const busy = sessionManager.isSessionBusy(sessionId);
    const indicator = busy ? '⏳' : '✅';
    return `${indicator} _Claude Code (${name}):_`;
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
      userExplicitlySelected = false;
    }

    // Auto-select if only one session
    if (activeSessions.size === 1) {
      return activeSessions.values().next().value ?? null;
    }

    // Fallback to most recent session (only if user has never explicitly selected)
    if (activeSessions.size > 1 && !userExplicitlySelected) {
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

  /** /rewind, /fork 用: 会話ファイルを持つセッションとそのパスを返す。
   *  watchedFile が未設定（再起動後など）の場合はファイルシステムから直接探す。 */
  async function getSessionsWithConversation(): Promise<Array<{ tracking: SessionTracking; jsonlPath: string }>> {
    const results: Array<{ tracking: SessionTracking; jsonlPath: string }> = [];
    for (const tracking of activeSessions.values()) {
      const watched = sessionManager.getWatchedFile(tracking.sessionId);
      if (watched) {
        results.push({ tracking, jsonlPath: watched });
        continue;
      }
      // Fallback: scan filesystem (e.g. after bot restart when watchedFile is not yet set)
      const sessionInfo = sessionManager.getSession(tracking.sessionId);
      if (!sessionInfo?.projectDir) continue;
      try {
        const files = await readdir(sessionInfo.projectDir);
        const jsonlFiles = files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'));
        if (jsonlFiles.length === 0) continue;
        const withStats = await Promise.all(
          jsonlFiles.map(async (f) => {
            const p = `${sessionInfo.projectDir}/${f}`;
            const s = await stat(p);
            return { path: p, mtime: s.mtimeMs };
          })
        );
        withStats.sort((a, b) => b.mtime - a.mtime);
        results.push({ tracking, jsonlPath: withStats[0].path });
      } catch {
        // projectDir not accessible
      }
    }
    return results;
  }

  async function buildProjectList(): Promise<string> {
    const projects = await loadProjects();
    if (projects.size === 0) return 'No projects configured.';
    const current = getCurrentSession();
    const lines: string[] = [];
    let num = 1;
    for (const [name] of projects.entries()) {
      const session = await getSessionByProjectName(name);
      const isActive = !!session;
      const isCurrent = current && session && session.sessionId === current.sessionId;
      const isPrimary = session && session.sessionId === primarySessionId;
      const isBusy = session ? sessionManager.isSessionBusy(session.sessionId) : false;
      const isPlanMode = session ? activeSessions.get(session.sessionId)?.inPlanMode : false;
      const status = isActive ? (isBusy ? '⏳' : '🟢') : '⚪';
      const markers = [
        isCurrent ? '← current' : '',
        isPrimary ? '⭐' : '',
        isPlanMode ? '📋plan' : '',
      ].filter(Boolean).join(' ');
      lines.push(`${num}. ${status} \`${name}\`${markers ? ` ${markers}` : ''}`);
      num++;
      // Recursive tree display of forks
      const renderForkTree = (parentSessionId: string, depth: number) => {
        for (const [, fi] of forkRegistry) {
          if (fi.parentSessionId !== parentSessionId) continue;
          if (!activeSessions.get(fi.forkSessionId)) continue;
          const isForkCurrent = currentSessionId === fi.forkSessionId;
          const isForkBusy = sessionManager.isSessionBusy(fi.forkSessionId);
          const forkStatus = isForkBusy ? '⏳' : '🟢';
          const indent = '   '.repeat(depth);
          lines.push(`${indent}${num}. ${forkStatus} \`${fi.forkName}\`${isForkCurrent ? ' ← current' : ''}`);
          num++;
          renderForkTree(fi.forkSessionId, depth + 1);
        }
      };
      if (session) renderForkTree(session.sessionId, 1);
    }
    return `*Projects:*\n${lines.join('\n')}\n⭐ = heartbeat/cron target`;
  }

  async function resolveProjectByNumber(n: number): Promise<string | null> {
    const projects = await loadProjects();
    let num = 1;
    let found: string | null = null;
    const walkForkTree = (parentSessionId: string): boolean => {
      for (const [, fi] of forkRegistry) {
        if (fi.parentSessionId !== parentSessionId) continue;
        if (!activeSessions.get(fi.forkSessionId)) continue;
        if (num === n) { found = fi.forkName; return true; }
        num++;
        if (walkForkTree(fi.forkSessionId)) return true;
      }
      return false;
    };
    for (const [name] of projects.entries()) {
      if (num === n) return name;
      num++;
      const session = await getSessionByProjectName(name);
      if (session) {
        if (walkForkTree(session.sessionId)) return found;
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

  // Handle InlineKeyboard callback queries (rewind/fork buttons)
  bot.on('callback_query:data', async (ctx) => {
    if (ctx.chat?.id.toString() !== config.chatId) return;

    const data = ctx.callbackQuery.data;
    try { await ctx.answerCallbackQuery(); } catch { /* query may be too old after bot restart */ }

    // rewind_select_N → show confirmation
    if (data.startsWith('rewind_select_')) {
      const turnNumber = parseInt(data.replace('rewind_select_', ''), 10);
      const current = getCurrentSession();
      if (!current) {
        await ctx.reply('No active session.');
        return;
      }
      const jsonlPath = sessionManager.getWatchedFile(current.sessionId);
      if (!jsonlPath) {
        await ctx.reply('JSONL file not found.');
        return;
      }
      try {
        const turns = await parseJsonlTurns(jsonlPath);
        const turn = turns.find((t) => t.turnNumber === turnNumber);
        if (!turn) {
          await ctx.reply(`Turn ${turnNumber} not found. Max: ${turns.length}`);
          return;
        }
        const session = sessionManager.getSession(current.sessionId);

        // Store pending rewind info
        pendingRewind = {
          sessionId: current.sessionId,
          projectName: current.projectName,
          jsonlPath,
          cwd: session?.cwd || '',
          turnNumber,
          endLineIndex: turn.endLineIndex,
        };

        const keyboard = new InlineKeyboard()
          .text('Rewind', 'rewind_confirm')
          .text('Fork from here', 'rewind_fork')
          .text('Cancel', 'rewind_cancel');

        await ctx.reply(
          `Rewind to turn ${turnNumber}?\n> ${turn.userMessage}`,
          { reply_markup: keyboard }
        );
      } catch (err: any) {
        await ctx.reply(`Error: ${err.message}`);
      }
      return;
    }

    // rewind_confirm → execute rewind (fork-based, near-zero downtime)
    if (data === 'rewind_confirm') {
      if (!pendingRewind) {
        await ctx.reply('No pending rewind.');
        return;
      }
      const { sessionId, projectName, jsonlPath, cwd, endLineIndex } = pendingRewind;

      try {
        // Create truncated copy with new UUID
        const newUuid = randomUUID();
        const projectDir = dirname(jsonlPath);
        const newJsonlPath = `${projectDir}/${newUuid}.jsonl`;
        await copyJsonlTruncated(jsonlPath, newJsonlPath, endLineIndex);

        // Set up as pending rewind (onSessionStart will handle cleanup)
        pendingSwitchProject = projectName;

        await ctx.reply(`Rewinding \`${projectName}\` to turn ${pendingRewind.turnNumber}...`, { parse_mode: 'Markdown' });
        await ensureTmuxSession();
        const result = await createSessionInTmux(projectName, cwd, {
          resumeId: newUuid,
          forkSession: true,
        });
        if (!result.ok) {
          pendingRewind = null;
          pendingSwitchProject = null;
          await ctx.reply(`Rewind failed: ${result.error}`);
        }
      } catch (err: any) {
        pendingRewind = null;
        await ctx.reply(`Rewind error: ${err.message}`);
      }
      return;
    }

    // rewind_fork → fork from selected turn point
    if (data === 'rewind_fork') {
      if (!pendingRewind) {
        await ctx.reply('No pending rewind.');
        return;
      }
      const { sessionId, projectName, jsonlPath, cwd, endLineIndex } = pendingRewind;
      pendingRewind = null;

      try {
        // Determine fork name
        const currentTracking = activeSessions.get(sessionId);
        const existingFork = forkRegistry.get(sessionId);
        const baseProject = existingFork?.baseProjectName || projectName;
        const nextNum = (forkCounters.get(baseProject) || 0) + 1;
        forkCounters.set(baseProject, nextNum);
        const forkName = `${baseProject}${nextNum}`;

        // Create truncated copy with new UUID
        const newUuid = randomUUID();
        const projectDir = dirname(jsonlPath);
        const newJsonlPath = `${projectDir}/${newUuid}.jsonl`;
        await copyJsonlTruncated(jsonlPath, newJsonlPath, endLineIndex);

        // Pre-claim the new JSONL so parent session's watcher won't steal it
        sessionManager.claimFile(newJsonlPath);

        pendingForkInfo = {
          parentSessionId: sessionId,
          parentProjectName: projectName,
          baseProjectName: baseProject,
          forkName,
          forkNumber: nextNum,
        };

        await ctx.reply(`Forking \`${projectName}\` → \`${forkName}\` from turn...`, { parse_mode: 'Markdown' });
        await ensureTmuxSession();
        const result = await createSessionInTmux(forkName, cwd, {
          resumeId: newUuid,
          forkSession: true,
        });
        if (!result.ok) {
          pendingForkInfo = null;
          sessionManager.claimFile(newJsonlPath); // Already claimed, no-op but safe
          await ctx.reply(`Fork failed: ${result.error}`);
        }
      } catch (err: any) {
        await ctx.reply(`Fork error: ${err.message}`);
      }
      return;
    }

    // rewind_cancel
    if (data === 'rewind_cancel') {
      pendingRewind = null;
      await ctx.reply('Rewind cancelled.');
      return;
    }

    // plan_approve_{sessionId} → approve plan (Shift+Tab)
    if (data.startsWith('plan_approve_')) {
      const sessionId = data.replace('plan_approve_', '');
      const tracking = activeSessions.get(sessionId);
      if (!tracking) {
        await ctx.reply('Session not found.');
        return;
      }
      if (!tracking.inPlanMode) {
        await ctx.reply('Session is not in plan mode.');
        return;
      }
      const sent = sessionManager.sendInput(sessionId, '\x1b[Z');
      await ctx.reply(sent ? '✅ Plan approved' : 'Failed - session not connected.');
      return;
    }

    // plan_action_{sessionId}_{number} → navigate interactive prompt with arrow keys + Enter
    if (data.startsWith('plan_action_')) {
      const rest = data.replace('plan_action_', '');
      const lastUnderscore = rest.lastIndexOf('_');
      const sessionId = rest.substring(0, lastUnderscore);
      const choice = parseInt(rest.substring(lastUnderscore + 1), 10);
      const labels: Record<number, string> = {
        1: '✅ Clear context + bypass permissions',
        2: '✅ Bypass permissions',
        3: '✅ Manual approve',
      };
      // Interactive prompt uses arrow keys: option 1 is already selected (❯),
      // so send (choice-1) Down arrows followed by Enter (\r)
      const downArrow = '\x1b[B';
      const input = downArrow.repeat(choice - 1) + '\r';
      waitingForPlanAction.delete(sessionId);
      const sent = sessionManager.sendInput(sessionId, input);
      await ctx.reply(sent ? `${labels[choice] || `Option ${choice}`}` : 'Failed - session not connected.');
      return;
    }

    // perm_action_{sessionId}_{number} → respond to permission prompt
    if (data.startsWith('perm_action_')) {
      const rest = data.replace('perm_action_', '');
      const lastUnderscore = rest.lastIndexOf('_');
      const sessionId = rest.substring(0, lastUnderscore);
      const choice = parseInt(rest.substring(lastUnderscore + 1), 10);
      const labels: Record<number, string> = {
        1: '✅ Yes',
        2: '✅ Yes + allow for session',
        3: '❌ No',
      };
      // Permission prompt: option 1 (Yes) is already selected (❯),
      // so send (choice-1) Down arrows followed by Enter (\r)
      const downArrow = '\x1b[B';
      const input = downArrow.repeat(choice - 1) + '\r';
      waitingForPermission.delete(sessionId);
      const sent = sessionManager.sendInput(sessionId, input);
      await ctx.reply(sent ? `${labels[choice] || `Option ${choice}`}` : 'Failed - session not connected.');
      return;
    }

    // snap_action_{sessionId}_{action} → snapshot result action button
    if (data.startsWith('snap_action_')) {
      const rest = data.replace('snap_action_', '');
      const lastUnderscore = rest.lastIndexOf('_');
      const sessionId = rest.substring(0, lastUnderscore);
      const action = rest.substring(lastUnderscore + 1);
      if (action === 'ctrlc') {
        const sent = sessionManager.sendInput(sessionId, '\x03');
        await ctx.reply(sent ? '⛔ Ctrl+C 送信' : '失敗 - セッションが接続されていません');
      }
      await ctx.answerCallbackQuery();
      return;
    }

    // key_* → send navigation key sequences
    if (data.startsWith('key_')) {
      // Screen capture
      if (data === 'key_screen') {
        const current = getCurrentSession();
        if (!current) {
          await ctx.answerCallbackQuery({ text: 'No active session.' });
          return;
        }
        const screen = await sessionManager.captureScreen(current.sessionId);
        if (screen === null) {
          await ctx.answerCallbackQuery({ text: 'Failed to capture screen.' });
          return;
        }
        const trimmed = screen.slice(-3000);
        await ctx.reply(`\`\`\`\n${trimmed}\n\`\`\``, { parse_mode: 'Markdown' });
        await ctx.answerCallbackQuery();
        return;
      }

      // Snapshot analysis
      if (data === 'key_snapshot') {
        const current = getCurrentSession();
        if (!current) {
          await ctx.answerCallbackQuery({ text: 'No active session.' });
          return;
        }
        await ctx.answerCallbackQuery();
        const loadingMsg = await ctx.reply('⏳ スクリーン分析中...');
        try {
          const screen = await sessionManager.captureScreen(current.sessionId);
          if (!screen) {
            await bot.api.editMessageText(config.chatId, loadingMsg.message_id, '❌ 画面キャプチャ失敗');
            return;
          }
          const result = await analyzeScreenWithClaude(screen);
          const stateEmoji: Record<string, string> = {
            waiting: '⏳', working: '🟢', idle: '💬', error: '⚠️',
          };
          const stateLabel: Record<string, string> = {
            waiting: 'WAITING ダイアログ待機',
            working: 'WORKING 処理中',
            idle: 'IDLE 入力待ち',
            error: 'ERROR エラー',
          };
          const emoji = stateEmoji[result.state] || '❓';
          const label = stateLabel[result.state] || result.state.toUpperCase();
          const textLines = [
            `${emoji} *${escTg(current.projectName)}* | ${label}`,
            `*${escTg(result.summary)}*`,
          ];
          if (result.detail) textLines.push(`_${escTg(result.detail)}_`);
          const kb = new InlineKeyboard();
          if (result.state === 'waiting') {
            kb
              .text('1️⃣ Yes', `perm_action_${current.sessionId}_1`)
              .text('2️⃣ Yes+allow', `perm_action_${current.sessionId}_2`)
              .text('3️⃣ No', `perm_action_${current.sessionId}_3`)
              .row();
          }
          if (result.state === 'working' || result.state === 'error') {
            kb.text('⛔ Ctrl+C', `snap_action_${current.sessionId}_ctrlc`).row();
          }
          kb.text('📷 最新画面', 'key_screen');
          await bot.api.editMessageText(
            config.chatId,
            loadingMsg.message_id,
            textLines.join('\n'),
            { parse_mode: 'Markdown', reply_markup: kb }
          );
        } catch (err: any) {
          await bot.api.editMessageText(
            config.chatId,
            loadingMsg.message_id,
            `❌ エラー: ${escTg(err.message || String(err))}`,
            { parse_mode: 'Markdown' }
          );
        }
        return;
      }

      // Navigation keys
      const keyMap: Record<string, string> = {
        key_up:    '\x1b[A',
        key_down:  '\x1b[B',
        key_left:  '\x1b[D',
        key_right: '\x1b[C',
        key_esc:   '\x1b',
        key_enter: '\r',
      };
      const seq = keyMap[data];
      if (seq) {
        const current = getCurrentSession();
        if (current) {
          sessionManager.sendInput(current.sessionId, seq);
        }
      }
      await ctx.answerCallbackQuery();
      return;
    }

    // switch_select_{projectName} → switch to project
    if (data.startsWith('switch_select_')) {
      const projectName = data.replace('switch_select_', '');
      const existing = await getSessionByProjectName(projectName);
      if (existing) {
        currentSessionId = existing.sessionId;
        userExplicitlySelected = true;
        lastExplicitProjectName = existing.projectName;
        const list = await buildProjectList();
        await ctx.reply(`Switched to: *${existing.projectName}*\n\n${list}`, { parse_mode: 'Markdown' });
      } else {
        const projects = await loadProjects();
        const projectDir = projects.get(projectName);
        if (!projectDir) {
          await ctx.reply(`Project not found: \`${projectName}\``, { parse_mode: 'Markdown' });
          return;
        }
        await ensureTmuxSession();
        userExplicitlySelected = true;
        lastExplicitProjectName = projectName;
        pendingSwitchProject = projectName;
        await ctx.reply(`Starting \`${projectName}\`... (continue)`, { parse_mode: 'Markdown' });
        const result = await createSessionInTmux(projectName, projectDir, { continueFlag: true });
        if (!result.ok) {
          pendingSwitchProject = null;
          await ctx.reply(`Failed: ${result.error}`);
        }
      }
      return;
    }

    // model_select_{name} → switch model
    if (data.startsWith('model_select_')) {
      const modelName = data.replace('model_select_', '');
      const current = getCurrentSession();
      if (!current) {
        await ctx.reply('No active session.');
        return;
      }
      const sent = sessionManager.sendInput(current.sessionId, `/model ${modelName}\r`);
      await ctx.reply(sent ? `Sent /model ${modelName}` : 'Failed - session not connected.');
      return;
    }
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

    // If waiting for permission prompt, clear the state (user chose to type instead)
    if (waitingForPermission.has(current.sessionId)) {
      waitingForPermission.delete(current.sessionId);
    }

    // If waiting for ExitPlanMode action, treat text as feedback (option 4)
    if (waitingForPlanAction.has(current.sessionId)) {
      waitingForPlanAction.delete(current.sessionId);
      const downArrow = '\x1b[B';
      // Select option 4 (3x Down + Enter), then type feedback after a short delay
      const selectOption4 = downArrow.repeat(3) + '\r';
      sessionManager.sendInput(current.sessionId, selectOption4);
      setTimeout(() => {
        sessionManager.sendInput(current.sessionId, text + '\r');
      }, 500);
      await ctx.reply('📝 Sending feedback...');
      return;
    }

    telegramSentMessages.add(text.trim());

    // \r = Enter in PTY raw mode. Send a second \r after 1s in case
    // Claude Code's input wasn't ready to receive the first one.
    const sent = sessionManager.sendInput(current.sessionId, text + '\r');
    if (!sent) {
      telegramSentMessages.delete(text.trim());
      await ctx.reply('Failed to send input - session not connected.');
    } else {
      setTimeout(() => {
        sessionManager.sendInput(current.sessionId, '\r');
      }, 1000);
    }
  });

  async function handleCommand(ctx: Context, text: string) {
    const [rawCommand, ...args] = text.split(' ');
    // Strip @botname suffix (Telegram appends it in groups/sometimes in DMs)
    const command = rawCommand.toLowerCase().replace(/@\S+$/, '');
    const sessionArg = args[0];

    // Resolve target session for control commands (interrupt, compact, etc.)
    let targetSession = getCurrentSession();

    switch (command) {
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

      case '/s':
      case '/switch':
      case '/select': {
        if (!sessionArg) {
          const list = await buildProjectList();
          const projects = await loadProjects();
          const keyboard = new InlineKeyboard();
          const allNames: string[] = [];
          for (const [name] of projects.entries()) {
            allNames.push(name);
            for (const [, fi] of forkRegistry) {
              if (fi.baseProjectName === name && activeSessions.has(fi.forkSessionId)) {
                allNames.push(fi.forkName);
              }
            }
          }
          for (let i = 0; i < allNames.length; i++) {
            keyboard.text(allNames[i], `switch_select_${allNames[i]}`);
            if ((i + 1) % 3 === 0) keyboard.row();
          }
          await ctx.reply(`${list}\n\nUse: \`/switch <project>\``, { parse_mode: 'Markdown', reply_markup: keyboard });
          return;
        }

        const newFlag = args.includes('--new');
        const continueFlag = !newFlag; // Default: continue. --new for fresh session
        let projectName = args.filter(a => !a.startsWith('--'))[0];

        // Support numeric argument: /switch 1, /switch 2, etc.
        if (/^\d+$/.test(projectName)) {
          const resolved = await resolveProjectByNumber(parseInt(projectName, 10));
          if (!resolved) {
            await ctx.reply(`Invalid number: \`${projectName}\`\nUse \`/switch\` to see available projects.`, { parse_mode: 'Markdown' });
            return;
          }
          projectName = resolved;
        }

        // Check if already running
        const existing = await getSessionByProjectName(projectName);
        if (existing) {
          currentSessionId = existing.sessionId;
          userExplicitlySelected = true;
          lastExplicitProjectName = existing.projectName;
          const list = await buildProjectList();
          await ctx.reply(`Switched to: *${existing.projectName}*\n\n${list}`, { parse_mode: 'Markdown' });
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

        userExplicitlySelected = true;
        lastExplicitProjectName = projectName;
        pendingSwitchProject = projectName;
        await ctx.reply(`Starting \`${projectName}\`...${newFlag ? ' (new)' : ' (continue)'}`, { parse_mode: 'Markdown' });
        const result = await createSessionInTmux(projectName, projectDir, { continueFlag });
        if (!result.ok) {
          pendingSwitchProject = null;
          await ctx.reply(`Failed: ${result.error}`);
        }
        break;
      }

      case '/rewind': {
        if (sessionArg) {
          const found = await getSessionByProjectName(sessionArg);
          if (found) targetSession = found;
        }
        if (!targetSession) {
          await ctx.reply('No active session.');
          return;
        }
        let jsonlPath = sessionManager.getWatchedFile(targetSession.sessionId);
        if (!jsonlPath) {
          const withConv = await getSessionsWithConversation();
          const selfEntry = withConv.find(({ tracking }) => tracking.sessionId === targetSession!.sessionId);
          if (selfEntry) {
            // Filesystem fallback found the file for the requested session
            jsonlPath = selfEntry.jsonlPath;
          } else if (withConv.length === 0) {
            await ctx.reply('No conversations found in any session.');
            return;
          } else if (withConv.length === 1) {
            targetSession = withConv[0].tracking;
            jsonlPath = withConv[0].jsonlPath;
            await ctx.reply(`\`${targetSession.projectName}\` に自動切り替えました。`, { parse_mode: 'Markdown' });
          } else {
            const list = withConv.map(({ tracking: t }) => `• \`${t.projectName}\` → /rewind ${t.projectName}`).join('\n');
            await ctx.reply(
              `\`${targetSession.projectName}\` has no conversation yet.\n\nSessions with conversations:\n${list}`,
              { parse_mode: 'Markdown' }
            );
            return;
          }
        }
        let recentTurns: ParsedTurn[];
        try {
          const turns = await parseJsonlTurns(jsonlPath);
          if (turns.length === 0) {
            await ctx.reply('No turns found in conversation.');
            return;
          }
          recentTurns = turns.slice(-10);
        } catch (err: any) {
          await ctx.reply(`Error parsing JSONL: ${err.message}`);
          break;
        }

        {
          const lines = recentTurns.map((t) => {
            const time = new Date(t.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
            const tools = t.toolCalls.length > 0 ? ` [${escTg(t.toolCalls.join(', '))}]` : '';
            return `${t.turnNumber}. ${time} ${escTg(t.userMessage)}${tools}`;
          });

          const keyboard = new InlineKeyboard();
          for (const t of recentTurns) {
            keyboard.text(`${t.turnNumber}`, `rewind_select_${t.turnNumber}`);
          }

          const msg = `*Recent turns (${escTg(targetSession.projectName)}):*\n${lines.join('\n')}`;
          try {
            await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: keyboard });
          } catch {
            await ctx.reply(msg.replace(/([*_`\[\]~\\])/g, ''), { reply_markup: keyboard });
          }
        }
        break;
      }

      case '/f':
      case '/fork': {
        if (sessionArg) {
          const found = await getSessionByProjectName(sessionArg);
          if (found) targetSession = found;
        }
        if (!targetSession) {
          await ctx.reply('No active session.');
          return;
        }
        let jsonlPath = sessionManager.getWatchedFile(targetSession.sessionId);
        if (!jsonlPath) {
          const withConv = await getSessionsWithConversation();
          const selfEntry = withConv.find(({ tracking }) => tracking.sessionId === targetSession!.sessionId);
          if (selfEntry) {
            jsonlPath = selfEntry.jsonlPath;
          } else if (withConv.length === 0) {
            await ctx.reply('No conversations found in any session.');
            return;
          } else if (withConv.length === 1) {
            targetSession = withConv[0].tracking;
            jsonlPath = withConv[0].jsonlPath;
            await ctx.reply(`\`${targetSession.projectName}\` に自動切り替えました。`, { parse_mode: 'Markdown' });
          } else {
            const list = withConv.map(({ tracking: t }) => `• \`${t.projectName}\` → /fork ${t.projectName}`).join('\n');
            await ctx.reply(
              `\`${targetSession.projectName}\` has no conversation yet.\n\nSessions with conversations:\n${list}`,
              { parse_mode: 'Markdown' }
            );
            return;
          }
        }
        const session = sessionManager.getSession(targetSession.sessionId);
        if (!session) {
          await ctx.reply('Session not found.');
          return;
        }

        // Determine base project name and fork name
        const existingFork = forkRegistry.get(targetSession.sessionId);
        const baseProject = existingFork?.baseProjectName || targetSession.projectName;
        const nextNum = (forkCounters.get(baseProject) || 0) + 1;
        forkCounters.set(baseProject, nextNum);
        const forkName = `${baseProject}${nextNum}`;

        // Extract UUID from JSONL filename
        const jsonlFilename = basename(jsonlPath);
        const resumeId = jsonlFilename.replace('.jsonl', '');

        pendingForkInfo = {
          parentSessionId: targetSession.sessionId,
          parentProjectName: targetSession.projectName,
          baseProjectName: baseProject,
          forkName,
          forkNumber: nextNum,
        };

        await ensureTmuxSession();
        await ctx.reply(`Forking \`${targetSession.projectName}\` → \`${forkName}\`...`, { parse_mode: 'Markdown' });
        const result = await createSessionInTmux(forkName, session.cwd, {
          resumeId,
          forkSession: true,
        });
        if (!result.ok) {
          pendingForkInfo = null;
          await ctx.reply(`Fork failed: ${result.error}`);
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

      case '//': {
        if (!targetSession) {
          await ctx.reply('No active session.');
          return;
        }
        if (messageQueue.length > 50) {
          drainMessageQueue();
          await ctx.reply('Queue flooded — drained.');
        }
        const sent = sessionManager.sendInput(targetSession.sessionId, '\x1b');
        await ctx.reply(sent ? 'Sent interrupt (Escape)' : 'Failed - session not connected.');
        break;
      }

      case '/': {
        const current = getCurrentSession();
        if (!current) { await ctx.reply('No active session.'); return; }
        const keyboard = new InlineKeyboard()
          .text('↑', 'key_up').row()
          .text('←', 'key_left').text('↓', 'key_down').text('→', 'key_right').row()
          .text('ESC', 'key_esc').text('↵ Enter', 'key_enter').text('📷', 'key_screen').text('🔍', 'key_snapshot');
        await ctx.reply('🎮 Key Input', { reply_markup: keyboard });
        break;
      }

      case '/kill': {
        if (!targetSession) {
          await ctx.reply('No active session.');
          return;
        }
        const killName = targetSession.projectName;
        const killSessionId = targetSession.sessionId;
        await ctx.reply(`Killing session \`${killName}\`...`, { parse_mode: 'Markdown' });
        try {
          await execAsync(`tmux kill-window -t afk:${killName}`);
        } catch { /* window may already be gone */ }

        // Drain any pending messages immediately
        drainMessageQueue();

        // Immediate cleanup (onSessionEnd may fire later but is idempotent)
        const killForkInfo = forkRegistry.get(killSessionId);
        let killAutoReturn = '';
        if (currentSessionId === killSessionId && killForkInfo) {
          const parent = activeSessions.get(killForkInfo.parentSessionId);
          if (parent) {
            currentSessionId = killForkInfo.parentSessionId;
            killAutoReturn = ` → \`${killForkInfo.parentProjectName}\``;
          }
        }
        if (killForkInfo) forkRegistry.delete(killSessionId);
        activeSessions.delete(killSessionId);
        sessionMessageBuffers.delete(killSessionId);
        if (primarySessionId === killSessionId) primarySessionId = null;
        if (currentSessionId === killSessionId) currentSessionId = null;

        const killList = await buildProjectList();
        await sendMessage(`Session ended: ${killName}${killAutoReturn}\n\n${killList}`);
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

      case '/sn':
      case '/snapshot': {
        if (!targetSession) {
          await ctx.reply('No active session.');
          return;
        }
        const snSession = targetSession;
        const loadingMsg = await ctx.reply('⏳ スクリーン分析中...');
        try {
          const screen = await sessionManager.captureScreen(snSession.sessionId);
          if (!screen) {
            await bot.api.editMessageText(config.chatId, loadingMsg.message_id, '❌ 画面キャプチャ失敗');
            break;
          }
          const result = await analyzeScreenWithClaude(screen);
          const stateEmoji: Record<string, string> = {
            waiting: '⏳', working: '🟢', idle: '💬', error: '⚠️',
          };
          const stateLabel: Record<string, string> = {
            waiting: 'WAITING ダイアログ待機',
            working: 'WORKING 処理中',
            idle: 'IDLE 入力待ち',
            error: 'ERROR エラー',
          };
          const emoji = stateEmoji[result.state] || '❓';
          const label = stateLabel[result.state] || result.state.toUpperCase();
          const textLines = [
            `${emoji} *${escTg(snSession.projectName)}* | ${label}`,
            `*${escTg(result.summary)}*`,
          ];
          if (result.detail) textLines.push(`_${escTg(result.detail)}_`);
          const keyboard = new InlineKeyboard();
          if (result.state === 'waiting') {
            keyboard
              .text('1️⃣ Yes', `perm_action_${snSession.sessionId}_1`)
              .text('2️⃣ Yes+allow', `perm_action_${snSession.sessionId}_2`)
              .text('3️⃣ No', `perm_action_${snSession.sessionId}_3`)
              .row();
          }
          if (result.state === 'working' || result.state === 'error') {
            keyboard.text('⛔ Ctrl+C', `snap_action_${snSession.sessionId}_ctrlc`).row();
          }
          keyboard.text('📷 最新画面', 'key_screen');
          await bot.api.editMessageText(
            config.chatId,
            loadingMsg.message_id,
            textLines.join('\n'),
            { parse_mode: 'Markdown', reply_markup: keyboard }
          );
        } catch (err: any) {
          await bot.api.editMessageText(
            config.chatId,
            loadingMsg.message_id,
            `❌ エラー: ${escTg(err.message || String(err))}`,
            { parse_mode: 'Markdown' }
          );
        }
        break;
      }

      case '/compact': {
        if (!targetSession) {
          await ctx.reply('No active session.');
          return;
        }
        const sent = sessionManager.sendInput(targetSession.sessionId, '/compact\r');
        await ctx.reply(sent ? 'Sent /compact' : 'Failed - session not connected.');
        break;
      }

      case '/clear': {
        if (!targetSession) {
          await ctx.reply('No active session.');
          return;
        }
        const sent = sessionManager.sendInput(targetSession.sessionId, '/clear\r');
        await ctx.reply(sent ? 'Sent /clear — context cleared.' : 'Failed - session not connected.');
        break;
      }

      case '/model': {
        if (!targetSession) {
          await ctx.reply('No active session.');
          return;
        }
        const modelArg = args.join(' ');
        if (!modelArg) {
          const keyboard = new InlineKeyboard()
            .text('Opus', 'model_select_opus')
            .text('Sonnet', 'model_select_sonnet')
            .text('Haiku', 'model_select_haiku');
          await ctx.reply('Select model:', { reply_markup: keyboard });
          return;
        }
        const sent = sessionManager.sendInput(targetSession.sessionId, `/model ${modelArg}\r`);
        await ctx.reply(sent ? `Sent /model ${modelArg}` : 'Failed - session not connected.');
        break;
      }

      case '/l':
      case '/last': {
        if (sessionArg) {
          // Show last 5 turns for specific project
          const found = await getSessionByProjectName(sessionArg);
          if (!found) {
            await ctx.reply(`Project not found or not active: \`${escTg(sessionArg)}\``, { parse_mode: 'Markdown' });
            return;
          }
          const jsonlPath = sessionManager.getWatchedFile(found.sessionId);
          if (!jsonlPath) {
            await ctx.reply(`\`${escTg(found.projectName)}\` has no conversation yet.`, { parse_mode: 'Markdown' });
            return;
          }
          try {
            const turns = await parseJsonlTurns(jsonlPath);
            const recent = turns.slice(-5);
            if (recent.length === 0) {
              await ctx.reply('No turns found.');
              return;
            }
            const lines = recent.map((t) => {
              const time = new Date(t.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
              const tools = t.toolCalls.length > 0 ? ` \\[${escTg(t.toolCalls.join(', '))}\\]` : '';
              const msg = escTg(t.userMessage.substring(0, 100));
              return `${t.turnNumber}\\. ${time} ${msg}${tools}`;
            });
            await sendChunkedMessage(`*Recent turns (${escTg(found.projectName)}):*\n${lines.join('\n')}`);
          } catch (err: any) {
            await ctx.reply(`Error: ${err.message}`);
          }
        } else {
          // Show last 3 turns for all active sessions
          if (activeSessions.size === 0) {
            await ctx.reply('No active sessions.');
            return;
          }
          const parts: string[] = [];
          for (const [sid, tracking] of activeSessions.entries()) {
            const jsonlPath = sessionManager.getWatchedFile(sid);
            if (!jsonlPath) {
              parts.push(`*${escTg(tracking.projectName)}:* _no conversation yet_`);
              continue;
            }
            try {
              const turns = await parseJsonlTurns(jsonlPath);
              const recent = turns.slice(-3);
              if (recent.length === 0) {
                parts.push(`*${escTg(tracking.projectName)}:* _no turns_`);
                continue;
              }
              const lines = recent.map((t) => {
                const time = new Date(t.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                const msg = escTg(t.userMessage.substring(0, 80));
                return `  ${t.turnNumber}\\. ${time} ${msg}`;
              });
              parts.push(`*${escTg(tracking.projectName)}:*\n${lines.join('\n')}`);
            } catch {
              parts.push(`*${escTg(tracking.projectName)}:* _error reading_`);
            }
          }
          await sendChunkedMessage(parts.join('\n\n'));
        }
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

      case '/verbose':
      case '/v': {
        verboseMode = !verboseMode;
        await ctx.reply(`Verbose mode: ${verboseMode ? 'ON 🔧' : 'OFF'}`);
        break;
      }

      case '/help': {
        await ctx.reply(
          `*AFK Code Commands:*\n\n` +
            `*Session:*\n` +
            `/switch (/s) <project> - Switch/start session\n` +
            `/last (/l) [project] - Recent conversations\n` +
            `/rewind [project] - Rewind conversation\n` +
            `/fork (/f) [project] - Fork conversation\n` +
            `/model <name> - Switch model\n` +
            `/snapshot (/sn) - AI状態分析（ダイアログ待ち？処理中？）\n` +
            `/compact - Compact conversation\n` +
            `/clear - Clear context completely\n` +
            `/background (/bg) - Send Ctrl+B\n` +
            `// - Send Escape (interrupt)\n` +
            `/ - Key input pad (↑↓←→ ESC Enter 📷 Screen)\n` +
            `/kill - Kill current session\n` +
            `/mode - Toggle mode (Shift+Tab)\n` +
            `/verbose (/v) - Toggle tool call/result display\n\n` +
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
        await ctx.reply(`Unknown command: \`${command}\`\nType /help for available commands.`, { parse_mode: 'Markdown' });
        break;
    }
  }

  // Session stuck watchdog:
  // Case 1: last JSONL role=user, no assistant response for > threshold → Claude stuck mid-response
  // Case 2: last JSONL role=assistant (or null) but no JSONL output for > threshold → stdin inputs
  //         (HEARTBEATs/CRONs) are queued in PTY but Claude isn't flushing them (e.g. post-compaction)
  // When truly stuck, compare screen captures:
  //   - Screen changed → processing (thinking etc.) → notify only
  //   - Screen unchanged → fully frozen → Ctrl+C once + notify
  const WATCHDOG_INTERVAL_MS = 10 * 60 * 1000; // check every 10 min
  const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
  let lastWatchdogScreen: string | null = null;

  const watchdogInterval = setInterval(async () => {
    if (!primarySessionId || !activeSessions.has(primarySessionId)) return;

    const lastRole = sessionManager.getLastMessageRole(primarySessionId);
    const lastOutput = sessionManager.getLastOutputTime(primarySessionId);
    const outputStaleMs = Date.now() - lastOutput;

    // Case 1: unanswered user message
    // Case 2: role=assistant but JSONL has been silent for > threshold (stdin inputs not flushing)
    if (lastRole !== 'user') {
      if (lastOutput === 0 || outputStaleMs <= STALE_THRESHOLD_MS) {
        lastWatchdogScreen = null;
        return;
      }
      // Fall through: JSONL silent for > threshold despite role=assistant
    }

    const refTime = lastRole === 'user'
      ? sessionManager.getLastUserMessageTime(primarySessionId)
      : lastOutput;
    const staleMs = Date.now() - refTime;
    if (refTime > 0 && staleMs > STALE_THRESHOLD_MS) {
      const staleMin = Math.round(staleMs / 60_000);
      const screen = await sessionManager.captureScreen(primarySessionId);
      const screenText = screen
        ? `\`\`\`\n${screen.slice(-1500)}\n\`\`\``
        : '_(画面キャプチャ取得失敗)_';

      const isTrulyFrozen = screen !== null && screen === lastWatchdogScreen;
      lastWatchdogScreen = screen;

      if (isTrulyFrozen) {
        // Screen unchanged → fully frozen → send Ctrl+C once
        console.log(`[Watchdog] Stuck ${staleMin}min, screen frozen - sending single Ctrl+C`);
        sessionManager.sendInput(primarySessionId, '\x03');
        sendMessage(
          `🔴 *Watchdog*: ユーザー入力から *${staleMin} 分間*応答なし、画面も停止\nCtrl+C を1回送信しました\n\n*画面:*\n${screenText}`,
          'Markdown',
          { disable_notification: true }
        );
      } else {
        // Screen changed → thinking/processing → notify only
        console.log(`[Watchdog] Stuck ${staleMin}min, screen still changing - notify only`);
        sendMessage(
          `⚠️ *Watchdog*: ユーザー入力から *${staleMin} 分間*応答なし（画面は変化中・thinking中の可能性）\n\n*画面:*\n${screenText}`,
          'Markdown',
          { disable_notification: true }
        );
      }
    }
  }, WATCHDOG_INTERVAL_MS);

  return {
    bot,
    sessionManager,
    scheduler,
    stop: () => clearInterval(watchdogInterval),
  };
}
