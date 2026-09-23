import { z } from 'zod';
import { parse, SafeId, Vec2 } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';
import { notFound } from '../lib/errors.js';
import { bridge } from '../lib/bridge.js';

const FindPathSchema = z.object({
  from: Vec2,
  to: Vec2,
  mapId: SafeId,
});

const QueryNodeSchema = z.object({
  mapId: SafeId,
  point: Vec2,
});

export const navmeshToolDefs = [
  {
    name: 'navmesh_find_path',
    description:
      'Find an A* path between two 2D points on a loaded navmesh (@emptysock/tilemap\'s NavMeshSystem). The engine\'s QueryChannel bridge (see this server\'s CLAUDE.md) currently has no navmesh query kind, so this always returns ok:false — no-live-instance when nothing is connected, not-found otherwise — never a fabricated path.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
        to:   { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
        mapId: { type: 'string', description: 'NavMesh asset identifier' },
      },
      required: ['from', 'to', 'mapId'],
    },
  },
  {
    name: 'navmesh_nearest_node',
    description:
      'Return the nearest walkable node on the navmesh to a given world point. Same limitation as navmesh_find_path — QueryChannel has no navmesh query kind yet, so this always returns ok:false rather than a fabricated node.',
    inputSchema: {
      type: 'object',
      properties: {
        mapId: { type: 'string' },
        point: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
      },
      required: ['mapId', 'point'],
    },
  },
] as const;

/**
 * `QueryChannel` (the bridge target, `emptysock-engine`'s
 * `packages/engine/src/bridge/QueryChannel.ts`) has no `EngineQuery` kind
 * for navmesh pathfinding today — only `listEntities`/`entityInfo`/
 * `getComponent`/`setComponent` plus the three physics query kinds. Until a
 * navmesh query kind is added on the engine side, this server has nothing
 * real to relay for navmesh_* — returning fabricated path data would be
 * exactly the "no live instance, no fabricated answer" mistake CLAUDE.md
 * warns against, so this reports the honest reason instead: whether a live
 * game is even connected, distinct from "connected but this query isn't
 * supported yet".
 */
function noNavmeshQueryKind(): { error: { code: string; message: string } } {
  return bridge.isConnected
    ? {
        error: {
          code: 'not-found',
          message: 'The connected live engine\'s QueryChannel has no navmesh query kind yet — pathfinding cannot be relayed over the bridge.',
        },
      }
    : {
        error: {
          code: 'no-live-instance',
          message: 'No live engine connected — start the game in the IDE or launch a dev build.',
        },
      };
}

export async function navmeshHandler(toolName: string, raw: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (toolName) {
    case 'navmesh_find_path': {
      const { from, to, mapId } = parse(FindPathSchema, raw);
      return textResponse({ mapId, from, to, ...noNavmeshQueryKind() });
    }
    case 'navmesh_nearest_node': {
      const { mapId, point } = parse(QueryNodeSchema, raw);
      return textResponse({ mapId, point, ...noNavmeshQueryKind() });
    }
    default:
      throw notFound(toolName);
  }
}
