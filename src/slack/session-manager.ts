/**
 * Session manager for Slack bot - handles JSONL watching and Unix socket communication
 * This replaces the need for the daemon + relay.
 */

import { watch, type FSWatcher } from 'fs';
import { readdir, readFile, stat, unlink, mkdir } from 'fs/promises';
import { createServer, type Server, type Socket } from 'net';
import { createHash } from 'crypto';
import type { TodoItem } from '../types.js';
import { loadRelayConfig } from '../scheduler/config-loader.js';

const DAEMON_SOCKET = '/tmp/afk-code-daemon.sock';

export interface SessionInfo {
  id: string;
  name: string;
  cwd: string;
  projectDir: string;
  status: 'running' | 'idle' | 'ended';
  startedAt: Date;
}

interface InternalSession extends SessionInfo {
  socket: Socket;
  watcher?: FSWatcher;
  watchedFile?: string;
  seenMessages: Set<string>;
  lastProcessedLineCount: number; // index into JSONL; only lines after this are processed
  slugFound: boolean;
  lastTodosHash: string;
  inPlanMode: boolean;
  initialFileStats: Map<string, number>; // path -> mtime at session start
  lastOutputTime: number; // timestamp of last JSONL output
  lastMessageRole: 'user' | 'assistant' | null; // role of the last JSONL message
  lastUserMessageTime: number; // timestamp when the last user message was written
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  input: any;
}

export interface ToolResultInfo {
  toolUseId: string;
  content: string;
  isError: boolean;
}

export interface SessionEvents {
  onSessionStart: (session: SessionInfo) => void;
  onSessionEnd: (sessionId: string) => void;
  onSessionUpdate: (sessionId: string, name: string) => void;
  onSessionStatus: (sessionId: string, status: 'running' | 'idle' | 'ended') => void;
  onMessage: (sessionId: string, role: 'user' | 'assistant', content: string) => void;
  onTodos: (sessionId: string, todos: TodoItem[]) => void;
  onToolCall: (sessionId: string, tool: ToolCallInfo) => void;
  onToolResult: (sessionId: string, result: ToolResultInfo) => void;
  onPlanModeChange: (sessionId: string, inPlanMode: boolean) => void;
  onPermissionPrompt: (sessionId: string, content: string) => void;
}

function hash(data: string): string {
  return createHash('md5').update(data).digest('hex');
}

const RELAY_CONFIG_TTL_MS = 60_000; // re-read config.yaml at most once per minute

export class SessionManager {
  private sessions = new Map<string, InternalSession>();
  private claimedFiles = new Set<string>();
  private events: SessionEvents;
  private server: Server | null = null;
  private relayConfigCache: import('../scheduler/config-loader.js').RelayConfig | null = null;
  private relayConfigLastLoad = 0;

  constructor(events: SessionEvents) {
    this.events = events;
  }

  async start(): Promise<void> {
    // Remove old socket file
    try {
      await unlink(DAEMON_SOCKET);
    } catch {}

    // Start Unix socket server
    this.server = createServer((socket) => {
      let messageBuffer = '';

      socket.on('data', (data) => {
        messageBuffer += data.toString();
        // Guard against OOM: if a single line exceeds 50MB, drop it
        if (messageBuffer.length > 50 * 1024 * 1024) {
          console.error('[SessionManager] messageBuffer exceeded 50MB, dropping to prevent OOM');
          messageBuffer = '';
          return;
        }
        const lines = messageBuffer.split('\n');
        messageBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let parsed: any;
          try {
            parsed = JSON.parse(line);
          } catch (error) {
            console.error('[SessionManager] Error parsing message:', error);
            continue;
          }
          this.handleSessionMessage(socket, parsed)
            .catch((error) => console.error('[SessionManager] Error handling message:', error));
        }
      });

      socket.on('error', (error) => {
        console.error('[SessionManager] Socket error:', error);
      });

      socket.on('close', () => {
        // Find and cleanup session for this socket
        for (const [id, session] of this.sessions) {
          if (session.socket === socket) {
            console.log(`[SessionManager] Session disconnected: ${id}`);
            this.stopWatching(session);
            this.sessions.delete(id);
            Promise.resolve(this.events.onSessionEnd(id))
              .catch(err => console.error('[SessionManager] onSessionEnd error:', err));
            break;
          }
        }
      });
    });

