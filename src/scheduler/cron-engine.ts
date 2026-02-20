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
  sendInput: (sessionId: string, text: string) => boolean;
  notify: (message: string) => void;
}

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

  listJobs(): Array<{ id: string; name: string; schedule: string; enabled: boolean }> {
    return Array.from(this.jobs.values()).map((job) => ({
      id: job.config.id,
      name: job.config.name,
      schedule: job.config.schedule,
      enabled: job.config.enabled,
    }));
  }

  private executeJob(config: CronJobConfig): void {
    const sessionId = this.callbacks.getActiveSessionId();

    if (!sessionId) {
      console.log(`[Cron] No active session for job '${config.name}' - skipping`);
      return;
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

    const prompt = `[CRON: ${config.name}] ${dateStr} ${timeStr}\n\n${config.prompt}`;
    const sent = this.callbacks.sendInput(sessionId, prompt);

    if (sent) {
      console.log(`[Cron] Executed job '${config.name}'`);
    } else {
      console.log(`[Cron] Failed to execute job '${config.name}'`);
      this.callbacks.notify(`Cron: Failed to execute '${config.name}' - session not connected`);
    }
  }
}
