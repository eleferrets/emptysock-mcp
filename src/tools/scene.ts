import { z } from 'zod';
import { parse, SafeId } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';

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
    description: 'Add a new entity to a scene. Returns the new entity\'s ID.',
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
    description: 'List all entity IDs currently active in a scene.',
    inputSchema: {
      type: 'object',
      properties: { sceneId: { type: 'string' } },
      required: ['sceneId'],
    },
  },
  {
    name: 'scene_entity_info',
    description: 'Return the tag, active state, and component list for a specific entity.',
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
    description: 'Retrieve the serialised state of a specific component on an entity.',
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

export async function sceneHandler(toolName: string, raw: unknown) {
  switch (toolName) {
    case 'scene_list_entities': {
      const { sceneId } = parse(SceneIdSchema, raw);
      return textResponse({ sceneId, entities: [] });
    }
    case 'scene_entity_info': {
      const { sceneId, entityId } = parse(EntityQuerySchema, raw);
      return textResponse({ sceneId, entityId, tag: null, active: true, components: [] });
    }
    case 'scene_get_component': {
      const { sceneId, entityId, componentType } = parse(ComponentQuerySchema, raw);
      return textResponse({ sceneId, entityId, componentType, data: null });
    }
    case 'scene_create_entity': {
      const { sceneId, tag, components } = parse(CreateEntitySchema, raw);
      const entityId = `entity-${Date.now()}`;
      return textResponse({ sceneId, entityId, tag: tag ?? null, components: components ?? [] });
    }
    default:
      throw new Error(`Unrouted scene tool: ${toolName}`);
  }
}
