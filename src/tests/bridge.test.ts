import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { bridge } from '../lib/bridge.js';
import { env } from '../env.js';
import { dispatchTool } from '../tools/index.js';
import type { EngineQueryRequest } from '../lib/bridgeTypes.js';

/** Wait until a condition is true, or fail after a timeout. */
async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('bridge', () => {
  beforeAll(() => {
    bridge.start();
  });

  afterAll(async () => {
    await bridge.stop();
  });

  it('reports not connected when nothing has dialed in', () => {
    expect(bridge.isConnected).toBe(false);
  });

  describe('with a mock live game connected', () => {
    let client: WebSocket;

    beforeEach(async () => {
      client = new WebSocket(`ws://127.0.0.1:${env.bridgePort}`);
      await new Promise<void>((resolve, reject) => {
        client.once('open', () => resolve());
        client.once('error', reject);
      });
      await waitFor(() => bridge.isConnected);
    });

    afterEach(async () => {
      client.close();
      await waitFor(() => !bridge.isConnected);
    });

    it('relays a query to the client and resolves with its reply', async () => {
      client.on('message', (raw: Buffer) => {
        const request = JSON.parse(raw.toString('utf8')) as EngineQueryRequest;
        expect(request.query.kind).toBe('listEntities');
        client.send(
          JSON.stringify({
            id: request.id,
            result: { ok: true, data: [{ entityId: 1, components: ['Transform'] }] },
          }),
        );
      });

      const result = await bridge.query({ kind: 'listEntities' });
      expect(result).toEqual({ ok: true, data: [{ entityId: 1, components: ['Transform'] }] });
    });

    it('scene_list_entities returns the real relayed data through the tool handler', async () => {
      client.on('message', (raw: Buffer) => {
        const request = JSON.parse(raw.toString('utf8')) as EngineQueryRequest;
        client.send(
          JSON.stringify({
            id: request.id,
            result: { ok: true, data: [{ entityId: 3, components: ['Transform', 'Sprite'] }] },
          }),
        );
      });

      const res = await dispatchTool('scene_list_entities', { sceneId: 'main' });
      const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
        sceneId: string;
        entities: Array<{ entityId: number; components: string[] }>;
      };
      expect(parsed.sceneId).toBe('main');
      expect(parsed.entities).toEqual([{ entityId: 3, components: ['Transform', 'Sprite'] }]);
    });

    it('physics_raycast_2d relays a real hit result', async () => {
      client.on('message', (raw: Buffer) => {
        const request = JSON.parse(raw.toString('utf8')) as EngineQueryRequest;
        expect(request.query.kind).toBe('raycast2d');
        client.send(
          JSON.stringify({
            id: request.id,
            result: {
              ok: true,
              data: { entityId: 7, point: { x: 5, y: 0 }, normal: { x: -1, y: 0 }, toi: 5 },
            },
          }),
        );
      });

      const res = await dispatchTool('physics_raycast_2d', {
        origin: { x: 0, y: 0 },
        direction: { x: 1, y: 0 },
        maxDistance: 100,
      });
      const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
        hit: { entityId: number; point: { x: number; y: number } };
      };
      expect(parsed.hit.entityId).toBe(7);
      expect(parsed.hit.point).toEqual({ x: 5, y: 0 });
    });

    it('propagates a no-physics-world error from the live game as-is', async () => {
      client.on('message', (raw: Buffer) => {
        const request = JSON.parse(raw.toString('utf8')) as EngineQueryRequest;
        client.send(
          JSON.stringify({
            id: request.id,
            result: { ok: false, error: { code: 'no-physics-world', message: 'no physics system' } },
          }),
        );
      });

      const res = await dispatchTool('physics_body_state', { entityId: '1' });
      const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { error: { code: string } };
      expect(parsed.error.code).toBe('no-physics-world');
    });
  });

  it('times out (never hangs) if a connected client never replies, and resolves no-live-instance rather than an empty result', async () => {
    const client = new WebSocket(`ws://127.0.0.1:${env.bridgePort}`);
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve());
      client.once('error', reject);
    });
    await waitFor(() => bridge.isConnected);
    // Deliberately never respond to the query.

    const result = await bridge.query({ kind: 'listEntities' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('no-live-instance');

    client.close();
    await waitFor(() => !bridge.isConnected);
  }, 10_000);
});
