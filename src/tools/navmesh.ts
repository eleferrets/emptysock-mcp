import { z } from 'zod';
import { parse, SafeId, Vec2 } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';
import { notFound } from '../lib/errors.js';
import { queryLiveGame } from '../lib/bridge.js';

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
      'Find an A* waypoint path between two 2D points on the connected live game\'s attached navmesh (@emptysock/tilemap\'s NavMeshSystem). Returns ok:false/no-live-instance if no game is connected, ok:false/no-navmesh if the live scene has no navmesh attached, or ok:true with data:null if no path exists.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
        to:   { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] },
        mapId: { type: 'string', description: 'NavMesh asset identifier (echoed back, not sent to the bridge — the live game has exactly one attached navmesh)' },
      },
      required: ['from', 'to', 'mapId'],
    },
  },
  {
    name: 'navmesh_nearest_node',
    description:
      'Return the nearest walkable point on the connected live game\'s attached navmesh to a given world point. Returns ok:false/no-live-instance if no game is connected, ok:false/no-navmesh if the live scene has no navmesh attached, or ok:true with data:null if nothing walkable was found.',
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

export async function navmeshHandler(toolName: string, raw: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (toolName) {
    case 'navmesh_find_path': {
      const { from, to, mapId } = parse(FindPathSchema, raw);
      const result = await queryLiveGame({ kind: 'navmeshFindPath', from, to });
      if (!result.ok) return textResponse({ mapId, from, to, error: result.error });
      return textResponse({ mapId, from, to, path: result.data as Array<{ x: number; y: number }> | null });
    }
    case 'navmesh_nearest_node': {
      const { mapId, point } = parse(QueryNodeSchema, raw);
      const result = await queryLiveGame({ kind: 'navmeshNearestNode', point });
      if (!result.ok) return textResponse({ mapId, point, error: result.error });
      return textResponse({ mapId, point, node: result.data as { x: number; y: number } | null });
    }
    default:
      throw notFound(toolName);
  }
}
