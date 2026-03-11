/**
 * Scheduler - Integrates HeartbeatEngine and CronEngine.
 * Main entry point for autonomous scheduling features.
 */

import { HeartbeatEngine, type HeartbeatCallbacks } from './heartbeat-engine.js';
import { CronEngine, type CronCallbacks } from './cron-engine.js';
import { loadHeartbeatConfig, loadCronConfig } from './config-loader.js';
import type { SessionManager } from '../slack/session-manager.js';
import { stat } from 'fs/promises';
import { homedir } from 'os';

export interface SchedulerOptions {
  sessionManager: SessionManager;
  getActiveSessionId: () => string | null;
  isSessionBusy?: (sessionId: string) => boolean;
  notify: (message: string) => void;
  getOtherSessionsSummary?: (excludeSessionId: string) => string;
}

export class Scheduler {
  private heartbeat: HeartbeatEngine | null = null;
  private cron: CronEngine | null = null;
  private options: SchedulerOptions;
  private lastCronMtime: number = 0;
  private cronWatchInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: SchedulerOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    const heartbeatConfig = await loadHeartbeatConfig();
    const cronConfig = await loadCronConfig();

    const commonCallbacks = {
      getActiveSessionId: this.options.getActiveSessionId,
      sendInput: (sessionId: string, text: string) =>
        this.options.sessionManager.sendInput(sessionId, text),
      notify: this.options.notify,
      markSilent: (content: string) =>
        this.options.sessionManager.markSilent(content),
      getOtherSessionsSummary: this.options.getOtherSessionsSummary,
    };

    // Start Heartbeat
    const heartbeatCallbacks: HeartbeatCallbacks = {
      ...commonCallbacks,
      isSessionBusy: this.options.isSessionBusy || (() => false),
    };
    this.heartbeat = new HeartbeatEngine(heartbeatConfig, heartbeatCallbacks);
    await this.heartbeat.start();

    // Start Cron
    const cronCallbacks: CronCallbacks = {
      ...commonCallbacks,
      isSessionBusy: this.options.isSessionBusy || (() => false),
    };
    this.cron = new CronEngine(cronCallbacks);
    this.cron.start(cronConfig.jobs);

    // 初回 mtime を記録してからポーリング開始
    try {
      this.lastCronMtime = (await stat(`${homedir()}/.afk-code/cron.yaml`)).mtimeMs;
    } catch {}
    this.startCronConfigWatcher();

    console.log('[Scheduler] All engines started');
  }

  stop(): void {
    if (this.cronWatchInterval) {
      clearInterval(this.cronWatchInterval);
      this.cronWatchInterval = null;
    }
    this.heartbeat?.stop();
    this.cron?.stop();
    console.log('[Scheduler] All engines stopped');
  }

  private startCronConfigWatcher(): void {
    const configPath = `${homedir()}/.afk-code/cron.yaml`;
    const POLL_INTERVAL_MS = 60_000; // 1分

    this.cronWatchInterval = setInterval(async () => {
      try {
        const { mtimeMs } = await stat(configPath);
        if (mtimeMs <= this.lastCronMtime) return;
        this.lastCronMtime = mtimeMs;

        console.log('[Scheduler] cron.yaml changed, reloading...');
        const newConfig = await loadCronConfig();
        this.cron?.reload(newConfig.jobs);
      } catch {
        // ファイルが存在しない等は無視
      }
    }, POLL_INTERVAL_MS);

    console.log('[Scheduler] Polling cron.yaml every 60s');
  }

  getHeartbeat(): HeartbeatEngine | null {
    return this.heartbeat;
  }

  getCron(): CronEngine | null {
    return this.cron;
  }

  async triggerHeartbeat(): Promise<boolean> {
    if (!this.heartbeat) return false;
    return this.heartbeat.triggerNow();
  }
}

export { HeartbeatEngine } from './heartbeat-engine.js';
export { CronEngine } from './cron-engine.js';
export { loadHeartbeatConfig, loadCronConfig } from './config-loader.js';
