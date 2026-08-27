import { z } from 'zod';
import { parse, SafeId, Vec2 } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';

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
      'Find an A* path between two 2D points on a loaded navmesh. Returns an ordered array of waypoints or an empty array if no path exists.',
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
    description: 'Return the nearest walkable node on the navmesh to a given world point.',
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

export async function navmeshHandler(toolName: string, raw: unknown) {
  switch (toolName) {
    case 'navmesh_find_path': {
      const { from, to, mapId } = parse(FindPathSchema, raw);
      // Placeholder: real implementation calls NavMeshSystem.findPath()
      // loaded from the engine package. This returns a stub for schema demonstration.
      const path: Array<{ x: number; y: number }> = [
        from,
        { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
        to,
      ];
      return textResponse({ mapId, path });
    }
    case 'navmesh_nearest_node': {
      const { mapId, point } = parse(QueryNodeSchema, raw);
      return textResponse({ mapId, nearestNode: point });
    }
    default:
      throw new Error(`Unrouted navmesh tool: ${toolName}`);
  }
}
