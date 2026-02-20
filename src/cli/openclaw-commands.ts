/**
 * CLI commands for OpenClaw integration: heartbeat, cron, memory, status.
 */

import { readFile, readdir, stat } from 'fs/promises';
import { homedir } from 'os';
import { loadHeartbeatConfig, loadCronConfig } from '../scheduler/config-loader.js';

const AFK_CODE_DIR = `${homedir()}/.afk-code`;
const STATE_FILE = `${AFK_CODE_DIR}/scheduler-state.json`;

export async function heartbeatCommand(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  switch (subcommand) {
    case 'status': {
      const config = await loadHeartbeatConfig();
      let state = { lastBeatTime: null as string | null, beatCount: 0, consecutiveSkips: 0 };
      try {
        const content = await readFile(STATE_FILE, 'utf-8');
        state = JSON.parse(content);
      } catch {}

      console.log('Heartbeat Status:');
      console.log(`  Enabled:           ${config.enabled ? 'Yes' : 'No'}`);
      console.log(`  Interval:          ${config.interval_minutes} min`);
      console.log(`  Quiet hours:       ${config.quiet_hours.start}:00 - ${config.quiet_hours.end}:00`);
      console.log(`  Beat count:        ${state.beatCount}`);
      console.log(`  Last beat:         ${state.lastBeatTime || 'Never'}`);
      console.log(`  Consecutive skips: ${state.consecutiveSkips}`);
      break;
    }

    default:
      console.log('Usage: afk-code heartbeat [status]');
  }
}

export async function cronCommand(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  switch (subcommand) {
    case 'list': {
      const config = await loadCronConfig();
      if (config.jobs.length === 0) {
        console.log('No cron jobs configured.');
        console.log('Edit ~/.afk-code/cron.yaml to add jobs.');
        return;
      }

      console.log('Cron Jobs:');
      for (const job of config.jobs) {
        const status = job.enabled ? 'active' : 'disabled';
        console.log(`  [${status}] ${job.name} (${job.schedule})`);
      }
      break;
    }

    default:
      console.log('Usage: afk-code cron [list]');
  }
}

export async function memoryCommand(args: string[]): Promise<void> {
  const subcommand = args[0] || 'status';

  switch (subcommand) {
    case 'status': {
      try {
        const memoryStat = await stat(`${AFK_CODE_DIR}/MEMORY.md`);
        const soulExists = await stat(`${AFK_CODE_DIR}/SOUL.md`).then(() => true).catch(() => false);

        let dailyNoteCount = 0;
        try {
          const memoryDir = await readdir(`${AFK_CODE_DIR}/memory`);
          dailyNoteCount = memoryDir.filter((f) => f.endsWith('.md')).length;
        } catch {}

        console.log('Memory Status:');
        console.log(`  SOUL.md:       ${soulExists ? 'Present' : 'Missing'}`);
        console.log(`  MEMORY.md:     Present (last modified: ${memoryStat.mtime.toISOString()})`);
        console.log(`  Daily notes:   ${dailyNoteCount}`);
      } catch {
        console.log('Memory files not initialized. Run `afk-code init` first.');
      }
      break;
    }

    case 'list': {
      try {
        const memoryDir = await readdir(`${AFK_CODE_DIR}/memory`);
        const notes = memoryDir.filter((f) => f.endsWith('.md')).sort().reverse();

        if (notes.length === 0) {
          console.log('No daily notes found.');
          return;
        }

        console.log('Daily Notes:');
        for (const note of notes.slice(0, 10)) {
          console.log(`  ${note}`);
        }
        if (notes.length > 10) {
          console.log(`  ... and ${notes.length - 10} more`);
        }
      } catch {
        console.log('No memory directory found. Run `afk-code init` first.');
      }
      break;
    }

    case 'today': {
      const today = new Date().toISOString().split('T')[0];
      try {
        const content = await readFile(`${AFK_CODE_DIR}/memory/${today}.md`, 'utf-8');
        console.log(content);
      } catch {
        console.log(`No daily note for today (${today}).`);
      }
      break;
    }

    default:
      console.log('Usage: afk-code memory [status|list|today]');
  }
}

export async function statusCommand(): Promise<void> {
  console.log('AFK Code Status\n');

  // Check config files
  const files = ['SOUL.md', 'HEARTBEAT.md', 'MEMORY.md', 'scheduler.yaml', 'cron.yaml'];
  console.log('Config Files:');
  for (const file of files) {
    const exists = await stat(`${AFK_CODE_DIR}/${file}`).then(() => true).catch(() => false);
    console.log(`  ${exists ? '[OK]' : '[MISSING]'} ${file}`);
  }

  // Heartbeat status
  const hbConfig = await loadHeartbeatConfig();
  console.log(`\nHeartbeat: ${hbConfig.enabled ? 'Enabled' : 'Disabled'} (${hbConfig.interval_minutes} min)`);

  // Cron jobs
  const cronConfig = await loadCronConfig();
  const activeJobs = cronConfig.jobs.filter((j) => j.enabled);
  console.log(`Cron Jobs: ${activeJobs.length} active / ${cronConfig.jobs.length} total`);

  // Memory
  let dailyNoteCount = 0;
  try {
    const memoryDir = await readdir(`${AFK_CODE_DIR}/memory`);
    dailyNoteCount = memoryDir.filter((f) => f.endsWith('.md')).length;
  } catch {}
  console.log(`Daily Notes: ${dailyNoteCount}`);
}
