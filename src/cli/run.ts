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
const PERMISSION_PATTERNS = [
  /Do you want to make this edit/,
  /Claude needs your permission/,
  /Do you want to proceed/,
  /Do you want to execute/,
  /Do you want to run/,
];
let lastPermissionNotifyTime = 0;
const PERMISSION_NOTIFY_COOLDOWN = 5000; // 5s cooldown to avoid spam

function appendToScreenBuffer(data: string): void {
  screenBuffer += stripAnsi(data);
  if (screenBuffer.length > SCREEN_BUFFER_CHARS) {
    screenBuffer = screenBuffer.slice(screenBuffer.length - SCREEN_BUFFER_CHARS);
  }
}

// Connect to daemon and maintain bidirectional communication
function connectToDaemon(
  sessionId: string,
  projectDir: string,
  cwd: string,
  command: string[],
  onInput: (text: string) => void
): Promise<{ close: () => void; socket: Socket } | null> {
  return new Promise((resolve) => {
    const socket = createConnection(DAEMON_SOCKET);
    let messageBuffer = '';

    socket.on('connect', () => {
      // Tell daemon about this session
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

    socket.on('error', (error) => {
      // Daemon not running - that's okay, run without it
      resolve(null);
    });
  });
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

  const daemon = await connectToDaemon(
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

    // Detect permission prompts and notify daemon
    if (daemon) {
      const stripped = stripAnsi(data);
      const now = Date.now();
      if (now - lastPermissionNotifyTime > PERMISSION_NOTIFY_COOLDOWN) {
        for (const pattern of PERMISSION_PATTERNS) {
          if (pattern.test(stripped)) {
            // Extract recent context from screen buffer for the notification
            const context = screenBuffer.slice(-500);
            try {
              daemon.socket.write(JSON.stringify({
                type: 'permission_prompt',
                sessionId,
                content: context,
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

      daemon?.close();
      resolve();
    });
  });
}
