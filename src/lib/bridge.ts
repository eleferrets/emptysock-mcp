/**
 * The live bridge: a plain WebSocket server this process hosts, so a live
 * game/IDE preview can dial in as the client and answer `EngineQuery`
 * requests through the engine's `QueryChannel` (see that repo's
 * `packages/engine/src/bridge/QueryChannel.ts`). See CLAUDE.md's "The live
 * bridge" section for the protocol this implements.
 *
 * Binds to 127.0.0.1 only, no auth token — a deliberate localhost-only trust
 * model matching how this server already treats local file I/O. Only one
 * live game is expected connected at a time; a newer connection replaces
 * whatever was previously connected rather than being queued or rejected,
 * since a stale/orphaned old connection (crashed dev build, closed preview
 * tab) is far more likely than two real simultaneous games.
 */
import { WebSocketServer, type WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { env } from '../env.js';
import { audit } from './audit.js';
import type { EngineQuery, EngineQueryResult, EngineQueryResponse } from './bridgeTypes.js';

/** How long a query waits for the live game to answer before failing as `no-live-instance`. */
const QUERY_TIMEOUT_MS = 5000;

interface PendingRequest {
  resolve: (result: EngineQueryResult<unknown>) => void;
  timer: ReturnType<typeof setTimeout>;
}

function noLiveInstance<T>(): EngineQueryResult<T> {
  return {
    ok: false,
    error: {
      code: 'no-live-instance',
      message: 'No live engine connected — start the game in the IDE or launch a dev build.',
    },
  };
}

function timedOut<T>(): EngineQueryResult<T> {
  return {
    ok: false,
    error: {
      code: 'no-live-instance',
      message: `The connected live engine did not answer within ${QUERY_TIMEOUT_MS}ms.`,
    },
  };
}

class Bridge {
  private wss: WebSocketServer | undefined;
  private client: WebSocket | undefined;
  private readonly pending = new Map<string, PendingRequest>();

  /** Start listening on 127.0.0.1:env.bridgePort. Safe to call once at server startup. */
  start(): void {
    if (this.wss !== undefined) return;

    this.wss = new WebSocketServer({ host: '127.0.0.1', port: env.bridgePort });

    this.wss.on('connection', (ws) => {
      // Only one live game expected at a time — a fresh connection replaces
      // whatever was previously connected (see module doc comment).
      if (this.client !== undefined && this.client !== ws) {
        try {
          this.client.close();
        } catch {
          // Ignore errors closing a stale socket.
        }
      }
      this.client = ws;
      audit({ kind: 'bridge_connection', event: 'connected' });

      ws.on('message', (raw: Buffer | string) => {
        this.handleMessage(raw);
      });

      ws.on('close', () => {
        if (this.client === ws) this.client = undefined;
        audit({ kind: 'bridge_connection', event: 'disconnected' });
      });

      ws.on('error', (err) => {
        audit({ kind: 'bridge_connection', event: 'error', error: err instanceof Error ? err.message : String(err) });
      });
    });

    this.wss.on('error', (err) => {
      audit({ kind: 'bridge_connection', event: 'error', error: err instanceof Error ? err.message : String(err) });
    });

    audit({ kind: 'bridge_start', port: env.bridgePort });
  }

  private handleMessage(raw: Buffer | string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
    } catch {
      audit({ kind: 'bridge_connection', event: 'error', error: 'received non-JSON message' });
      return;
    }

    const response = parsed as Partial<EngineQueryResponse>;
    if (typeof response.id !== 'string' || response.result === undefined) {
      audit({ kind: 'bridge_connection', event: 'error', error: 'received malformed response envelope' });
      return;
    }

    const inflight = this.pending.get(response.id);
    if (inflight === undefined) return; // Late/duplicate/unrecognised reply — nothing to resolve.

    clearTimeout(inflight.timer);
    this.pending.delete(response.id);
    inflight.resolve(response.result);
  }

  /** Whether a live game is currently connected. */
  get isConnected(): boolean {
    return this.client !== undefined && this.client.readyState === this.client.OPEN;
  }

  /**
   * Send `query` to whichever live game is connected and await its answer.
   * Resolves `{ ok: false, error: { code: "no-live-instance", ... } }` (never
   * throws) when nothing is connected or the connected client doesn't
   * answer within `QUERY_TIMEOUT_MS` — callers should never collapse a
   * timeout into "found nothing" (see CLAUDE.md).
   */
  async query(query: EngineQuery): Promise<EngineQueryResult<unknown>> {
    if (!this.isConnected || this.client === undefined) {
      return noLiveInstance();
    }

    const id = randomUUID();
    const client = this.client;

    return new Promise<EngineQueryResult<unknown>>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(timedOut());
      }, QUERY_TIMEOUT_MS);

      this.pending.set(id, { resolve, timer });

      try {
        client.send(JSON.stringify({ id, query }));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        audit({ kind: 'bridge_connection', event: 'error', error: err instanceof Error ? err.message : String(err) });
        resolve(noLiveInstance());
      }
    });
  }

  /** Close the server and any live connection. For tests/shutdown. */
  async stop(): Promise<void> {
    for (const [id, inflight] of this.pending) {
      clearTimeout(inflight.timer);
      inflight.resolve(noLiveInstance());
      this.pending.delete(id);
    }
    this.client?.close();
    this.client = undefined;
    const wss = this.wss;
    this.wss = undefined;
    if (wss === undefined) return;
    await new Promise<void>((resolve, reject) => {
      wss.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

/** The one bridge instance the whole process shares. */
export const bridge = new Bridge();

/** Convenience wrapper tool handlers call directly. */
export async function queryLiveGame(query: EngineQuery): Promise<EngineQueryResult<unknown>> {
  return bridge.query(query);
}
