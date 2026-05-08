/**
 * File logger that mirrors all console output to a daily rotating log file.
 * Captures stack traces for errors and fatal exceptions.
 * Logs go to ~/.afk-code/logs/telegram-YYYY-MM-DD.log (7-day retention).
 */

import { appendFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const LOG_DIR = join(homedir(), '.afk-code', 'logs');
const MAX_LOG_DAYS = 7;

function getLogPath(): string {
  const date = new Date().toISOString().split('T')[0];
  return join(LOG_DIR, `telegram-${date}.log`);
}

function formatArgs(args: any[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) {
        return `${a.message}\n  Stack: ${a.stack ?? '(no stack)'}`;
      }
      if (a !== null && typeof a === 'object') {
        try { return JSON.stringify(a); } catch { return '[Circular]'; }
      }
      return String(a ?? '');
    })
    .join(' ');
}

function writeSync(level: string, args: any[]): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${formatArgs(args)}\n`;
  try {
    appendFileSync(getLogPath(), line, 'utf8');
  } catch {
    // Never crash because of a logging failure
  }
}

function pruneOldLogs(): void {
  try {
    const files = readdirSync(LOG_DIR)
      .filter((f) => /^telegram-\d{4}-\d{2}-\d{2}\.log$/.test(f))
      .map((f) => ({ path: join(LOG_DIR, f), mtime: statSync(join(LOG_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const file of files.slice(MAX_LOG_DAYS)) {
      try { unlinkSync(file.path); } catch {}
    }
  } catch {}
}

let installed = false;

export function setupFileLogger(): void {
  if (installed) return;
  installed = true;

  try {
    mkdirSync(LOG_DIR, { recursive: true });
    pruneOldLogs();
  } catch {}

  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  console.log = (...args: any[]) => {
    origLog(...args);
    writeSync('INFO', args);
  };

  console.warn = (...args: any[]) => {
    origWarn(...args);
    writeSync('WARN', args);
  };

  console.error = (...args: any[]) => {
    origError(...args);
    writeSync('ERROR', args);
  };

  // Fatal: uncaught synchronous exception — write directly (console may be dead)
  process.on('uncaughtException', (err) => {
    const ts = new Date().toISOString();
    const line = `[${ts}] [FATAL] Uncaught exception: ${err.message}\n  Stack: ${err.stack ?? '(no stack)'}\n`;
    try { appendFileSync(getLogPath(), line, 'utf8'); } catch {}
    origError('[FATAL] Uncaught exception:', err);
    process.exit(1);
  });

  // Unhandled promise rejections — log with full stack
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    const ts = new Date().toISOString();
    const line = `[${ts}] [ERROR] Unhandled rejection: ${err.message}\n  Stack: ${err.stack ?? '(no stack)'}\n`;
    try { appendFileSync(getLogPath(), line, 'utf8'); } catch {}
    origError('[ERROR] Unhandled rejection:', reason);
  });

  // Stamp process exit
  process.once('exit', (code) => {
    const ts = new Date().toISOString();
    const line = `[${ts}] [INFO] Process exit (code=${code})\n`;
    try { appendFileSync(getLogPath(), line, 'utf8'); } catch {}
  });

  const startLine = `[${new Date().toISOString()}] [INFO] ===== Telegram bot starting (PID=${process.pid}) =====\n`;
  try { appendFileSync(getLogPath(), startLine, 'utf8'); } catch {}
  origLog('[Logger] File logging active:', getLogPath());
}
