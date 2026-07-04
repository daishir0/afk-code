import { readdir, readFile, stat } from 'fs/promises';
import { mkdir } from 'fs/promises';
import { watch, type FSWatcher } from 'fs';
import { createHash } from 'crypto';
import { loadRelayConfig } from '../scheduler/config-loader.js';

/**
 * Per-session JSONL watcher — moved from the (server-side) SessionManager into
 * the run process. Because a run process owns exactly one session / one JSONL
 * file, the cross-session claim/exclusion logic (claimedFiles, hasSharedProjectDir)
 * is dropped. Everything else (discovery, seeding, incremental parse, extraction,
 * relay suppression) is preserved so the emitted events match the original
 * SessionManager behavior.
 */

export interface TodoItem {
  content: string;
  status: string;
  activeForm?: string;
}
export interface ToolCallInfo {
  id: string;
  name: string;
  input: unknown;
}
export interface ToolResultInfo {
  toolUseId: string;
  content: string;
  isError: boolean;
}
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface SessionEvents {
  onSessionUpdate(name: string): void;
  onTodos(todos: TodoItem[]): void;
  onPlanModeChange(inPlanMode: boolean): void;
  onToolCall(tool: ToolCallInfo): void;
  onToolResult(result: ToolResultInfo): void;
  onMessage(role: 'user' | 'assistant', content: string): void;
}

function hash(data: string): string {
  return createHash('md5').update(data).digest('hex');
}

const RELAY_CONFIG_TTL_MS = 60_000;

export class SessionWatcher {
  private watchedFile: string | null = null;
  private watcher?: FSWatcher;
  private pollInterval?: ReturnType<typeof setInterval>;
  private seenMessages = new Set<string>();
  private lastProcessedLineCount = 0;
  private initialFileStats = new Map<string, number>();
  private slugFound = false;
  private inPlanMode = false;
  private lastTodosHash = '';
  private stopped = false;

  private relayConfigCache: Awaited<ReturnType<typeof loadRelayConfig>> | null = null;
  private relayConfigLastLoad = 0;

  lastOutputTime = 0;
  lastMessageRole: 'user' | 'assistant' | null = null;

  constructor(
    private projectDir: string,
    private startedAt: Date,
    private events: SessionEvents,
  ) {}

  async start(): Promise<void> {
    this.initialFileStats = await this.snapshotJsonlFiles(this.projectDir);
    await this.startWatching();
  }

  stop(): void {
    this.stopped = true;
    if (this.watcher) this.watcher.close();
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  isBusy(thresholdMs = 30_000): boolean {
    return this.lastOutputTime > 0 && Date.now() - this.lastOutputTime < thresholdMs;
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
      // directory may not exist yet
    }
    return stats;
  }

  private async hasConversationMessages(path: string): Promise<boolean> {
    try {
      const content = await readFile(path, 'utf-8');
      return content.includes('"type":"user"') || content.includes('"type":"assistant"');
    } catch {
      return false;
    }
  }

