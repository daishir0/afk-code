import WebSocket from 'ws';

/**
 * Outbound WebSocket connection from a `run` process to afk-server.
 * Sends structured session events; receives input / screen_request. Mirrors the
 * shape of the original Unix-socket protocol but over WSS so a run process on a
 * home Mac (behind NAT) can dial out to the server.
 */

export interface RemoteSinkOptions {
  serverUrl: string; // https://afk-server.path-finder.jp
  apiKey: string;
  hostId: string;
  hostName?: string;
  sessionId: string;
  sessionMeta: { projectDir: string; cwd: string; command: string; name?: string; parentId?: string };
  onInput: (text: string) => void;
  onScreenRequest: () => void;
}

function toWsUrl(httpUrl: string): string {
  const u = httpUrl.replace(/\/+$/, '');
  if (u.startsWith('https://')) return 'wss://' + u.slice('https://'.length) + '/api/agent/ws';
  if (u.startsWith('http://')) return 'ws://' + u.slice('http://'.length) + '/api/agent/ws';
  return u + '/api/agent/ws';
}

export class RemoteWsSink {
  private ws: WebSocket | null = null;
  private connected = false;
  private stopped = false;
  private buffer = '';

  constructor(private opts: RemoteSinkOptions) {}

  start(): void {
    this.connect();
  }

  private connect(): void {
    if (this.stopped) return;
    const url = toWsUrl(this.opts.serverUrl);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('open', () => {
      this.send('hello', { role: 'runner', apiKey: this.opts.apiKey, hostName: this.opts.hostName });
    });

    ws.on('message', (data: WebSocket.RawData) => {
      this.buffer += data.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const env = JSON.parse(line) as { type: string; payload?: Record<string, unknown> };
          this.handle(env);
        } catch {
          /* ignore */
        }
      }
    });

    ws.on('close', () => {
      this.connected = false;
      this.ws = null;
      if (!this.stopped) setTimeout(() => this.connect(), 5000);
    });
    ws.on('error', () => {
      /* close handler will retry */
    });
  }

  private handle(env: { type: string; payload?: Record<string, unknown> }): void {
    if (env.type === 'welcome') {
      this.connected = true;
      // (re)announce this session
      this.send('session_start', {
        sessionId: this.opts.sessionId,
        projectDir: this.opts.sessionMeta.projectDir,
        cwd: this.opts.sessionMeta.cwd,
        command: this.opts.sessionMeta.command,
        name: this.opts.sessionMeta.name,
        parentId: this.opts.sessionMeta.parentId,
      });
    } else if (env.type === 'input') {
      const text = String(env.payload?.text ?? '');
      if (text) this.opts.onInput(text);
    } else if (env.type === 'screen_request') {
      this.opts.onScreenRequest();
    }
  }

  /** Emit a structured session event to the server. */
  emit(type: string, payload: Record<string, unknown>): void {
    this.send(type, { sessionId: this.opts.sessionId, ...payload });
  }

  private send(type: string, payload: Record<string, unknown>): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const env = {
      v: 1,
      type,
      hostId: this.opts.hostId,
      sessionId: this.opts.sessionId,
      payload,
    };
    try {
      ws.send(JSON.stringify(env) + '\n');
    } catch {
      /* ignore */
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  close(): void {
    this.stopped = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send('session_end', { sessionId: this.opts.sessionId });
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
  }
}
