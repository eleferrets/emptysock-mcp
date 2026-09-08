import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { dispatchTool, listTools } from '../tools/index.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { env } from '../env.js';

// Track temp files written during tests so we can clean them up
const tempFiles: string[] = [];

afterEach(async () => {
  for (const f of tempFiles.splice(0)) {
    await fsPromises.rm(f, { force: true });
  }
});

describe('listTools', () => {
  it('returns an array of tool definitions', () => {
    const tools = listTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(typeof t.name).toBe('string');
      expect(typeof t.description).toBe('string');
    }
  });

  it('has no duplicate tool names', () => {
    const names = listTools().map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('dispatchTool', () => {
  it('throws MethodNotFound for unknown tools', async () => {
    await expect(dispatchTool('does_not_exist', {})).rejects.toThrow(McpError);
  });

  // --- NavMesh ---

  it('navmesh_find_path returns a path array', async () => {
    const res = await dispatchTool('navmesh_find_path', {
      from: { x: 0, y: 0 },
      to: { x: 10, y: 10 },
      mapId: 'level1',
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { path: unknown[] };
    expect(Array.isArray(parsed.path)).toBe(true);
  });

  it('navmesh_find_path rejects invalid input', async () => {
    await expect(
      dispatchTool('navmesh_find_path', { from: { x: 'bad', y: 0 }, to: { x: 0, y: 0 }, mapId: 'x' }),
    ).rejects.toThrow(McpError);
  });

  it('navmesh_nearest_node returns nearestNode', async () => {
    const res = await dispatchTool('navmesh_nearest_node', {
      mapId: 'level1',
      point: { x: 5, y: 10 },
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { mapId: string; nearestNode: { x: number; y: number } };
    expect(parsed.mapId).toBe('level1');
    expect(parsed.nearestNode).toBeDefined();
    expect(parsed.nearestNode.x).toBe(5);
    expect(parsed.nearestNode.y).toBe(10);
  });

  // --- Physics ---

  it('physics_overlap_circle returns entities array', async () => {
    const res = await dispatchTool('physics_overlap_circle', {
      center: { x: 5, y: 5 },
      radius: 10,
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { entities: unknown[] };
    expect(Array.isArray(parsed.entities)).toBe(true);
  });

  it('physics_raycast_2d returns hit and args', async () => {
    const res = await dispatchTool('physics_raycast_2d', {
      origin: { x: 0, y: 0 },
      direction: { x: 1, y: 0 },
      maxDistance: 100,
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { hit: null; args: { maxDistance: number } };
    expect(parsed.hit).toBeNull();
    expect(parsed.args.maxDistance).toBe(100);
  });

  it('physics_raycast_3d returns hit and args', async () => {
    const res = await dispatchTool('physics_raycast_3d', {
      origin: { x: 0, y: 0, z: 0 },
      direction: { x: 0, y: -1, z: 0 },
      maxDistance: 50,
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { hit: null; args: { maxDistance: number } };
    expect(parsed.hit).toBeNull();
    expect(parsed.args.maxDistance).toBe(50);
  });

  it('physics_body_state returns entityId and null position', async () => {
    const res = await dispatchTool('physics_body_state', { entityId: 'body-001' });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { entityId: string; position: null };
    expect(parsed.entityId).toBe('body-001');
    expect(parsed.position).toBeNull();
  });

  // --- Scene ---

  it('scene_list_entities returns entities for a sceneId', async () => {
    const res = await dispatchTool('scene_list_entities', { sceneId: 'main-menu' });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { sceneId: string };
    expect(parsed.sceneId).toBe('main-menu');
  });

  it('scene_entity_info returns tag, active, and components', async () => {
    const res = await dispatchTool('scene_entity_info', {
      sceneId: 'level1',
      entityId: 'player-001',
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
      sceneId: string;
      entityId: string;
      active: boolean;
      components: unknown[];
    };
    expect(parsed.sceneId).toBe('level1');
    expect(parsed.entityId).toBe('player-001');
    expect(parsed.active).toBe(true);
    expect(Array.isArray(parsed.components)).toBe(true);
  });

  it('scene_get_component returns componentType and entityId', async () => {
    const res = await dispatchTool('scene_get_component', {
      sceneId: 'level1',
      entityId: 'player-001',
      componentType: 'Transform',
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
      sceneId: string;
      entityId: string;
      componentType: string;
    };
    expect(parsed.componentType).toBe('Transform');
    expect(parsed.entityId).toBe('player-001');
    expect(parsed.sceneId).toBe('level1');
  });

  it('scene_create_entity returns an entityId string', async () => {
    const res = await dispatchTool('scene_create_entity', { sceneId: 'level1', tag: 'enemy' });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { entityId: string };
    expect(typeof parsed.entityId).toBe('string');
    expect(parsed.entityId.length).toBeGreaterThan(0);
  });

  // --- Actor ---

  it('actor_broadcast returns broadcast=true', async () => {
    const res = await dispatchTool('actor_broadcast', { message: { type: 'GAME_START' } });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { broadcast: boolean };
    expect(parsed.broadcast).toBe(true);
  });

  it('actor_send_message rejects shell metacharacters in actorId', async () => {
    await expect(
      dispatchTool('actor_send_message', { actorId: 'x; rm -rf /', message: { type: 'PING' } }),
    ).rejects.toThrow(McpError);
  });

  it('actor_send_message returns enqueued=true with valid input', async () => {
    const res = await dispatchTool('actor_send_message', {
      actorId: 'enemy-spawner',
      message: { type: 'SPAWN_WAVE', payload: { wave: 3 } },
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { actorId: string; enqueued: boolean };
    expect(parsed.enqueued).toBe(true);
    expect(parsed.actorId).toBe('enemy-spawner');
  });

  it('actor_inbox_size returns inboxSize as a number', async () => {
    const res = await dispatchTool('actor_inbox_size', { actorId: 'enemy-001' });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { actorId: string; inboxSize: number };
    expect(parsed.actorId).toBe('enemy-001');
    expect(typeof parsed.inboxSize).toBe('number');
  });

  // --- Save ---

  it('save_list returns a slots array', async () => {
    const res = await dispatchTool('save_list', {});
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { slots: string[] };
    expect(Array.isArray(parsed.slots)).toBe(true);
  });

  it('save_write writes slot data to disk', async () => {
    const slot = 'vitest-write-test';
    const data = { score: 42, level: 3 };
    const filePath = path.join(env.saveBaseDir, `${slot}.json`);
    tempFiles.push(filePath);

    const res = await dispatchTool('save_write', { slot, data });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { written: boolean; slot: string };
    expect(parsed.written).toBe(true);
    expect(parsed.slot).toBe(slot);

    const fileContent = await fsPromises.readFile(filePath, 'utf8');
    expect(JSON.parse(fileContent)).toEqual(data);
  });

  it('save_write rejects path traversal in slot name', async () => {
    await expect(
      dispatchTool('save_write', { slot: '../etc/passwd', data: {} }),
    ).rejects.toThrow(McpError);
  });

  it('save_read returns slot data for an existing file', async () => {
    const slot = 'vitest-read-test';
    const data = { hp: 100, name: 'hero' };
    const filePath = path.join(env.saveBaseDir, `${slot}.json`);
    tempFiles.push(filePath);
    await fsPromises.writeFile(filePath, JSON.stringify(data), 'utf8');

    const res = await dispatchTool('save_read', { slot });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { slot: string; data: typeof data };
    expect(parsed.slot).toBe(slot);
    expect(parsed.data).toEqual(data);
  });

  it('save_read returns a textResponse with error for a non-existent slot', async () => {
    const res = await dispatchTool('save_read', { slot: 'nonexistent-slot-xyz' });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { error: string };
    expect(typeof parsed.error).toBe('string');
    expect(parsed.error.length).toBeGreaterThan(0);
  });

  it('save_delete removes a slot file', async () => {
    const slot = 'vitest-delete-test';
    const filePath = path.join(env.saveBaseDir, `${slot}.json`);
    await fsPromises.writeFile(filePath, JSON.stringify({ x: 1 }), 'utf8');

    const res = await dispatchTool('save_delete', { slot });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { deleted: boolean };
    expect(parsed.deleted).toBe(true);

    await expect(fsPromises.access(filePath)).rejects.toThrow();
  });

  it('save_delete with a missing slot does not throw (force: true)', async () => {
    const res = await dispatchTool('save_delete', { slot: 'nonexistent-delete-xyz' });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { deleted: boolean };
    expect(parsed.deleted).toBe(true);
  });

  // --- GMS2 ---

  it('gms2_inspect_project rejects a path with traversal', async () => {
    await expect(
      dispatchTool('gms2_inspect_project', { yypPath: '../../etc/passwd.yyp' }),
    ).rejects.toThrow(McpError);
  });

  it('gms2_inspect_project returns a project summary for a valid .yyp stub', async () => {
    const yypContent = JSON.stringify({
      name: 'MyTestProject',
      resources: [
        { id: { name: 'obj_player', path: 'objects/obj_player/obj_player.yy' } },
        { id: { name: 'obj_enemy', path: 'objects/obj_enemy/obj_enemy.yy' } },
        { id: { name: 'scr_init', path: 'scripts/scr_init/scr_init.yy' } },
        { id: { name: 'rm_level1', path: 'rooms/rm_level1/rm_level1.yy' } },
      ],
    });
    const yypRelPath = 'vitest-test.yyp';
    const yypFilePath = path.join(env.saveBaseDir, yypRelPath);
    tempFiles.push(yypFilePath);
    await fsPromises.writeFile(yypFilePath, yypContent, 'utf8');

    const res = await dispatchTool('gms2_inspect_project', { yypPath: yypRelPath });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
      projectName: string;
      totalResources: number;
      objectNames: string[];
      scriptNames: string[];
    };
    expect(parsed.projectName).toBe('MyTestProject');
    expect(parsed.totalResources).toBe(4);
    expect(parsed.objectNames).toEqual(['obj_enemy', 'obj_player']);
    expect(parsed.scriptNames).toEqual(['scr_init']);
  });

  it('emptysock_layer_info returns an object with methods', async () => {
    const res = await dispatchTool('emptysock_layer_info', {});
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { methods: unknown };
    expect(parsed.methods).toBeDefined();
  });

  // --- Particles ---

  it('particle_emitter_config (get) returns a config with maxParticles', async () => {
    const res = await dispatchTool('particle_emitter_config', { emitterId: 'dust' });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { config: { maxParticles: number } };
    expect(typeof parsed.config.maxParticles).toBe('number');
  });

  it('particle_emitter_config (set) returns updated: true', async () => {
    const res = await dispatchTool('particle_emitter_config', {
      emitterId: 'dust',
      config: { maxParticles: 200 },
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { updated: boolean; config: { maxParticles: number } };
    expect(parsed.updated).toBe(true);
    expect(parsed.config.maxParticles).toBe(200);
  });

  // --- Story Graph ---

  it('story_graph_export returns nodes and edges arrays', async () => {
    const res = await dispatchTool('story_graph_export', { sceneId: 'chapter1' });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { nodes: unknown[]; edges: unknown[] };
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(Array.isArray(parsed.edges)).toBe(true);
  });
});
