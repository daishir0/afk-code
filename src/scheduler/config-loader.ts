/**
 * YAML configuration loader for scheduler settings.
 * Reads ~/.afk-code/scheduler.yaml and ~/.afk-code/cron.yaml
 */

import { readFile } from 'fs/promises';
import { homedir } from 'os';
import YAML from 'yaml';

const AFK_CODE_DIR = `${homedir()}/.afk-code`;

export interface HeartbeatConfig {
  enabled: boolean;
  interval_minutes: number;
  quiet_hours: {
    start: number;
    end: number;
  };
  max_consecutive_skips: number;
  silent_relay: boolean;
}

export interface CronJobConfig {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  enabled: boolean;
  silent_relay: boolean;
}

export interface CronConfig {
  jobs: CronJobConfig[];
}

const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  enabled: true,
  interval_minutes: 30,
  quiet_hours: { start: 23, end: 7 },
  max_consecutive_skips: 3,
  silent_relay: true,
};

const DEFAULT_CRON_CONFIG: CronConfig = {
  jobs: [],
};

export async function loadHeartbeatConfig(): Promise<HeartbeatConfig> {
  try {
    const content = await readFile(`${AFK_CODE_DIR}/scheduler.yaml`, 'utf-8');
    const data = YAML.parse(content);
    if (!data?.heartbeat) return DEFAULT_HEARTBEAT_CONFIG;

    return {
      enabled: data.heartbeat.enabled ?? DEFAULT_HEARTBEAT_CONFIG.enabled,
      interval_minutes: data.heartbeat.interval_minutes ?? DEFAULT_HEARTBEAT_CONFIG.interval_minutes,
      quiet_hours: {
        start: data.heartbeat.quiet_hours?.start ?? DEFAULT_HEARTBEAT_CONFIG.quiet_hours.start,
        end: data.heartbeat.quiet_hours?.end ?? DEFAULT_HEARTBEAT_CONFIG.quiet_hours.end,
      },
      max_consecutive_skips:
        data.heartbeat.max_consecutive_skips ?? DEFAULT_HEARTBEAT_CONFIG.max_consecutive_skips,
      silent_relay: data.heartbeat.silent_relay ?? DEFAULT_HEARTBEAT_CONFIG.silent_relay,
    };
  } catch {
    return DEFAULT_HEARTBEAT_CONFIG;
  }
}

export async function loadCronConfig(): Promise<CronConfig> {
  try {
    const content = await readFile(`${AFK_CODE_DIR}/cron.yaml`, 'utf-8');
    const data = YAML.parse(content);
    if (!data?.jobs || !Array.isArray(data.jobs)) return DEFAULT_CRON_CONFIG;

    return {
      jobs: data.jobs.map((job: any) => ({
        id: job.id || 'unknown',
        name: job.name || job.id || 'Unnamed',
        schedule: job.schedule || '0 * * * *',
        prompt: job.prompt || '',
        enabled: job.enabled !== false,
        silent_relay: job.silent_relay === true,
      })),
    };
  } catch {
    return DEFAULT_CRON_CONFIG;
  }
}
