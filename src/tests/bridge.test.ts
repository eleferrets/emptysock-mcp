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

    // --- NavMesh ---

    it('navmesh_find_path relays a real path result', async () => {
      client.on('message', (raw: Buffer) => {
        const request = JSON.parse(raw.toString('utf8')) as EngineQueryRequest;
        expect(request.query.kind).toBe('navmeshFindPath');
        client.send(
          JSON.stringify({
            id: request.id,
            result: { ok: true, data: [{ x: 0, y: 0 }, { x: 10, y: 10 }] },
          }),
        );
      });

      const res = await dispatchTool('navmesh_find_path', {
        from: { x: 0, y: 0 },
        to: { x: 10, y: 10 },
        mapId: 'level1',
      });
      const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
        path: Array<{ x: number; y: number }> | null;
      };
      expect(parsed.path).toEqual([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    });

    it('navmesh_find_path relays a real "no path" (null) result', async () => {
      client.on('message', (raw: Buffer) => {
        const request = JSON.parse(raw.toString('utf8')) as EngineQueryRequest;
        client.send(JSON.stringify({ id: request.id, result: { ok: true, data: null } }));
      });

      const res = await dispatchTool('navmesh_find_path', {
        from: { x: 0, y: 0 },
        to: { x: 10, y: 10 },
        mapId: 'level1',
      });
      const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { path: null };
      expect(parsed.path).toBeNull();
    });

    it('navmesh_nearest_node relays a real node result', async () => {
      client.on('message', (raw: Buffer) => {
        const request = JSON.parse(raw.toString('utf8')) as EngineQueryRequest;
        expect(request.query.kind).toBe('navmeshNearestNode');
        client.send(JSON.stringify({ id: request.id, result: { ok: true, data: { x: 3, y: 4 } } }));
      });

      const res = await dispatchTool('navmesh_nearest_node', { mapId: 'level1', point: { x: 3, y: 5 } });
      const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { node: { x: number; y: number } | null };
      expect(parsed.node).toEqual({ x: 3, y: 4 });
    });

    it('navmesh_find_path propagates a no-navmesh error from the live game as-is', async () => {
      client.on('message', (raw: Buffer) => {
        const request = JSON.parse(raw.toString('utf8')) as EngineQueryRequest;
        client.send(
          JSON.stringify({
            id: request.id,
            result: { ok: false, error: { code: 'no-navmesh', message: 'no navmesh attached' } },
          }),
        );
      });

      const res = await dispatchTool('navmesh_find_path', {
        from: { x: 0, y: 0 },
        to: { x: 1, y: 1 },
        mapId: 'level1',
      });
      const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { error: { code: string } };
      expect(parsed.error.code).toBe('no-navmesh');
    });

    // --- Actor ---

    it('actor_send_message relays a real queued result', async () => {
      client.on('message', (raw: Buffer) => {
        const request = JSON.parse(raw.toString('utf8')) as EngineQueryRequest;
        expect(request.query.kind).toBe('actorSendMessage');
        client.send(
          JSON.stringify({ id: request.id, result: { ok: true, data: { actorId: 'enemy-spawner', queued: true } } }),
        );
      });

      const res = await dispatchTool('actor_send_message', {
        actorId: 'enemy-spawner',
        message: { type: 'SPAWN_WAVE', payload: { wave: 3 } },
      });
      const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { actorId: string; queued: boolean };
      expect(parsed.actorId).toBe('enemy-spawner');
      expect(parsed.queued).toBe(true);
    });

    it('actor_send_message propagates a not-found error for an unknown actor', async () => {
      client.on('message', (raw: Buffer) => {
        const request = JSON.parse(raw.toString('utf8')) as EngineQueryRequest;
        client.send(
          JSON.stringify({ id: request.id, result: { ok: false, error: { code: 'not-found', message: 'no such actor' } } }),
        );
      });

      const res = await dispatchTool('actor_send_message', {
        actorId: 'does-not-exist',
        message: { type: 'PING' },
      });
      const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { error: { code: string } };
      expect(parsed.error.code).toBe('not-found');
    });

    it('actor_broadcast relays a real delivered count', async () => {
      client.on('message', (raw: Buffer) => {
        const request = JSON.parse(raw.toString('utf8')) as EngineQueryRequest;
        expect(request.query.kind).toBe('actorBroadcast');
        client.send(JSON.stringify({ id: request.id, result: { ok: true, data: { delivered: 4 } } }));
      });

      const res = await dispatchTool('actor_broadcast', { message: { type: 'GAME_START' } });
      const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { delivered: number };
      expect(parsed.delivered).toBe(4);
    });

    it('actor_inbox_size relays a real count', async () => {
      client.on('message', (raw: Buffer) => {
        const request = JSON.parse(raw.toString('utf8')) as EngineQueryRequest;
        expect(request.query.kind).toBe('actorInboxSize');
        client.send(JSON.stringify({ id: request.id, result: { ok: true, data: 2 } }));
      });

      const res = await dispatchTool('actor_inbox_size', { actorId: 'enemy-001' });
      const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { inboxSize: number };
      expect(parsed.inboxSize).toBe(2);
    });

    it('actor_list relays the real actor id list', async () => {
      client.on('message', (raw: Buffer) => {
        const request = JSON.parse(raw.toString('utf8')) as EngineQueryRequest;
        expect(request.query.kind).toBe('actorList');
        client.send(JSON.stringify({ id: request.id, result: { ok: true, data: ['enemy-001', 'enemy-spawner'] } }));
      });

      const res = await dispatchTool('actor_list', {});
      const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { actors: string[] };
      expect(parsed.actors).toEqual(['enemy-001', 'enemy-spawner']);
    });

    it('actor_broadcast propagates a no-actor-system error from the live game as-is', async () => {
      client.on('message', (raw: Buffer) => {
        const request = JSON.parse(raw.toString('utf8')) as EngineQueryRequest;
        client.send(
          JSON.stringify({
            id: request.id,
            result: { ok: false, error: { code: 'no-actor-system', message: 'no ActorSystem attached' } },
          }),
        );
      });

      const res = await dispatchTool('actor_broadcast', { message: { type: 'GAME_START' } });
      const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { error: { code: string } };
      expect(parsed.error.code).toBe('no-actor-system');
    });

    // --- scene_create_entity ---

    it('scene_create_entity relays a real created entity', async () => {
      client.on('message', (raw: Buffer) => {
        const request = JSON.parse(raw.toString('utf8')) as EngineQueryRequest;
        expect(request.query.kind).toBe('createEntity');
        client.send(
          JSON.stringify({
            id: request.id,
            result: {
              ok: true,
              data: { entityId: 9, tag: 'enemy', components: ['Transform'], skipped: ['NotARealComponent'] },
            },
          }),
        );
      });

      const res = await dispatchTool('scene_create_entity', {
        sceneId: 'level1',
        tag: 'enemy',
        components: ['Transform', 'NotARealComponent'],
      });
      const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
        sceneId: string;
        entityId: number;
        tag: string | null;
        components: string[];
        skipped: string[];
      };
      expect(parsed.sceneId).toBe('level1');
      expect(parsed.entityId).toBe(9);
      expect(parsed.tag).toBe('enemy');
      expect(parsed.components).toEqual(['Transform']);
      expect(parsed.skipped).toEqual(['NotARealComponent']);
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
