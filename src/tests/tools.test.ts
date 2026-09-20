import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { dispatchTool, listTools } from '../tools/index.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { env } from '../env.js';

// Track temp files written during tests so we can clean them up
const tempFiles: string[] = [];
// Track temp directories written during tests so we can clean them up recursively
const tempDirs: string[] = [];

afterEach(async () => {
  for (const f of tempFiles.splice(0)) {
    await fsPromises.rm(f, { force: true });
  }
  for (const d of tempDirs.splice(0)) {
    await fsPromises.rm(d, { recursive: true, force: true });
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

  it('physics_raycast_3d is not registered', async () => {
    await expect(dispatchTool('physics_raycast_3d', {})).rejects.toThrow();
  });

  it('physics_body_state returns entityId, null position, and null PhysicsBody handles', async () => {
    const res = await dispatchTool('physics_body_state', { entityId: 'body-001' });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
      entityId: string;
      position: null;
      bodyHandle: null;
      colliderHandle: null;
      isSensor: null;
    };
    expect(parsed.entityId).toBe('body-001');
    expect(parsed.position).toBeNull();
    expect(parsed.bodyHandle).toBeNull();
    expect(parsed.colliderHandle).toBeNull();
    expect(parsed.isSensor).toBeNull();
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

  it('actor_list returns an actors array', async () => {
    const res = await dispatchTool('actor_list', {});
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { actors: unknown[] };
    expect(Array.isArray(parsed.actors)).toBe(true);
  });

  // --- Save ---

  it('save_list returns a slots array', async () => {
    const res = await dispatchTool('save_list', {});
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { slots: string[] };
    expect(Array.isArray(parsed.slots)).toBe(true);
  });

  it('save_write writes a GameSaveSlot to disk with default timestamp/playtime', async () => {
    const slot = 'vitest-write-test';
    const data = { score: 42, level: 3 };
    const filePath = path.join(env.saveBaseDir, `${slot}.json`);
    tempFiles.push(filePath);

    const res = await dispatchTool('save_write', { slot, scene: 'level1', data });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { written: boolean; slot: string };
    expect(parsed.written).toBe(true);
    expect(parsed.slot).toBe(slot);

    const fileContent = JSON.parse(await fsPromises.readFile(filePath, 'utf8')) as {
      id: string;
      scene: string;
      data: typeof data;
      timestamp: number;
      playtime: number;
    };
    expect(fileContent.id).toBe(slot);
    expect(fileContent.scene).toBe('level1');
    expect(fileContent.data).toEqual(data);
    expect(typeof fileContent.timestamp).toBe('number');
    expect(fileContent.playtime).toBe(0);
  });

  it('save_write rejects path traversal in slot name', async () => {
    await expect(
      dispatchTool('save_write', { slot: '../etc/passwd', scene: 'x', data: {} }),
    ).rejects.toThrow(McpError);
  });

  it('save_read returns a GameSaveSlot for an existing file', async () => {
    const slot = 'vitest-read-test';
    const record = { id: slot, scene: 'town', data: { hp: 100, name: 'hero' }, timestamp: 1000, playtime: 5 };
    const filePath = path.join(env.saveBaseDir, `${slot}.json`);
    tempFiles.push(filePath);
    await fsPromises.writeFile(filePath, JSON.stringify(record), 'utf8');

    const res = await dispatchTool('save_read', { slot });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as typeof record;
    expect(parsed).toEqual(record);
  });

  it('save_read returns an error for a slot that does not match GameSaveSlot', async () => {
    const slot = 'vitest-bad-shape-test';
    const filePath = path.join(env.saveBaseDir, `${slot}.json`);
    tempFiles.push(filePath);
    await fsPromises.writeFile(filePath, JSON.stringify({ foo: 'bar' }), 'utf8');

    const res = await dispatchTool('save_read', { slot });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { error: string };
    expect(typeof parsed.error).toBe('string');
    expect(parsed.error.length).toBeGreaterThan(0);
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
    const yypFilePath = path.join(env.assetBaseDir, yypRelPath);
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

  it('gms2_inspect_project tolerates real GameMaker trailing commas and reads the "%Name" key', async () => {
    // Real .yyp files (unlike strict JSON) carry a trailing comma after the
    // last property of every object/array, and store the project name
    // under "%Name" rather than "name".
    const yypContent =
      '{"%Name":"Trailing Comma Project","resources":[' +
      '{"id":{"name":"obj_player","path":"objects/obj_player/obj_player.yy",},},' +
      '{"id":{"name":"scr_init","path":"scripts/scr_init/scr_init.yy",},},' +
      '],}';
    const yypRelPath = 'vitest-trailing-comma-test.yyp';
    const yypFilePath = path.join(env.assetBaseDir, yypRelPath);
    tempFiles.push(yypFilePath);
    await fsPromises.writeFile(yypFilePath, yypContent, 'utf8');

    const res = await dispatchTool('gms2_inspect_project', { yypPath: yypRelPath });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
      projectName: string;
      totalResources: number;
      objectNames: string[];
      scriptNames: string[];
    };
    expect(parsed.projectName).toBe('Trailing Comma Project');
    expect(parsed.totalResources).toBe(2);
    expect(parsed.objectNames).toEqual(['obj_player']);
    expect(parsed.scriptNames).toEqual(['scr_init']);
  });

  it('emptysock_layer_info returns an object with methods', async () => {
    const res = await dispatchTool('emptysock_layer_info', {});
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { methods: unknown };
    expect(parsed.methods).toBeDefined();
  });

  // --- Particles ---

  it('particle_emitter_config (get) returns a config with emissionRate', async () => {
    const res = await dispatchTool('particle_emitter_config', { emitterId: 'dust' });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { config: { emissionRate: number } };
    expect(typeof parsed.config.emissionRate).toBe('number');
  });

  it('particle_emitter_config (set) returns updated: true', async () => {
    const res = await dispatchTool('particle_emitter_config', {
      emitterId: 'dust',
      config: { emissionRate: 50, lifetime: { min: 0.5, max: 1.5 }, shape: 'circle', shapeRadius: 20 },
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
      updated: boolean;
      config: { emissionRate: number; lifetime: { min: number; max: number }; shape: string; shapeRadius: number };
    };
    expect(parsed.updated).toBe(true);
    expect(parsed.config.emissionRate).toBe(50);
    expect(parsed.config.lifetime).toEqual({ min: 0.5, max: 1.5 });
    expect(parsed.config.shape).toBe('circle');
    expect(parsed.config.shapeRadius).toBe(20);
  });

  it('particle_emitter_config (set) rejects an unknown shape value', async () => {
    await expect(
      dispatchTool('particle_emitter_config', {
        emitterId: 'dust',
        config: { shape: 'triangle' },
      }),
    ).rejects.toThrow(McpError);
  });

  it('particle_emitter_config (set) accepts a velocity range and colorGradient', async () => {
    const res = await dispatchTool('particle_emitter_config', {
      emitterId: 'dust',
      config: {
        velocity: { x: { min: -10, max: 10 }, y: { min: -20, max: 0 } },
        colorGradient: [0xff0000, 0x00ff00],
      },
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
      config: { velocity: { x: { min: number; max: number } }; colorGradient: number[] };
    };
    expect(parsed.config.velocity.x).toEqual({ min: -10, max: 10 });
    expect(parsed.config.colorGradient).toEqual([0xff0000, 0x00ff00]);
  });

  // --- Story Graph ---

  it('story_graph_export reads a real .storyGraph.json and returns nodes and edges', async () => {
    const sceneId = 'vitest-sg-scene';
    const sceneDir = path.join(env.assetBaseDir, sceneId);
    const filePath = path.join(sceneDir, 'default.storyGraph.json');
    tempDirs.push(sceneDir);

    const graph = {
      startNodeId: 'node-1',
      nodes: [
        { id: 'node-1', type: 'dialogue', x: 0, y: 0, speaker: 'Hero', text: 'Hello.' },
        {
          id: 'node-2',
          type: 'choice',
          x: 100,
          y: 0,
          text: 'Pick one:',
          options: ['Yes', 'No (locked)'],
          optionWhens: [undefined, { kind: 'switch', index: 1, equals: true }],
        },
        {
          id: 'node-3',
          type: 'condition',
          x: 200,
          y: 0,
          text: 'var[2] >= 10',
          condition: { kind: 'variable', index: 2, op: 'gte', value: 10 },
        },
      ],
      edges: [
        { id: 'edge-1', from: 'node-1', fromPort: 0, to: 'node-2' },
        { id: 'edge-2', from: 'node-3', fromPort: 0, to: 'node-1' },
        { id: 'edge-3', from: 'node-3', fromPort: 1, to: 'node-2' },
      ],
    };

    await fsPromises.mkdir(sceneDir, { recursive: true });
    await fsPromises.writeFile(filePath, JSON.stringify(graph), 'utf8');

    const res = await dispatchTool('story_graph_export', { sceneId });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
      nodes: unknown[];
      edges: unknown[];
      startNodeId: string;
    };
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(parsed.nodes).toHaveLength(3);
    expect(Array.isArray(parsed.edges)).toBe(true);
    expect(parsed.edges).toHaveLength(3);
    expect(parsed.startNodeId).toBe('node-1');
    const conditionNode = parsed.nodes.find((n) => (n as { id: string }).id === 'node-3') as
      | { type: string; condition: { kind: string } }
      | undefined;
    expect(conditionNode?.type).toBe('condition');
    expect(conditionNode?.condition.kind).toBe('variable');
    const choiceNode = parsed.nodes.find((n) => (n as { id: string }).id === 'node-2') as
      | { options: string[]; optionWhens: Array<{ kind: string } | null> }
      | undefined;
    expect(choiceNode?.options).toEqual(['Yes', 'No (locked)']);
    expect(choiceNode?.optionWhens?.[0]).toBeNull();
    expect(choiceNode?.optionWhens?.[1]?.kind).toBe('switch');
  });

  it('story_graph_export returns invalid-format error for a legacy pre-drift shape (options as objects)', async () => {
    const sceneId = 'vitest-sg-legacy-scene';
    const sceneDir = path.join(env.assetBaseDir, sceneId);
    const filePath = path.join(sceneDir, 'default.storyGraph.json');
    tempDirs.push(sceneDir);

    const legacyGraph = {
      startNodeId: 'node-1',
      nodes: [
        {
          id: 'node-1',
          type: 'choice',
          x: 0,
          y: 0,
          text: 'Pick one:',
          options: [{ label: 'Yes', next: 'node-2' }],
        },
      ],
      edges: [],
    };

    await fsPromises.mkdir(sceneDir, { recursive: true });
    await fsPromises.writeFile(filePath, JSON.stringify(legacyGraph), 'utf8');

    const res = await dispatchTool('story_graph_export', { sceneId });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { error: string };
    expect(parsed.error).toBe('invalid story graph format');
  });

  it('story_graph_export returns error object for a non-existent scene', async () => {
    const res = await dispatchTool('story_graph_export', { sceneId: 'nonexistent-scene-xyz' });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
      error: string;
      sceneId: string;
      graphId: string;
    };
    expect(typeof parsed.error).toBe('string');
    expect(parsed.error).toBe('story graph not found');
    expect(parsed.sceneId).toBe('nonexistent-scene-xyz');
    expect(parsed.graphId).toBe('default');
  });

  it('story_graph_export rejects a sceneId with path traversal characters', async () => {
    await expect(
      dispatchTool('story_graph_export', { sceneId: '../evil' }),
    ).rejects.toThrow(McpError);
  });

  // --- VisualScript ---

  it('visualscript_validate reports valid: true for a well-formed graph', async () => {
    const res = await dispatchTool('visualscript_validate', {
      graph: {
        nodes: [
          { id: 'update-1', kind: 'onUpdate', next: ['branch-1'] },
          {
            id: 'branch-1',
            kind: 'branch',
            next: ['set-1', 'set-2'],
            variableIndex: 0,
            comparator: 'gt',
            value: 5,
          },
          { id: 'set-1', kind: 'setSwitch', next: [], switchIndex: 0, value: true },
          { id: 'set-2', kind: 'setSwitch', next: [], switchIndex: 0, value: false },
        ],
        connections: [
          { id: 'c1', from: 'update-1', to: 'branch-1', fromPort: 0 },
          { id: 'c2', from: 'branch-1', to: 'set-1', fromPort: 0 },
          { id: 'c3', from: 'branch-1', to: 'set-2', fromPort: 1 },
        ],
      },
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
      valid: boolean;
      nodeCount: number;
      unreachableNodeIds: string[];
      issues: unknown[];
    };
    expect(parsed.valid).toBe(true);
    expect(parsed.nodeCount).toBe(4);
    expect(parsed.unreachableNodeIds).toEqual([]);
    expect(parsed.issues).toEqual([]);
  });

  it('visualscript_validate flags a dangling next target as an error', async () => {
    const res = await dispatchTool('visualscript_validate', {
      graph: {
        nodes: [{ id: 'update-1', kind: 'onUpdate', next: ['missing-node'] }],
        connections: [],
      },
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
      valid: boolean;
      issues: Array<{ severity: string; message: string }>;
    };
    expect(parsed.valid).toBe(false);
    expect(parsed.issues.some((i) => i.severity === 'error' && i.message.includes('missing-node'))).toBe(true);
  });

  it('visualscript_validate flags an unreachable node as a warning, not an error', async () => {
    const res = await dispatchTool('visualscript_validate', {
      graph: {
        nodes: [
          { id: 'update-1', kind: 'onUpdate', next: [] },
          { id: 'orphan-1', kind: 'sequence', next: [] },
        ],
        connections: [],
      },
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
      valid: boolean;
      unreachableNodeIds: string[];
      issues: Array<{ severity: string }>;
    };
    expect(parsed.valid).toBe(true);
    expect(parsed.unreachableNodeIds).toEqual(['orphan-1']);
    expect(parsed.issues.some((i) => i.severity === 'warning')).toBe(true);
  });

  it('visualscript_validate warns when a graph has no entry node', async () => {
    const res = await dispatchTool('visualscript_validate', {
      graph: {
        nodes: [{ id: 'seq-1', kind: 'sequence', next: [] }],
        connections: [],
      },
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
      entryNodeIds: string[];
      issues: Array<{ message: string }>;
    };
    expect(parsed.entryNodeIds).toEqual([]);
    expect(parsed.issues.some((i) => i.message.includes('no onUpdate or onEvent entry node'))).toBe(true);
  });

  it('visualscript_validate rejects malformed input', async () => {
    await expect(
      dispatchTool('visualscript_validate', { graph: { nodes: 'not-an-array', connections: [] } }),
    ).rejects.toThrow(McpError);
  });

  // --- Battle ---

  it('battle_estimate_damage returns normal/crit/expected damage using the default physical formula', async () => {
    const res = await dispatchTool('battle_estimate_damage', {
      effectiveAttack: 50,
      effectiveDefense: 20,
      power: 1,
      critChance: 0.5,
      critMultiplier: 2,
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as {
      normalDamage: number;
      critDamage: number;
      expectedDamage: number;
    };
    // floor((50 - 20/2) * 1 * 1) = 40
    expect(parsed.normalDamage).toBe(40);
    // floor((50 - 20/2) * 1 * 2) = 80
    expect(parsed.critDamage).toBe(80);
    expect(parsed.expectedDamage).toBeCloseTo(60, 5);
  });

  it('battle_estimate_damage floors damage at 1 even for a weak attacker', async () => {
    const res = await dispatchTool('battle_estimate_damage', {
      effectiveAttack: 1,
      effectiveDefense: 100,
    });
    const parsed = JSON.parse(res.content[0]?.text ?? '{}') as { normalDamage: number };
    expect(parsed.normalDamage).toBe(1);
  });

  it('battle_estimate_damage rejects negative stats', async () => {
    await expect(
      dispatchTool('battle_estimate_damage', { effectiveAttack: -5, effectiveDefense: 10 }),
    ).rejects.toThrow(McpError);
  });
});