    this.server.listen(DAEMON_SOCKET, () => {
      console.log(`[SessionManager] Listening on ${DAEMON_SOCKET}`);
    });
  }

  stop(): void {
    for (const session of this.sessions.values()) {
      this.stopWatching(session);
      // Destroy the socket so the run process detects the disconnect and
      // reconnects to the new server instance (server.close() alone does not
      // close accepted connections, leaving run processes orphaned).
      try { session.socket.destroy(); } catch {}
    }
    this.sessions.clear();
    if (this.server) {
      this.server.close();
    }
  }

  sendInput(sessionId: string, text: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`[SessionManager] Session not found: ${sessionId}`);
      return false;
    }

    try {
      session.socket.write(JSON.stringify({ type: 'input', text }) + '\n');
    } catch (err) {
      console.error(`[SessionManager] Failed to send input to ${sessionId}:`, err);
      this.stopWatching(session);
      this.sessions.delete(sessionId);
      Promise.resolve(this.events.onSessionEnd(sessionId))
        .catch(err => console.error('[SessionManager] onSessionEnd error:', err));
      return false;
    }

    return true;
  }

  getSession(sessionId: string): SessionInfo | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    return {
      id: session.id,
      name: session.name,
      cwd: session.cwd,
      projectDir: session.projectDir,
      status: session.status,
      startedAt: session.startedAt,
    };
  }

  getWatchedFile(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.watchedFile;
  }

  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      name: s.name,
      cwd: s.cwd,
      projectDir: s.projectDir,
      status: s.status,
      startedAt: s.startedAt,
    }));
  }

  /**
   * Pre-claim a JSONL file so other sessions' watchers won't steal it.
   * Call this before creating a fork session to prevent race conditions.
   */
  claimFile(filePath: string): void {
    this.claimedFiles.add(filePath);
  }

  /**
   * Check if another session shares the same projectDir.
   * When true, file-switching should be disabled to prevent cross-session interference.
   */
  private hasSharedProjectDir(session: InternalSession): boolean {
    for (const [id, s] of this.sessions) {
      if (id !== session.id && s.projectDir === session.projectDir) return true;
    }
    return false;
  }

  /**
   * Check if a session is busy (has had JSONL output within the last 30 seconds).
   * This prevents Heartbeat/Cron from interrupting Claude Code mid-operation.
   */
  isSessionBusy(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    const elapsed = Date.now() - session.lastOutputTime;
    return elapsed < 30_000; // Busy if output within last 30 seconds
  }

  getLastOutputTime(sessionId: string): number {
    return this.sessions.get(sessionId)?.lastOutputTime ?? 0;
  }

  getLastMessageRole(sessionId: string): 'user' | 'assistant' | null {
    return this.sessions.get(sessionId)?.lastMessageRole ?? null;
  }

  getLastUserMessageTime(sessionId: string): number {
    return this.sessions.get(sessionId)?.lastUserMessageTime ?? 0;
  }

  captureScreen(sessionId: string, timeoutMs = 5000): Promise<string | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return Promise.resolve(null);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        session.socket.removeListener('data', onData);
        resolve(null);
      }, timeoutMs);

      let buf = '';
      const onData = (data: Buffer) => {
        buf += data.toString();
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'screen_response') {
              clearTimeout(timer);
              session.socket.removeListener('data', onData);
              resolve(msg.content ?? '');
            }
          } catch {}
        }
      };

      session.socket.on('data', onData);
      try {
        session.socket.write(JSON.stringify({ type: 'screen_request' }) + '\n');
      } catch {
        clearTimeout(timer);
        session.socket.removeListener('data', onData);
        resolve(null);
      }
    });
  }

  private async handleSessionMessage(socket: Socket, message: any): Promise<void> {
    switch (message.type) {
      case 'session_start': {
        // Snapshot existing JSONL files before creating session
        const initialFileStats = await this.snapshotJsonlFiles(message.projectDir);

        const session: InternalSession = {
          id: message.id,
          name: message.name || message.command?.join(' ') || 'Session',
          cwd: message.cwd,
          projectDir: message.projectDir,
          socket,
          status: 'running',
          seenMessages: new Set(),
          lastProcessedLineCount: 0,
          startedAt: new Date(),
          slugFound: false,
          lastTodosHash: '',
          inPlanMode: false,
          initialFileStats,
          lastOutputTime: Date.now(),
          lastMessageRole: null,
          lastUserMessageTime: 0,
        };

        this.sessions.set(message.id, session);
        console.log(`[SessionManager] Session started: ${message.id} - ${session.name}`);
        console.log(`[SessionManager] Snapshot: ${initialFileStats.size} existing JSONL files`);

        Promise.resolve(this.events.onSessionStart({
          id: session.id,
          name: session.name,
          cwd: session.cwd,
          projectDir: session.projectDir,
          status: session.status,
          startedAt: session.startedAt,
        })).catch(err => console.error('[SessionManager] onSessionStart error:', err));

        this.startWatching(session);
        break;
      }

      case 'session_end': {
        const session = this.sessions.get(message.sessionId);
        if (session) {
          console.log(`[SessionManager] Session ended: ${message.sessionId}`);
          this.stopWatching(session);
          this.sessions.delete(message.sessionId);
          Promise.resolve(this.events.onSessionEnd(message.sessionId))
            .catch(err => console.error('[SessionManager] onSessionEnd error:', err));
        }
        break;
      }

      case 'permission_prompt': {
        const session = this.sessions.get(message.sessionId);
        if (session) {
          console.log(`[SessionManager] Permission prompt detected: ${message.sessionId}`);
          Promise.resolve(this.events.onPermissionPrompt(message.sessionId, message.content || ''))
            .catch(err => console.error('[SessionManager] onPermissionPrompt error:', err));
        }
        break;
      }
    }
  }

  private async snapshotJsonlFiles(projectDir: string): Promise<Map<string, number>> {
    const stats = new Map<string, number>();
    try {
      const files = await readdir(projectDir);
      for (const f of files) {
        if (f.endsWith('.jsonl') && !f.startsWith('agent-')) {
          const path = `${projectDir}/${f}`;
          const fileStat = await stat(path);
          stats.set(path, fileStat.mtimeMs);
        }
      }
    } catch {
      // Directory might not exist yet
    }
    return stats;
  }

  private async hasConversationMessages(path: string): Promise<boolean> {
    try {
      const content = await readFile(path, 'utf-8');
      // Check if file contains actual conversation messages (not just metadata)
      return content.includes('"type":"user"') || content.includes('"type":"assistant"');
    } catch {
      return false;
    }
  }

  private async findActiveJsonlFile(session: InternalSession): Promise<string | null> {
    try {
      const files = await readdir(session.projectDir);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'));

      const allPaths = jsonlFiles
        .map((f) => `${session.projectDir}/${f}`)
        .filter((path) => !this.claimedFiles.has(path));

      if (allPaths.length === 0) return null;

      // Get current file stats
      const fileStats = await Promise.all(
        allPaths.map(async (path) => {
          const fileStat = await stat(path);
          return { path, mtime: fileStat.mtimeMs };
        })
      );

      // Sort by mtime descending - prefer most recently modified
      fileStats.sort((a, b) => b.mtime - a.mtime);

      // Look for files that are either:
      // 1. Modified since our snapshot (for --continue case) - check first!
      // 2. New (didn't exist in our snapshot)
      // Only consider files with actual conversation messages
      for (const { path, mtime } of fileStats) {
        const initialMtime = session.initialFileStats.get(path);

        if (initialMtime !== undefined && mtime > initialMtime) {
          // Existing file that was modified after session start (--continue case)
          if (await this.hasConversationMessages(path)) {
            console.log(`[SessionManager] Found modified JSONL (--continue): ${path}`);
            return path;
          }
        }
      }

      // Then check new files
      for (const { path } of fileStats) {
        const initialMtime = session.initialFileStats.get(path);

        if (initialMtime === undefined) {
          // New file that didn't exist when session started
          if (await this.hasConversationMessages(path)) {
            console.log(`[SessionManager] Found new JSONL: ${path}`);
            return path;
          }
        }
      }

      // No valid conversation file found yet
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Seed seenMessages with all current lines in the new JSONL file
   * without forwarding any messages. Used on file switch to prevent
   * re-processing old content while still allowing new lines to flow.
   */
  private async seedSeenMessages(session: InternalSession): Promise<void> {
    if (!session.watchedFile) return;
    try {
      const content = await readFile(session.watchedFile, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      session.seenMessages.clear();
      session.lastProcessedLineCount = lines.length;
      console.log(`[SessionManager] Seeded ${lines.length} lines (skipping) from ${session.watchedFile}`);
    } catch (err) {
      console.error('[SessionManager] Error seeding seenMessages:', err);
    }
  }

  private async processJsonlUpdates(session: InternalSession): Promise<void> {
    if (!session.watchedFile) return;

    try {
      const content = await readFile(session.watchedFile, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      // Handle file truncation (e.g., new session, file reset)
      if (lines.length < session.lastProcessedLineCount) {
        session.lastProcessedLineCount = 0;
      }

      // Advance the pointer synchronously before any await so that concurrent
      // calls from both the watcher and the poll timer don't re-process the
      // same lines.
      const startIndex = session.lastProcessedLineCount;
      session.lastProcessedLineCount = lines.length;

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        const lineHash = hash(line);
        if (session.seenMessages.has(lineHash)) continue;
        session.seenMessages.add(lineHash);

        // Extract session name (slug)
        if (!session.slugFound) {
          const slug = this.extractSlug(line);
          if (slug) {
            session.slugFound = true;
            session.name = slug;
            console.log(`[SessionManager] Session ${session.id} name: ${slug}`);
            Promise.resolve(this.events.onSessionUpdate(session.id, slug))
              .catch(err => console.error('[SessionManager] onSessionUpdate error:', err));
          }
        }

        // Extract todos
        const todos = this.extractTodos(line);
        if (todos) {
          const todosHash = hash(JSON.stringify(todos));
          if (todosHash !== session.lastTodosHash) {
            session.lastTodosHash = todosHash;
            Promise.resolve(this.events.onTodos(session.id, todos))
              .catch(err => console.error('[SessionManager] onTodos error:', err));
          }
        }

        // Detect plan mode changes
        const planModeStatus = this.detectPlanMode(line);
        if (planModeStatus !== null && planModeStatus !== session.inPlanMode) {
          session.inPlanMode = planModeStatus;
          console.log(`[SessionManager] Session ${session.id} plan mode: ${planModeStatus}`);
          Promise.resolve(this.events.onPlanModeChange(session.id, planModeStatus))
            .catch(err => console.error('[SessionManager] onPlanModeChange error:', err));
        }

        // Extract tool calls from assistant messages
        const toolCalls = this.extractToolCalls(line);
        for (const tool of toolCalls) {
          Promise.resolve(this.events.onToolCall(session.id, tool))
            .catch(err => console.error('[SessionManager] onToolCall error:', err));
        }

        // Extract tool results from user messages
        const toolResults = this.extractToolResults(line);
        for (const result of toolResults) {
          Promise.resolve(this.events.onToolResult(session.id, result))
            .catch(err => console.error('[SessionManager] onToolResult error:', err));
        }

        // Parse and forward messages
        const parsed = this.parseJsonlLine(line);
        if (parsed) {
          const messageTime = new Date(parsed.timestamp);
          if (messageTime < session.startedAt) continue;

          session.lastOutputTime = Date.now();
          session.lastMessageRole = parsed.role;
          if (parsed.role === 'user') session.lastUserMessageTime = Date.now();
          console.log(`[SessionManager] New message: session=${session.id.slice(0, 8)} role=${parsed.role} ts=${parsed.timestamp} len=${parsed.content.length}`);

          // Skip messages matching suppress rules (cached, reloaded every 60s)
          const relayConfig = await this.getRelayConfig();
          if (parsed.role === 'user') {
            const contentKey = parsed.content.trim();
            const isSuppressed = relayConfig.suppressUserMessagePrefixes.some((prefix) =>
              contentKey.startsWith(prefix)
            );
            if (isSuppressed) {
              console.log(`[SessionManager] Suppressed system message: ${contentKey.slice(0, 60)}...`);
              continue;
            }

            const isContainsSuppressed = relayConfig.suppressUserMessageContains.some((keyword) =>
              contentKey.includes(keyword)
            );
            if (isContainsSuppressed) {
              console.log(`[SessionManager] Suppressed (contains) user message: ${contentKey.slice(0, 60)}...`);
              continue;
            }
          }

          if (parsed.role === 'assistant') {
            const assistantKey = parsed.content.trim();
            const isAssistantSuppressed = relayConfig.suppressAssistantMessagePrefixes.some((prefix) =>
              assistantKey.startsWith(prefix)
            );
            if (isAssistantSuppressed) {
              console.log(`[SessionManager] Suppressed assistant message: ${assistantKey.slice(0, 60)}...`);
              continue;
            }

            const isAssistantContainsSuppressed = relayConfig.suppressAssistantMessageContains.some((keyword) =>
              assistantKey.includes(keyword)
            );
            if (isAssistantContainsSuppressed) {
              console.log(`[SessionManager] Suppressed (contains) assistant message: ${assistantKey.slice(0, 60)}...`);
              continue;
            }
          }

          console.log(`[SessionManager] Forwarding: session=${session.id.slice(0, 8)} role=${parsed.role}`);
          Promise.resolve(this.events.onMessage(session.id, parsed.role, parsed.content))
            .catch(err => console.error('[SessionManager] onMessage error:', err));
        }
      }
    } catch (err) {
      console.error('[SessionManager] Error processing JSONL:', err);
    }
  }

  private async startWatching(session: InternalSession): Promise<void> {
    const jsonlFile = await this.findActiveJsonlFile(session);

    if (jsonlFile) {
      session.watchedFile = jsonlFile;
      this.claimedFiles.add(jsonlFile);
      console.log(`[SessionManager] Watching: ${jsonlFile}`);
      await this.processJsonlUpdates(session);
    } else {
      console.log(`[SessionManager] Waiting for JSONL changes in ${session.projectDir}`);
    }

    // Watch directory for changes - create it if it doesn't exist yet
    // (Claude Code creates this directory lazily on first conversation activity)
    try {
      await mkdir(session.projectDir, { recursive: true });
      session.watcher = watch(session.projectDir, { recursive: false }, async (_, filename) => {
        if (!filename?.endsWith('.jsonl')) return;

        if (!session.watchedFile) {
          const newFile = await this.findActiveJsonlFile(session);
          if (newFile) {
            session.watchedFile = newFile;
            this.claimedFiles.add(newFile);
          }
        }

        const filePath = `${session.projectDir}/${filename}`;
        if (session.watchedFile && filePath === session.watchedFile) {
          await this.processJsonlUpdates(session);
        } else if (session.watchedFile && filePath !== session.watchedFile) {
          // A different JSONL file changed - only switch if it's a truly new file
          // (happens on "clear context" which creates a new JSONL)
          // NEVER switch when sharing projectDir with another session (fork scenario)
          if (!this.hasSharedProjectDir(session) && !session.initialFileStats.has(filePath) && !this.claimedFiles.has(filePath)) {
            if (filePath.endsWith('.jsonl') && !filename.startsWith('agent-')) {
              if (await this.hasConversationMessages(filePath)) {
                console.log(`[SessionManager] JSONL file switched: ${session.watchedFile} -> ${filePath}`);
                this.claimedFiles.delete(session.watchedFile);
                session.watchedFile = filePath;
                this.claimedFiles.add(filePath);
                await this.seedSeenMessages(session);
              }
            }
          }
        }
      });
    } catch (err) {
      console.error('[SessionManager] Error setting up watcher:', err);
    }

    // Poll as backup
    const pollInterval = setInterval(async () => {
      if (!this.sessions.has(session.id)) {
        clearInterval(pollInterval);
        return;
      }

      if (!session.watchedFile) {
        const newFile = await this.findActiveJsonlFile(session);
        if (newFile) {
          session.watchedFile = newFile;
          this.claimedFiles.add(newFile);
        }
      } else if (!this.hasSharedProjectDir(session)) {
        // Check if session switched to a truly new JSONL file (e.g. after "clear context")
        // Only switch to files that didn't exist at session start to prevent ping-pong
        // NEVER switch when sharing projectDir with another session (fork scenario)
        try {
          const files = await readdir(session.projectDir);
          const jsonlFiles = files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'));
          for (const f of jsonlFiles) {
            const path = `${session.projectDir}/${f}`;
            if (path === session.watchedFile) continue;
            if (this.claimedFiles.has(path)) continue;
            // Only consider files that are truly new (not in initial snapshot)
            if (session.initialFileStats.has(path)) continue;
            if (await this.hasConversationMessages(path)) {
              console.log(`[SessionManager] JSONL file switched (poll): ${session.watchedFile} -> ${path}`);
              this.claimedFiles.delete(session.watchedFile);
              session.watchedFile = path;
              this.claimedFiles.add(path);
              await this.seedSeenMessages(session);
              break;
            }
          }
        } catch {
          // Directory might not exist
        }
      }

      if (session.watchedFile) {
        await this.processJsonlUpdates(session);
      }
    }, 1000);
  }

  private async getRelayConfig(): Promise<import('../scheduler/config-loader.js').RelayConfig> {
    const now = Date.now();
    if (this.relayConfigCache && now - this.relayConfigLastLoad < RELAY_CONFIG_TTL_MS) {
      return this.relayConfigCache;
    }
    this.relayConfigCache = await loadRelayConfig();
    this.relayConfigLastLoad = now;
    return this.relayConfigCache;
  }

  private stopWatching(session: InternalSession): void {
    if (session.watcher) {
      session.watcher.close();
    }
    if (session.watchedFile) {
      this.claimedFiles.delete(session.watchedFile);
    }
  }

  private detectPlanMode(line: string): boolean | null {
    try {
      const data = JSON.parse(line);
      if (data.type !== 'user') return null;

      const content = data.message?.content;
      if (typeof content !== 'string') return null;

      // Check for plan mode activation
      if (content.includes('<system-reminder>') && content.includes('Plan mode is active')) {
        return true;
      }

      // Check for plan mode exit (ExitPlanMode was called)
      if (content.includes('Exited Plan Mode') || content.includes('exited plan mode')) {
        return false;
      }

      return null;
    } catch {
      return null;
    }
  }

  private extractToolCalls(line: string): ToolCallInfo[] {
    try {
      const data = JSON.parse(line);
      if (data.type !== 'assistant') return [];

      const content = data.message?.content;
      if (!Array.isArray(content)) return [];

      const tools: ToolCallInfo[] = [];
      for (const block of content) {
        if (block.type === 'tool_use' && block.id && block.name) {
          tools.push({
            id: block.id,
            name: block.name,
            input: block.input || {},
          });
        }
      }
      return tools;
    } catch {
      return [];
    }
  }

  private extractToolResults(line: string): ToolResultInfo[] {
    try {
      const data = JSON.parse(line);
      if (data.type !== 'user') return [];

      const content = data.message?.content;
      if (!Array.isArray(content)) return [];

      const results: ToolResultInfo[] = [];
      for (const block of content) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          // Content can be string or array of text blocks
          let text = '';
          if (typeof block.content === 'string') {
            text = block.content;
          } else if (Array.isArray(block.content)) {
            text = block.content
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text)
              .join('\n');
          }

          results.push({
            toolUseId: block.tool_use_id,
            content: text,
            isError: block.is_error === true,
          });
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  private extractSlug(line: string): string | null {
    try {
      const data = JSON.parse(line);
      if (data.slug && typeof data.slug === 'string') {
        return data.slug;
      }
      return null;
    } catch {
      return null;
    }
  }

  private extractTodos(line: string): TodoItem[] | null {
    try {
      const data = JSON.parse(line);
      if (data.todos && Array.isArray(data.todos) && data.todos.length > 0) {
        return data.todos.map((t: any) => ({
          content: t.content || '',
          status: t.status || 'pending',
          activeForm: t.activeForm,
        }));
      }
      return null;
    } catch {
      return null;
    }
  }

  private parseJsonlLine(line: string): ChatMessage | null {
    try {
      const data = JSON.parse(line);

      if (data.type !== 'user' && data.type !== 'assistant') return null;
      if (data.isMeta || data.subtype) return null;

      const message = data.message;
      if (!message || !message.role) return null;

      let content = '';
      if (typeof message.content === 'string') {
        content = message.content;
      } else if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'text' && block.text) {
            content += block.text;
          }
        }
      }

      if (!content.trim()) return null;

      return {
        role: message.role as 'user' | 'assistant',
        content: content.trim(),
        timestamp: data.timestamp || new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
}
