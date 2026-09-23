import { z } from 'zod';
import { parse, SafeId, Vec2, GameNum } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';
import { notFound } from '../lib/errors.js';
import { queryLiveGame } from '../lib/bridge.js';
import type { RaycastResultData, BodyStateData } from '../lib/bridgeTypes.js';

const Raycast2DSchema = z.object({
  origin: Vec2,
  direction: Vec2,
  maxDistance: GameNum.positive(),
  layerMask: z.number().int().nonnegative().optional(),
});


const OverlapCircleSchema = z.object({
  center: Vec2,
  radius: GameNum.positive().max(100_000),
  layerMask: z.number().int().nonnegative().optional(),
});

const BodyQuerySchema = z.object({
  entityId: SafeId,
});

export const physicsToolDefs = [
  {
    name: 'physics_raycast_2d',
    description: 'Cast a ray in 2D physics space and return the first hit entity, hit point, and normal. Queries the connected live game over the bridge; returns ok:false/no-live-instance if none is connected.',
    inputSchema: {
      type: 'object',
      properties: {
        origin:      { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x','y'] },
        direction:   { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x','y'] },
        maxDistance: { type: 'number', minimum: 0 },
        layerMask:   { type: 'number' },
      },
      required: ['origin', 'direction', 'maxDistance'],
    },
  },
  {
    name: 'physics_overlap_circle',
    description: 'Return all entity IDs whose 2D colliders overlap a circle. Queries the connected live game over the bridge; returns ok:false/no-live-instance if none is connected.',
    inputSchema: {
      type: 'object',
      properties: {
        center:    { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x','y'] },
        radius:    { type: 'number', minimum: 0 },
        layerMask: { type: 'number' },
      },
      required: ['center', 'radius'],
    },
  },
  {
    name: 'physics_body_state',
    description:
      'Return the current position, rotation, velocity, body type, and isSensor of a physics body by entity ID. Queries the connected live game over the bridge; returns ok:false/no-live-instance if none is connected, or ok:false/no-physics-world if the live scene has no initialized PhysicsSystem.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
      },
      required: ['entityId'],
    },
  },
] as const;

/**
 * The bridge/engine side uses numeric bitECS entity ids; this server's tool
 * schemas accept `SafeId` (a bounded identifier string) for entityId, so a
 * caller can pass whatever id string the engine reported elsewhere. Anything
 * that isn't a non-negative integer can never correspond to a live entity.
 */
function toNumericEntityId(entityId: string): number | null {
  if (!/^\d+$/.test(entityId)) return null;
  const n = Number(entityId);
  return Number.isSafeInteger(n) ? n : null;
}

export async function physicsHandler(toolName: string, raw: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (toolName) {
    case 'physics_raycast_2d': {
      const args = parse(Raycast2DSchema, raw);
      const result = await queryLiveGame({
        kind: 'raycast2d',
        origin: args.origin,
        direction: args.direction,
        maxToi: args.maxDistance,
      });
      if (!result.ok) return textResponse({ error: result.error, args });
      const hit = result.data as RaycastResultData | null;
      return textResponse({ hit, args });
    }
    case 'physics_overlap_circle': {
      const args = parse(OverlapCircleSchema, raw);
      const result = await queryLiveGame({
        kind: 'overlapCircle2d',
        center: args.center,
        radius: args.radius,
      });
      if (!result.ok) return textResponse({ error: result.error, args });
      return textResponse({ entities: result.data as number[], args });
    }
    case 'physics_body_state': {
      const { entityId } = parse(BodyQuerySchema, raw);
      const numericId = toNumericEntityId(entityId);
      if (numericId === null) {
        return textResponse({
          entityId,
          error: { code: 'not-found', message: `"${entityId}" is not a live numeric entity id.` },
        });
      }
      const result = await queryLiveGame({ kind: 'bodyState2d', entityId: numericId });
      if (!result.ok) return textResponse({ entityId, error: result.error });
      const state = result.data as BodyStateData;
      return textResponse({
        entityId,
        position: state.position,
        rotation: state.rotation,
        velocity: state.velocity,
        type: state.type,
        isSensor: state.isSensor,
      });
    }
    default:
      throw notFound(toolName);
  }
}
