/**
 * Heartbeat Engine - Periodically sends check-in prompts to Claude Code.
 * Reads ~/.afk-code/HEARTBEAT.md for the checklist and sends it to the active session.
 */

import { readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import type { HeartbeatConfig } from './config-loader.js';

const AFK_CODE_DIR = `${homedir()}/.afk-code`;
const STATE_FILE = `${AFK_CODE_DIR}/scheduler-state.json`;

interface HeartbeatState {
  lastBeatTime: string | null;
  beatCount: number;
  consecutiveSkips: number;
}

export interface HeartbeatCallbacks {
  getActiveSessionId: () => string | null;
  isSessionBusy: (sessionId: string) => boolean;
  sendInput: (sessionId: string, text: string) => boolean;
  notify: (message: string) => void;
  getOtherSessionsSummary?: (excludeSessionId: string) => string;
}

export class HeartbeatEngine {
  private config: HeartbeatConfig;
  private callbacks: HeartbeatCallbacks;
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: HeartbeatState = {
    lastBeatTime: null,
    beatCount: 0,
    consecutiveSkips: 0,
  };

  constructor(config: HeartbeatConfig, callbacks: HeartbeatCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[Heartbeat] Disabled in config');
      return;
    }

    await this.loadState();

    const intervalMs = this.config.interval_minutes * 60 * 1000;
    this.timer = setInterval(() => this.beat(), intervalMs);

    console.log(`[Heartbeat] Started (every ${this.config.interval_minutes} min, quiet ${this.config.quiet_hours.start}:00-${this.config.quiet_hours.end}:00)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[Heartbeat] Stopped');
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  get intervalMinutes(): number {
    return this.config.interval_minutes;
  }

  get lastBeatTime(): string | null {
    return this.state.lastBeatTime;
  }

  get beatCount(): number {
    return this.state.beatCount;
  }

  get consecutiveSkips(): number {
    return this.state.consecutiveSkips;
  }

  /** Manual trigger - bypasses quiet hours check */
  async triggerNow(): Promise<boolean> {
    return this.beat(true);
  }

  private isQuietHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const { start, end } = this.config.quiet_hours;

    if (start < end) {
      // No midnight wrap: e.g., 1:00-6:00
      return hour >= start && hour < end;
    } else {
      // Wraps around midnight: e.g., 23:00-7:00
      return hour >= start || hour < end;
    }
  }

  private async beat(force = false): Promise<boolean> {
    // Check quiet hours (skip if forced)
    if (!force && this.isQuietHours()) {
      console.log('[Heartbeat] Quiet hours - skipping');
      this.state.consecutiveSkips++;
      await this.saveState();
      return false;
    }

    // Get active session
    const sessionId = this.callbacks.getActiveSessionId();
    if (!sessionId) {
      console.log('[Heartbeat] No active session - skipping');
      this.state.consecutiveSkips++;

      if (this.state.consecutiveSkips >= this.config.max_consecutive_skips) {
        this.callbacks.notify('Heartbeat: No active session for multiple beats. Start a session with `afk-code run -- claude`');
        this.state.consecutiveSkips = 0;
      }

      await this.saveState();
      return false;
    }

    // Check if session is busy
    if (!force && this.callbacks.isSessionBusy(sessionId)) {
      console.log('[Heartbeat] Session busy - skipping');
      this.state.consecutiveSkips++;
      await this.saveState();
      return false;
    }

    // Build and send heartbeat prompt
    const { prompt, header } = await this.buildHeartbeatPrompt(sessionId);

    const sent = this.callbacks.sendInput(sessionId, prompt + '\r');

    if (sent) {
      this.state.beatCount++;
      this.state.lastBeatTime = new Date().toISOString();
      this.state.consecutiveSkips = 0;
      console.log(`[Heartbeat] Beat #${this.state.beatCount} sent`);
      // Send a second \r after 1s in case Claude Code's input wasn't ready
      // to receive the first one (same pattern as telegram-app.ts).
      setTimeout(() => this.callbacks.sendInput(sessionId, '\r'), 1000);
    } else {
      console.log('[Heartbeat] Failed to send beat');
      this.state.consecutiveSkips++;
    }

    await this.saveState();
    return sent;
  }

  private async buildHeartbeatPrompt(sessionId: string): Promise<{ prompt: string; header: string }> {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

    const header = `[HEARTBEAT #${this.state.beatCount + 1}] ${dateStr} ${timeStr}`;
    const lines = [
      header,
      '',
      '~/.afk-code/HEARTBEAT.md を読んで、チェックリストに従い自律的に判断・行動してください。',
      `日次ノート: ~/.afk-code/memory/${dateStr}.md`,
      '',
      '報告は最小限に。特記事項がなければ「Heartbeat完了、特記事項なし」のみ。',
    ];

    // Append cross-project context if available
    if (this.callbacks.getOtherSessionsSummary) {
      const otherContext = this.callbacks.getOtherSessionsSummary(sessionId);
      if (otherContext) {
        lines.push(otherContext);
      }
    }

    return { prompt: lines.join('\n'), header };
  }

  private async loadState(): Promise<void> {
    try {
      const content = await readFile(STATE_FILE, 'utf-8');
      const data = JSON.parse(content);
      this.state = {
        lastBeatTime: data.lastBeatTime || null,
        beatCount: data.beatCount || 0,
        consecutiveSkips: data.consecutiveSkips || 0,
      };
    } catch {
      // Use defaults
    }
  }

  private async saveState(): Promise<void> {
    try {
      await writeFile(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error('[Heartbeat] Failed to save state:', err);
    }
  }
}
