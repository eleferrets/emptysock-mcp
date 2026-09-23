import { z } from 'zod';
import { parse, SafeId } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';
import { notFound } from '../lib/errors.js';
import { queryLiveGame } from '../lib/bridge.js';
import type { EntitySummary, CreateEntityData } from '../lib/bridgeTypes.js';

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
      'Spawn a new entity in the connected live game and add each named, already-registered component (defaults only, no per-field overrides). If tag is given, it is written to Meta.name/Meta.tags. Returns ok:false/no-live-instance if no game is connected; unresolvable component names are reported back in skipped rather than failing the whole call.',
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
      const result = await queryLiveGame({
        kind: 'createEntity',
        ...(tag !== undefined ? { tag } : {}),
        ...(components !== undefined ? { components } : {}),
      });
      if (!result.ok) return textResponse({ sceneId, tag: tag ?? null, components: components ?? [], error: result.error });
      const data = result.data as CreateEntityData;
      return textResponse({
        sceneId,
        entityId: data.entityId,
        tag: data.tag ?? null,
        components: data.components,
        skipped: data.skipped,
      });
    }
    default:
      throw notFound(toolName);
  }
}
