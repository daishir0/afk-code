import WebSocket from 'ws';
import { exec } from 'child_process';
import { promisify } from 'util';
import { homedir, hostname } from 'os';
import { randomUUID } from 'crypto';
import { readFile, readdir, stat, writeFile, mkdir } from 'fs/promises';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { parseJsonlTurns, backupJsonl, truncateJsonlToLine, copyJsonlTruncated } from '../telegram/jsonl-parser.js';

const execAsync = promisify(exec);
const AFK_DIR = `${homedir()}/.afk-code`;

export interface AgentOptions {
  server: string;
  apiKey: string;
}

interface Envelope {
  v?: number;
  type: string;
  id?: string;
  hostId?: string;
  sessionId?: string;
  payload?: Record<string, unknown>;
}

type Projects = { name: string; path: string }[];

function toWsUrl(httpUrl: string): string {
  const u = httpUrl.replace(/\/+$/, '');
  if (u.startsWith('https://')) return 'wss://' + u.slice(8) + '/api/agent/ws';
  if (u.startsWith('http://')) return 'ws://' + u.slice(7) + '/api/agent/ws';
  return u + '/api/agent/ws';
}

async function loadProjects(): Promise<Projects> {
  try {
    const raw = await readFile(`${AFK_DIR}/projects.yaml`, 'utf-8');
    const data = parseYaml(raw) as { projects?: Record<string, string> };
    const projects = data?.projects ?? {};
    return Object.entries(projects).map(([name, p]) => ({
      name,
      path: String(p).replace(/^~/, homedir()),
    }));
  } catch {
    return [];
  }
}

function claudeProjectDir(cwd: string): string {
  return `${homedir()}/.claude/projects/${cwd.replace(/[/._]/g, '-')}`;
}

async function findActiveJsonl(cwd: string): Promise<string | null> {
  const dir = claudeProjectDir(cwd);
  try {
    const files = await readdir(dir);
    const jsonl = files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'));
    if (!jsonl.length) return null;
    const withStat = await Promise.all(jsonl.map(async (f) => ({ p: join(dir, f), m: (await stat(join(dir, f))).mtimeMs })));
    withStat.sort((a, b) => b.m - a.m);
    return withStat[0].p;
  } catch {
    return null;
  }
}

