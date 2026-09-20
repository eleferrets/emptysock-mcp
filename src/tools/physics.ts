import { z } from 'zod';
import { parse, SafeId, Vec2, GameNum } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';
import { notFound } from '../lib/errors.js';

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
    description: 'Cast a ray in 2D physics space and return the first hit entity, hit point, and normal.',
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
    description: 'Return all entity IDs whose 2D colliders overlap a circle.',
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
      'Return the current position, velocity, angular velocity, and PhysicsBody state (bodyHandle, colliderHandle, isSensor) of a physics body by entity ID. bodyHandle and colliderHandle are the Rapier handles assigned when a PhysicsSystem registers the entity, null until then; this server has no live connection to observe that.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
      },
      required: ['entityId'],
    },
  },
] as const;

export async function physicsHandler(toolName: string, raw: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (toolName) {
    case 'physics_raycast_2d': {
      const args = parse(Raycast2DSchema, raw);
      return textResponse({ hit: null, args });
    }
    case 'physics_overlap_circle': {
      const args = parse(OverlapCircleSchema, raw);
      return textResponse({ entities: [], args });
    }
    case 'physics_body_state': {
      const { entityId } = parse(BodyQuerySchema, raw);
      return textResponse({
        entityId,
        position: null,
        velocity: null,
        angularVelocity: null,
        bodyHandle: null,
        colliderHandle: null,
        isSensor: null,
      });
    }
    default:
      throw notFound(toolName);
  }
}