  private async findActiveJsonlFile(): Promise<string | null> {
    try {
      const files = await readdir(this.projectDir);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'));
      const allPaths = jsonlFiles.map((f) => `${this.projectDir}/${f}`);
      if (allPaths.length === 0) return null;

      const fileStats = await Promise.all(
        allPaths.map(async (path) => ({ path, mtime: (await stat(path)).mtimeMs })),
      );
      fileStats.sort((a, b) => b.mtime - a.mtime);

      // 1. Existing file modified after start (--continue case)
      for (const { path, mtime } of fileStats) {
        const initialMtime = this.initialFileStats.get(path);
        if (initialMtime !== undefined && mtime > initialMtime) {
          if (await this.hasConversationMessages(path)) return path;
        }
      }
      // 2. New file that didn't exist at start
      for (const { path } of fileStats) {
        if (this.initialFileStats.get(path) === undefined) {
          if (await this.hasConversationMessages(path)) return path;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async seedSeenMessages(): Promise<void> {
    if (!this.watchedFile) return;
    try {
      const content = await readFile(this.watchedFile, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      this.seenMessages.clear();
      this.lastProcessedLineCount = lines.length;
    } catch {
      /* ignore */
    }
  }

  private async getRelayConfig() {
    const now = Date.now();
    if (this.relayConfigCache && now - this.relayConfigLastLoad < RELAY_CONFIG_TTL_MS) {
      return this.relayConfigCache;
    }
    this.relayConfigCache = await loadRelayConfig();
    this.relayConfigLastLoad = now;
    return this.relayConfigCache;
  }

  private async processJsonlUpdates(): Promise<void> {
    if (!this.watchedFile) return;
    try {
      const content = await readFile(this.watchedFile, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      if (lines.length < this.lastProcessedLineCount) this.lastProcessedLineCount = 0;
      const startIndex = this.lastProcessedLineCount;
      this.lastProcessedLineCount = lines.length;

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        const lineHash = hash(line);
        if (this.seenMessages.has(lineHash)) continue;
        this.seenMessages.add(lineHash);

        if (!this.slugFound) {
          const slug = this.extractSlug(line);
          if (slug) {
            this.slugFound = true;
            this.events.onSessionUpdate(slug);
          }
        }

        const todos = this.extractTodos(line);
        if (todos) {
          const todosHash = hash(JSON.stringify(todos));
          if (todosHash !== this.lastTodosHash) {
            this.lastTodosHash = todosHash;
            this.events.onTodos(todos);
          }
        }

        const planModeStatus = this.detectPlanMode(line);
        if (planModeStatus !== null && planModeStatus !== this.inPlanMode) {
          this.inPlanMode = planModeStatus;
          this.events.onPlanModeChange(planModeStatus);
        }

        for (const tool of this.extractToolCalls(line)) this.events.onToolCall(tool);
        for (const result of this.extractToolResults(line)) this.events.onToolResult(result);

        const parsed = this.parseJsonlLine(line);
        if (parsed) {
          if (new Date(parsed.timestamp) < this.startedAt) continue;
          this.lastOutputTime = Date.now();
          this.lastMessageRole = parsed.role;

          const relayConfig = await this.getRelayConfig();
          const key = parsed.content.trim();
          if (parsed.role === 'user') {
            if (relayConfig.suppressUserMessagePrefixes.some((p) => key.startsWith(p))) continue;
            if (relayConfig.suppressUserMessageContains.some((k) => key.includes(k))) continue;
          }
          if (parsed.role === 'assistant') {
            if (relayConfig.suppressAssistantMessagePrefixes.some((p) => key.startsWith(p))) continue;
            if (relayConfig.suppressAssistantMessageContains.some((k) => key.includes(k))) continue;
          }
          this.events.onMessage(parsed.role, parsed.content);
        }
      }
    } catch (err) {
      console.error('[SessionWatcher] Error processing JSONL:', err);
    }
  }

  private async startWatching(): Promise<void> {
    const jsonlFile = await this.findActiveJsonlFile();
    if (jsonlFile) {
      this.watchedFile = jsonlFile;
      await this.processJsonlUpdates();
    }

    try {
      await mkdir(this.projectDir, { recursive: true });
      this.watcher = watch(this.projectDir, { recursive: false }, async (_, filename) => {
        if (!filename?.endsWith('.jsonl')) return;
        if (!this.watchedFile) {
          const newFile = await this.findActiveJsonlFile();
          if (newFile) this.watchedFile = newFile;
        }
        const filePath = `${this.projectDir}/${filename}`;
        if (this.watchedFile && filePath === this.watchedFile) {
          await this.processJsonlUpdates();
        } else if (this.watchedFile && filePath !== this.watchedFile) {
          // switch to a truly-new JSONL (e.g. "clear context")
          if (!this.initialFileStats.has(filePath) && !filename.startsWith('agent-')) {
            if (await this.hasConversationMessages(filePath)) {
              this.watchedFile = filePath;
              await this.seedSeenMessages();
            }
          }
        }
      });
    } catch (err) {
      console.error('[SessionWatcher] Error setting up watcher:', err);
    }

    this.pollInterval = setInterval(async () => {
      if (this.stopped) {
        if (this.pollInterval) clearInterval(this.pollInterval);
        return;
      }
      if (!this.watchedFile) {
        const newFile = await this.findActiveJsonlFile();
        if (newFile) this.watchedFile = newFile;
      }
      if (this.watchedFile) await this.processJsonlUpdates();
    }, 1000);
  }

  // ---- extractors (ported verbatim) ----
  private detectPlanMode(line: string): boolean | null {
    try {
      const data = JSON.parse(line);
      if (data.type !== 'user') return null;
      const content = data.message?.content;
      if (typeof content !== 'string') return null;
      if (content.includes('<system-reminder>') && content.includes('Plan mode is active')) return true;
      if (content.includes('Exited Plan Mode') || content.includes('exited plan mode')) return false;
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
          tools.push({ id: block.id, name: block.name, input: block.input || {} });
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
          let text = '';
          if (typeof block.content === 'string') text = block.content;
          else if (Array.isArray(block.content))
            text = block.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n');
          results.push({ toolUseId: block.tool_use_id, content: text, isError: block.is_error === true });
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
      return data.slug && typeof data.slug === 'string' ? data.slug : null;
    } catch {
      return null;
    }
  }

  private extractTodos(line: string): TodoItem[] | null {
    try {
      const data = JSON.parse(line);
      if (data.todos && Array.isArray(data.todos) && data.todos.length > 0) {
        return data.todos.map((t: { content?: string; status?: string; activeForm?: string }) => ({
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
      if (typeof message.content === 'string') content = message.content;
      else if (Array.isArray(message.content)) {
        for (const block of message.content) if (block.type === 'text' && block.text) content += block.text;
      }
      if (!content.trim()) return null;
      return { role: message.role, content: content.trim(), timestamp: data.timestamp || new Date().toISOString() };
    } catch {
      return null;
    }
  }
}