export async function runAgent(options: AgentOptions): Promise<void> {
  const hostName = process.env.AFK_HOST_NAME || hostname();
  let hostId = '';
  // sessionId (hostId-suffix) -> tmux window + cwd
  const sessions = new Map<string, { window: string; cwd: string; projectName: string }>();
  const projectWindow = new Map<string, { window: string; cwd: string }>();
  const downloads = new Map<string, ReturnType<typeof createWriteStream>>();

  async function ensureTmux(): Promise<void> {
    try {
      await execAsync('tmux has-session -t afk');
    } catch {
      await execAsync('tmux new-session -d -s afk -n main');
    }
  }

  async function spawnRun(projectName: string | undefined, cwd: string, continueFlag: boolean): Promise<string> {
    await ensureTmux();
    const suffix = randomUUID().slice(0, 8);
    const sessionId = `${hostId}-${suffix}`;
    const window = `afk-${suffix}`;
    const escapedDir = cwd.replace(/'/g, "'\\''");
    const extra = continueFlag ? ' --continue' : '';
    const inner =
      `unset CLAUDECODE; cd '${escapedDir}' && (source ~/.nvm/nvm.sh 2>/dev/null || true) && ` +
      `AFK_SESSION_ID='${suffix}' AFK_HOST_ID='${hostId}' AFK_HOST_NAME='${hostName.replace(/'/g, '')}' ` +
      `afk-code run --restart --server '${options.server}' --api-key '${options.apiKey}' --host-id '${hostId}' ` +
      `-- claude --dangerously-skip-permissions${extra}`;
    const escapedCmd = inner.replace(/'/g, "'\\''");
    await execAsync(`tmux new-window -t afk -n '${window}' '${escapedCmd}'`);
    sessions.set(sessionId, { window, cwd, projectName: projectName ?? cwd });
    if (projectName) projectWindow.set(projectName, { window, cwd });
    return sessionId;
  }

  function send(ws: WebSocket, type: string, payload: Record<string, unknown>, id?: string) {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ v: 1, type, hostId, id, payload }) + '\n');
  }

  async function handle(ws: WebSocket, env: Envelope) {
    const p = env.payload ?? {};
    switch (env.type) {
      case 'welcome': {
        hostId = String(p.hostId ?? env.hostId ?? '');
        const projects = await loadProjects();
        // persist hostId for spawned run processes
        await mkdir(AFK_DIR, { recursive: true }).catch(() => {});
        await writeFile(`${AFK_DIR}/host.json`, JSON.stringify({ hostId, hostName }, null, 2)).catch(() => {});
        send(ws, 'register', { hostName, projects });
        console.log(`[agent] registered as hostId=${hostId} with ${projects.length} projects`);
        break;
      }
      case 'list_projects': {
        const projects = await loadProjects();
        send(ws, 'list_projects_response', { reqId: p.reqId, projects }, String(p.reqId ?? ''));
        break;
      }
      case 'spawn_session': {
        const projects = await loadProjects();
        const proj = projects.find((x) => x.name === p.projectName);
        const cwd = String(p.cwd ?? proj?.path ?? process.cwd());
        // reuse existing window for this project if present
        if (p.projectName && projectWindow.has(String(p.projectName))) break;
        await spawnRun(p.projectName ? String(p.projectName) : undefined, cwd, Boolean(p.continueFlag));
        break;
      }
      case 'kill_session': {
        const s = sessions.get(String(p.sessionId));
        if (s) {
          await execAsync(`tmux kill-window -t afk:'${s.window}'`).catch(() => {});
          sessions.delete(String(p.sessionId));
        }
        break;
      }
      case 'list_turns': {
        const s = sessions.get(String(p.sessionId));
        const jsonl = s ? await findActiveJsonl(s.cwd) : null;
        const turns = jsonl ? await parseJsonlTurns(jsonl).catch(() => []) : [];
        send(ws, 'turns_response', { reqId: p.reqId, turns });
        break;
      }
      case 'rewind_session': {
        const s = sessions.get(String(p.sessionId));
        const jsonl = s ? await findActiveJsonl(s.cwd) : null;
        if (s && jsonl) {
          await backupJsonl(jsonl);
          await truncateJsonlToLine(jsonl, Number(p.endLineIndex));
          await execAsync(`tmux kill-window -t afk:'${s.window}'`).catch(() => {});
          sessions.delete(String(p.sessionId));
          await spawnRun(s.projectName, s.cwd, true);
        }
        break;
      }
      case 'fork_session': {
        const s = sessions.get(String(p.sessionId));
        const jsonl = s ? await findActiveJsonl(s.cwd) : null;
        if (s && jsonl) {
          const forkPath = jsonl.replace(/\.jsonl$/, `-fork-${randomUUID().slice(0, 6)}.jsonl`);
          await copyJsonlTruncated(jsonl, forkPath, Number(p.endLineIndex));
          await spawnRun(s.projectName, s.cwd, true);
        }
        break;
      }
      case 'delegate_task': {
        // Ensure a session for the target project, then inject the prompt via tmux.
        const projects = await loadProjects();
        const proj = projects.find((x) => x.name === p.targetProjectName);
        const cwd = proj?.path ?? process.cwd();
        let win = p.targetProjectName ? projectWindow.get(String(p.targetProjectName)) : undefined;
        if (!win) {
          await spawnRun(p.targetProjectName ? String(p.targetProjectName) : undefined, cwd, true);
          win = projectWindow.get(String(p.targetProjectName));
          await new Promise((r) => setTimeout(r, 6000)); // let claude boot
        }
        const target = win?.window ?? sessions.values().next().value?.window;
        if (target) {
          const prompt = String(p.prompt ?? '');
          const marker = String(p.marker ?? '');
          const full = `${prompt}\n\n【完了したら必ず最後に「${marker}」と、結果の要約に続けて出力してください。】`;
          const escaped = full.replace(/'/g, "'\\''");
          await execAsync(`tmux send-keys -t afk:'${target}' '${escaped}' Enter`).catch((e) => console.error('[agent] send-keys', e));
        }
        break;
      }
      case 'file_push': {
        const transferId = String(p.transferId);
        const s = p.sessionId ? sessions.get(String(p.sessionId)) : undefined;
        const destDir = String(p.destPath ?? s?.cwd ?? process.cwd());
        const dest = join(destDir, String(p.filename ?? transferId));
        downloads.set(transferId, createWriteStream(dest));
        break;
      }
      case 'file_chunk': {
        const transferId = String(p.transferId);
        const st = downloads.get(transferId);
        if (st) {
          if (p.dataB64) st.write(Buffer.from(String(p.dataB64), 'base64'));
          if (p.last) {
            st.end();
            downloads.delete(transferId);
          }
        }
        break;
      }
    }
  }

  function connect() {
    const ws = new WebSocket(toWsUrl(options.server));
    let buffer = '';
    ws.on('open', () => {
      console.log('[agent] connected, sending hello');
      ws.send(JSON.stringify({ v: 1, type: 'hello', payload: { role: 'agent', apiKey: options.apiKey, hostName } }) + '\n');
    });
    ws.on('message', (data: WebSocket.RawData) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          handle(ws, JSON.parse(line) as Envelope);
        } catch (e) {
          console.error('[agent] handle error', e);
        }
      }
    });
    ws.on('close', () => {
      console.log('[agent] disconnected, retrying in 5s');
      setTimeout(connect, 5000);
    });
    ws.on('error', (e) => console.error('[agent] ws error', (e as Error).message));
  }

  console.log(`[agent] starting: server=${options.server} host=${hostName}`);
  connect();
  // keep process alive
  await new Promise<void>(() => {});
}
