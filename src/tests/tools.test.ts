import { describe, it, expect } from 'vitest';
import { dispatchTool, listTools } from '../tools/index.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

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

  it('physics_overlap_circle returns entities array', async () => {
    const res = await dispatchTool('physics_overlap_circle', {
      center: { x: 5, y: 5 },
      radius: 10,
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { entities: unknown[] };
    expect(Array.isArray(parsed.entities)).toBe(true);
  });

  it('scene_list_entities returns entities for a sceneId', async () => {
    const res = await dispatchTool('scene_list_entities', { sceneId: 'main-menu' });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { sceneId: string };
    expect(parsed.sceneId).toBe('main-menu');
  });

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

  it('save_list returns a slots array', async () => {
    const res = await dispatchTool('save_list', {});
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { slots: string[] };
    expect(Array.isArray(parsed.slots)).toBe(true);
  });

  it('gms2_inspect_project rejects a path with traversal', async () => {
    await expect(
      dispatchTool('gms2_inspect_project', { yypPath: '../../etc/passwd.yyp' }),
    ).rejects.toThrow(McpError);
  });

  it('emptysock_layer_info returns an object with methods', async () => {
    const res = await dispatchTool('emptysock_layer_info', {});
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { methods: unknown };
    expect(parsed.methods).toBeDefined();
  });

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

  it('story_graph_export returns nodes and edges arrays', async () => {
    const res = await dispatchTool('story_graph_export', { sceneId: 'chapter1' });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { nodes: unknown[]; edges: unknown[] };
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(Array.isArray(parsed.edges)).toBe(true);
  });

  it('scene_create_entity returns an entityId string', async () => {
    const res = await dispatchTool('scene_create_entity', { sceneId: 'level1', tag: 'enemy' });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { entityId: string };
    expect(typeof parsed.entityId).toBe('string');
    expect(parsed.entityId.length).toBeGreaterThan(0);
  });
});
