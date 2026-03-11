/**
 * Cron Engine - Schedules tasks using cron expressions.
 * Reads ~/.afk-code/cron.yaml for job definitions.
 */

import cron from 'node-cron';
import type { CronJobConfig } from './config-loader.js';

interface ScheduledJob {
  config: CronJobConfig;
  task: cron.ScheduledTask;
}

export interface CronCallbacks {
  getActiveSessionId: () => string | null;
  isSessionBusy: (sessionId: string) => boolean;
  sendInput: (sessionId: string, text: string) => boolean;
  notify: (message: string) => void;
  markSilent?: (content: string) => void;
  getOtherSessionsSummary?: (excludeSessionId: string) => string;
}

const RETRY_DELAY_MS = 60_000; // 60 seconds between retries
const MAX_RETRIES = 3;

export class CronEngine {
  private jobs = new Map<string, ScheduledJob>();
  private callbacks: CronCallbacks;

  constructor(callbacks: CronCallbacks) {
    this.callbacks = callbacks;
  }

  start(jobConfigs: CronJobConfig[]): void {
    for (const config of jobConfigs) {
      if (!config.enabled) {
        console.log(`[Cron] Job '${config.name}' is disabled - skipping`);
        continue;
      }

      if (!cron.validate(config.schedule)) {
        console.error(`[Cron] Invalid schedule for '${config.name}': ${config.schedule}`);
        continue;
      }

      const task = cron.schedule(config.schedule, () => this.executeJob(config), {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      this.jobs.set(config.id, { config, task });
      console.log(`[Cron] Scheduled '${config.name}' (${config.schedule})`);
    }

    console.log(`[Cron] Started with ${this.jobs.size} active jobs`);
  }

  stop(): void {
    for (const job of this.jobs.values()) {
      job.task.stop();
    }
    this.jobs.clear();
    console.log('[Cron] Stopped');
  }

  reload(newConfigs: CronJobConfig[]): void {
    const newMap = new Map(newConfigs.map(c => [c.id, c]));

    // 削除されたジョブを停止
    for (const [id, job] of this.jobs) {
      if (!newMap.has(id)) {
        job.task.stop();
        this.jobs.delete(id);
        console.log(`[Cron] Removed job '${job.config.name}'`);
      }
    }

    // 追加・変更ジョブを処理
    for (const config of newConfigs) {
      const existing = this.jobs.get(config.id);
      const changed = !existing ||
        existing.config.schedule !== config.schedule ||
        existing.config.prompt !== config.prompt ||
        existing.config.enabled !== config.enabled ||
        existing.config.silent_relay !== config.silent_relay;

      if (!changed) continue;

      if (existing) {
        existing.task.stop();
        this.jobs.delete(config.id);
      }

      if (!config.enabled) {
        console.log(`[Cron] Job '${config.name}' disabled`);
        continue;
      }
      if (!cron.validate(config.schedule)) {
        console.error(`[Cron] Invalid schedule for '${config.name}': ${config.schedule}`);
        continue;
      }

      const task = cron.schedule(config.schedule, () => this.executeJob(config), {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      this.jobs.set(config.id, { config, task });
      console.log(`[Cron] ${existing ? 'Updated' : 'Added'} job '${config.name}' (${config.schedule})`);
    }
  }

  listJobs(): Array<{ id: string; name: string; schedule: string; enabled: boolean }> {
    return Array.from(this.jobs.values()).map((job) => ({
      id: job.config.id,
      name: job.config.name,
      schedule: job.config.schedule,
      enabled: job.config.enabled,
    }));
  }

  private executeJob(config: CronJobConfig, retryCount = 0): void {
    const sessionId = this.callbacks.getActiveSessionId();

    if (!sessionId) {
      console.log(`[Cron] No active session for job '${config.name}' - skipping`);
      return;
    }

    // Check if session is busy
    if (this.callbacks.isSessionBusy(sessionId)) {
      if (retryCount < MAX_RETRIES) {
        console.log(`[Cron] Session busy for '${config.name}' - retry ${retryCount + 1}/${MAX_RETRIES} in ${RETRY_DELAY_MS / 1000}s`);
        setTimeout(() => this.executeJob(config, retryCount + 1), RETRY_DELAY_MS);
      } else {
        console.log(`[Cron] Session still busy after ${MAX_RETRIES} retries for '${config.name}' - skipping`);
        this.callbacks.notify(`Cron: Skipped '${config.name}' - session busy after ${MAX_RETRIES} retries`);
      }
      return;
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

    const header = `[CRON: ${config.name}] ${dateStr} ${timeStr}`;
    let prompt = `${header}\n\n${config.prompt}`;

    // Append cross-project context if available
    if (this.callbacks.getOtherSessionsSummary) {
      const otherContext = this.callbacks.getOtherSessionsSummary(sessionId);
      if (otherContext) {
        prompt += '\n' + otherContext;
      }
    }

    if (config.silent_relay && this.callbacks.markSilent) {
      this.callbacks.markSilent(header);
    }

    const sent = this.callbacks.sendInput(sessionId, prompt);

    if (sent) {
      console.log(`[Cron] Executed job '${config.name}'`);
    } else {
      console.log(`[Cron] Failed to execute job '${config.name}'`);
      this.callbacks.notify(`Cron: Failed to execute '${config.name}' - session not connected`);
    }
  }
}
