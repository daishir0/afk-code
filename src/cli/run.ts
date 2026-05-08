import { randomUUID } from 'crypto';
import { homedir } from 'os';
import { createConnection, type Socket } from 'net';
import * as pty from 'node-pty';

const DAEMON_SOCKET = '/tmp/afk-code-daemon.sock';

// Get Claude's project directory for the current working directory
function getClaudeProjectDir(cwd: string): string {
  // Claude encodes paths by replacing /, ., and _ with -
  const encodedPath = cwd.replace(/[/._]/g, '-');
  return `${homedir()}/.claude/projects/${encodedPath}`;
}

// Strip ANSI escape codes from terminal output
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b[()][AB012]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

// Rolling screen buffer: keeps last SCREEN_BUFFER_CHARS chars of PTY output (ANSI stripped)
const SCREEN_BUFFER_CHARS = 3000;
let screenBuffer = '';

// Permission prompt detection
// NOTE: patterns are tested against the rolling screen buffer (not per-chunk),
// so they match even when TUI output is split across multiple PTY data events.
const PERMISSION_PATTERNS = [
  /Do you want to make this edit/,
  /Claude needs your permission/,
  /Do you want to proceed/,
  /Do you want to execute/,
  /Do you want to run/,
  /Do you want to create/,
  /which is a sensitive file/,
  /Claude requested permissions/,
];
let lastPermissionNotifyTime = 0;
const PERMISSION_NOTIFY_COOLDOWN = 5000; // 5s cooldown to avoid spam

function appendToScreenBuffer(data: string): void {
  screenBuffer += stripAnsi(data);
  if (screenBuffer.length > SCREEN_BUFFER_CHARS) {
    screenBuffer = screenBuffer.slice(screenBuffer.length - SCREEN_BUFFER_CHARS);
  }
}

// Connect to daemon once (single attempt)
function connectToDaemonOnce(
  sessionId: string,
  projectDir: string,
  cwd: string,
  command: string[],
  onInput: (text: string) => void,
  onDisconnect: () => void,
): Promise<{ close: () => void; socket: Socket } | null> {
  return new Promise((resolve) => {
    const socket = createConnection(DAEMON_SOCKET);
    let messageBuffer = '';
    let resolved = false;

    socket.on('connect', () => {
      resolved = true;
      socket.write(JSON.stringify({
        type: 'session_start',
        id: sessionId,
        projectDir,
        cwd,
        command,
        name: command.join(' '),
      }) + '\n');

      resolve({
        close: () => {
          socket.write(JSON.stringify({ type: 'session_end', sessionId }) + '\n');
          socket.end();
        },
        socket,
      });
    });

    socket.on('data', (data) => {
      messageBuffer += data.toString();
      // Guard against OOM: if a single line exceeds 50MB, drop it
      if (messageBuffer.length > 50 * 1024 * 1024) {
        console.error('[run] messageBuffer exceeded 50MB, dropping to prevent OOM');
        messageBuffer = '';
        return;
      }
      const lines = messageBuffer.split('\n');
      messageBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'input' && msg.text) {
            onInput(msg.text);
          } else if (msg.type === 'screen_request') {
            socket.write(JSON.stringify({ type: 'screen_response', content: screenBuffer }) + '\n');
          }
        } catch {}
      }
    });

    socket.on('error', () => {
      if (!resolved) resolve(null);
    });

    socket.on('close', () => {
      if (resolved) onDisconnect();
    });
  });
}

// Connect to daemon with auto-reconnect. Returns a handle whose .current always points to the
// active socket (or null when not connected), so callers don't need to track reconnections.
function connectToDaemon(
  sessionId: string,
  projectDir: string,
  cwd: string,
  command: string[],
  onInput: (text: string) => void,
): { current: { socket: Socket } | null; close: () => void } {
  const handle: { current: { socket: Socket } | null; close: () => void } = {
    current: null,
    close: () => { stopped = true; handle.current?.socket.destroy(); },
  };
  let stopped = false;

  async function attempt() {
    if (stopped) return;
    const conn = await connectToDaemonOnce(sessionId, projectDir, cwd, command, onInput, () => {
      handle.current = null;
      if (!stopped) {
        // Daemon disappeared - retry in 5s
        setTimeout(attempt, 5000);
      }
    });
    if (conn) {
      handle.current = { socket: conn.socket };
    } else if (!stopped) {
      // Daemon not available yet - retry in 5s
      setTimeout(attempt, 5000);
    }
  }

  attempt();
  return handle;
}

export async function run(command: string[]): Promise<void> {
  const sessionId = randomUUID().slice(0, 8);
  const cwd = process.cwd();
  const projectDir = getClaudeProjectDir(cwd);

  // Show loading spinner while starting
  const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spinnerIndex = 0;
  let spinnerInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
    process.stdout.write(`\r${spinnerFrames[spinnerIndex]} Starting...`);
    spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
  }, 80);

  const stopSpinner = () => {
    if (spinnerInterval) {
      clearInterval(spinnerInterval);
      spinnerInterval = null;
      // Clear the spinner line
      process.stdout.write('\r\x1b[K');
    }
  };

  // Use node-pty for full terminal features + remote input
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;

  const ptyProcess = pty.spawn(command[0], command.slice(1), {
    name: process.env.TERM || 'xterm-256color',
    cols,
    rows,
    cwd,
    env: process.env as Record<string, string>,
  });

  const daemon = connectToDaemon(
    sessionId,
    projectDir,
    cwd,
    command,
    (text) => {
      ptyProcess.write(text);
    }
  );

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  ptyProcess.onData((data: string) => {
    stopSpinner();
    process.stdout.write(data);
    appendToScreenBuffer(data);

    // Detect permission prompts and notify daemon.
    // Test the recent screen buffer (not just the current chunk) because TUI apps
    // write character-by-character, so the full prompt text spans multiple onData calls.
    const conn = daemon.current;
    if (conn) {
      const now = Date.now();
      if (now - lastPermissionNotifyTime > PERMISSION_NOTIFY_COOLDOWN) {
        const recentBuffer = screenBuffer.slice(-500);
        for (const pattern of PERMISSION_PATTERNS) {
          if (pattern.test(recentBuffer)) {
            try {
              conn.socket.write(JSON.stringify({
                type: 'permission_prompt',
                sessionId,
                content: recentBuffer,
              }) + '\n');
            } catch {}
            lastPermissionNotifyTime = now;
            break;
          }
        }
      }
    }
  });

  const onStdinData = (data: Buffer) => {
    ptyProcess.write(data.toString());
  };
  process.stdin.on('data', onStdinData);

  process.stdout.on('resize', () => {
    ptyProcess.resize(process.stdout.columns || 80, process.stdout.rows || 24);
  });

  await new Promise<void>((resolve) => {
    ptyProcess.onExit(() => {
      // Clean up stdin
      process.stdin.removeListener('data', onStdinData);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      if (typeof process.stdin.unref === 'function') {
        process.stdin.unref();
      }

      daemon.close();
      resolve();
    });
  });
}
