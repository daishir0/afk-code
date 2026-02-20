/**
 * Scheduler - Integrates HeartbeatEngine and CronEngine.
 * Main entry point for autonomous scheduling features.
 */

import { HeartbeatEngine, type HeartbeatCallbacks } from './heartbeat-engine.js';
import { CronEngine, type CronCallbacks } from './cron-engine.js';
import { loadHeartbeatConfig, loadCronConfig } from './config-loader.js';
import type { SessionManager } from '../slack/session-manager.js';

export interface SchedulerOptions {
  sessionManager: SessionManager;
  getActiveSessionId: () => string | null;
  isSessionBusy?: (sessionId: string) => boolean;
  notify: (message: string) => void;
}

export class Scheduler {
  private heartbeat: HeartbeatEngine | null = null;
  private cron: CronEngine | null = null;
  private options: SchedulerOptions;

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

    console.log('[Scheduler] All engines started');
  }

  stop(): void {
    this.heartbeat?.stop();
    this.cron?.stop();
    console.log('[Scheduler] All engines stopped');
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
