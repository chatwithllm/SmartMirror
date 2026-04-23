import { connection, toasts } from '$lib/stores/connection.js';

export interface HAClientOptions {
  hassUrl: string;
  accessToken: string;
  /** Backoff schedule in ms — spec: 1s, 2s, 4s, 8s, 15s, 30s capped. */
  backoffMs?: number[];
}

type EventHandler = (data: unknown) => void;

/**
 * Thin wrapper around home-assistant-js-websocket with:
 *  - long-lived-token auth
 *  - exponential backoff reconnect
 *  - a connection store that UI can show
 *
 * We import the WS lib lazily so SSR and tests don't try to open sockets.
 */
export class HAClient {
  private conn:
    | Awaited<ReturnType<typeof import('home-assistant-js-websocket').createConnection>>
    | null = null;
  private listeners = new Map<string, Set<EventHandler>>();
  private stopped = false;
  private attempt = 0;
  private readonly backoff: number[];

  constructor(private readonly opts: HAClientOptions) {
    this.backoff = opts.backoffMs ?? [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];
  }

  async start(): Promise<void> {
    connection.set({ kind: 'connecting' });
    await this.connectOnce();
  }

  stop(): void {
    this.stopped = true;
    this.conn?.close();
    this.conn = null;
    connection.set({ kind: 'down', reason: 'stopped' });
  }

  onEvent(eventType: string, handler: EventHandler): () => void {
    const set = this.listeners.get(eventType) ?? new Set<EventHandler>();
    set.add(handler);
    this.listeners.set(eventType, set);
    this.conn?.subscribeEvents(
      (ev: { data: unknown }) => handler(ev.data),
      eventType
    );
    return () => {
      set.delete(handler);
    };
  }

  async callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    if (!this.conn) throw new Error('HA client not connected');
    const { callService } = await import('home-assistant-js-websocket');
    await callService(this.conn, domain, service, data);
  }

  private async connectOnce(): Promise<void> {
    try {
      const lib = await import('home-assistant-js-websocket');
      const auth = lib.createLongLivedTokenAuth(this.opts.hassUrl, this.opts.accessToken);
      this.conn = await lib.createConnection({ auth });
      this.conn.addEventListener('disconnected', () => this.scheduleReconnect('disconnected'));
      this.conn.addEventListener('ready', () => {
        this.attempt = 0;
        connection.set({ kind: 'connected', since: Date.now() });
      });
      // Rewire any prior event subscriptions after reconnect.
      for (const [eventType, set] of this.listeners) {
        for (const h of set) {
          this.conn.subscribeEvents((ev: { data: unknown }) => h(ev.data), eventType);
        }
      }
      connection.set({ kind: 'connected', since: Date.now() });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      toasts.push('error', `HA connect failed: ${reason}`);
      this.scheduleReconnect(reason);
    }
  }

  private scheduleReconnect(reason: string): void {
    if (this.stopped) return;
    const delay = this.backoff[Math.min(this.attempt, this.backoff.length - 1)];
    this.attempt += 1;
    connection.set({ kind: 'reconnecting', attempt: this.attempt, nextRetryMs: delay });
    setTimeout(() => {
      if (!this.stopped) void this.connectOnce();
    }, delay);
    void reason;
  }
}
