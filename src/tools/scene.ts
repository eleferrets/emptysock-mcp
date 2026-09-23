import { z } from 'zod';
import { parse, SafeId } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';
import { notFound } from '../lib/errors.js';
import { queryLiveGame } from '../lib/bridge.js';
import type { EntitySummary } from '../lib/bridgeTypes.js';

const SceneIdSchema = z.object({ sceneId: SafeId });

const EntityQuerySchema = z.object({
  sceneId: SafeId,
  entityId: SafeId,
});

const ComponentQuerySchema = z.object({
  sceneId: SafeId,
  entityId: SafeId,
  componentType: z.string().min(1).max(128).regex(/^[A-Za-z][\w]*$/, 'Component type must be a valid class name'),
});

const CreateEntitySchema = z.object({
  sceneId: SafeId,
  tag: SafeId.optional(),
  components: z.array(SafeId).optional(),
});

export const sceneToolDefs = [
  {
    name: 'scene_create_entity',
    description:
      'Add a new entity to a scene. Not supported over the live bridge (QueryChannel is read/patch only, with no entity-creation query kind) — always returns ok:false/not-found.',
    inputSchema: {
      type: 'object',
      properties: {
        sceneId:    { type: 'string' },
        tag:        { type: 'string' },
        components: { type: 'array', items: { type: 'string' } },
      },
      required: ['sceneId'],
    },
  },
  {
    name: 'scene_list_entities',
    description: 'List all entities currently active in the connected live game\'s current scene, with their component names. Returns ok:false/no-live-instance if no live game is connected.',
    inputSchema: {
      type: 'object',
      properties: { sceneId: { type: 'string' } },
      required: ['sceneId'],
    },
  },
  {
    name: 'scene_entity_info',
    description: 'Return the component list and Meta/Transform fields (name, tags, active, x, y, rotation) for a specific live entity. Returns ok:false/no-live-instance if no live game is connected.',
    inputSchema: {
      type: 'object',
      properties: {
        sceneId:  { type: 'string' },
        entityId: { type: 'string' },
      },
      required: ['sceneId', 'entityId'],
    },
  },
  {
    name: 'scene_get_component',
    description: 'Retrieve the live serialised state of a specific component on a live entity. Returns ok:false/no-live-instance if no live game is connected.',
    inputSchema: {
      type: 'object',
      properties: {
        sceneId:       { type: 'string' },
        entityId:      { type: 'string' },
        componentType: { type: 'string', description: 'PascalCase class name, e.g. Transform, PhysicsBody' },
      },
      required: ['sceneId', 'entityId', 'componentType'],
    },
  },
] as const;

/** See physics.ts's identically-named helper — the bridge/engine side uses numeric entity ids. */
function toNumericEntityId(entityId: string): number | null {
  if (!/^\d+$/.test(entityId)) return null;
  const n = Number(entityId);
  return Number.isSafeInteger(n) ? n : null;
}

export async function sceneHandler(toolName: string, raw: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (toolName) {
    case 'scene_list_entities': {
      const { sceneId } = parse(SceneIdSchema, raw);
      const result = await queryLiveGame({ kind: 'listEntities' });
      if (!result.ok) return textResponse({ sceneId, error: result.error });
      return textResponse({ sceneId, entities: result.data as EntitySummary[] });
    }
    case 'scene_entity_info': {
      const { sceneId, entityId } = parse(EntityQuerySchema, raw);
      const numericId = toNumericEntityId(entityId);
      if (numericId === null) {
        return textResponse({
          sceneId,
          entityId,
          error: { code: 'not-found', message: `"${entityId}" is not a live numeric entity id.` },
        });
      }
      const result = await queryLiveGame({ kind: 'entityInfo', entityId: numericId });
      if (!result.ok) return textResponse({ sceneId, entityId, error: result.error });
      const summary = result.data as EntitySummary;
      const { entityId: _ignored, ...rest } = summary; return textResponse({ sceneId, entityId, ...rest });
    }
    case 'scene_get_component': {
      const { sceneId, entityId, componentType } = parse(ComponentQuerySchema, raw);
      const numericId = toNumericEntityId(entityId);
      if (numericId === null) {
        return textResponse({
          sceneId,
          entityId,
          componentType,
          error: { code: 'not-found', message: `"${entityId}" is not a live numeric entity id.` },
        });
      }
      const result = await queryLiveGame({ kind: 'getComponent', entityId: numericId, component: componentType });
      if (!result.ok) return textResponse({ sceneId, entityId, componentType, error: result.error });
      return textResponse({ sceneId, entityId, componentType, data: result.data });
    }
    case 'scene_create_entity': {
      const { sceneId, tag, components } = parse(CreateEntitySchema, raw);
      // QueryChannel (the engine-side bridge target) has no entity-creation
      // query kind — it is deliberately read/patch only (listEntities,
      // entityInfo, getComponent, setComponent, plus the physics queries).
      // Creating a real live entity would need a new engine-side query kind
      // this tool has nothing to call yet, so this stays an honest
      // not-found rather than a fabricated success.
      return textResponse({
        sceneId,
        tag: tag ?? null,
        components: components ?? [],
        error: {
          code: 'not-found',
          message: 'scene_create_entity has no live-bridge query kind to call — entity creation is not supported over the bridge.',
        },
      });
    }
    default:
      throw notFound(toolName);
  }
}
