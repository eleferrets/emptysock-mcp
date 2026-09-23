import { z } from 'zod';
import { parse, SafeId } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';
import { notFound } from '../lib/errors.js';
import { bridge } from '../lib/bridge.js';

const ActorRefSchema = z.object({
  actorId: SafeId,
});

const SendMessageSchema = z.object({
  actorId: SafeId,
  message: z.object({
    type: z.string().min(1).max(128),
    payload: z.unknown().optional(),
  }),
});

const BroadcastSchema = z.object({
  message: z.object({
    type: z.string().min(1).max(128),
    payload: z.unknown().optional(),
  }),
});

export const actorToolDefs = [
  {
    name: 'actor_send_message',
    description:
      'Enqueue a message in a specific actor\'s inbox. The engine\'s QueryChannel bridge (see this server\'s CLAUDE.md) has no ActorSystem query kind yet, so this always returns ok:false — no-live-instance when nothing is connected, not-found otherwise — never a fabricated "enqueued".',
    inputSchema: {
      type: 'object',
      properties: {
        actorId: { type: 'string' },
        message: {
          type: 'object',
          properties: {
            type:    { type: 'string' },
            payload: { description: 'Arbitrary message payload' },
          },
          required: ['type'],
        },
      },
      required: ['actorId', 'message'],
    },
  },
  {
    name: 'actor_broadcast',
    description: 'Broadcast a message to all registered actors in the current ActorSystem. Same limitation as actor_send_message — always returns ok:false.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'object',
          properties: { type: { type: 'string' }, payload: {} },
          required: ['type'],
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'actor_inbox_size',
    description: 'Return the number of pending messages in an actor\'s inbox. Same limitation as actor_send_message — always returns ok:false.',
    inputSchema: {
      type: 'object',
      properties: { actorId: { type: 'string' } },
      required: ['actorId'],
    },
  },
  {
    name: 'actor_list',
    description: 'List all actor IDs currently registered in the ActorSystem. Same limitation as actor_send_message — always returns ok:false.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
] as const;

/**
 * `QueryChannel` has no `EngineQuery` kind for `ActorSystem` today — see the
 * identically-reasoned helper in navmesh.ts. Reports whether a live game is
 * connected at all, distinct from "connected but unsupported".
 */
function noActorQueryKind(): { error: { code: string; message: string } } {
  return bridge.isConnected
    ? {
        error: {
          code: 'not-found',
          message: 'The connected live engine\'s QueryChannel has no ActorSystem query kind yet — actor messaging cannot be relayed over the bridge.',
        },
      }
    : {
        error: {
          code: 'no-live-instance',
          message: 'No live engine connected — start the game in the IDE or launch a dev build.',
        },
      };
}

export async function actorHandler(toolName: string, raw: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (toolName) {
    case 'actor_send_message': {
      const { actorId, message } = parse(SendMessageSchema, raw);
      return textResponse({ actorId, message, ...noActorQueryKind() });
    }
    case 'actor_broadcast': {
      const { message } = parse(BroadcastSchema, raw);
      return textResponse({ message, ...noActorQueryKind() });
    }
    case 'actor_inbox_size': {
      const { actorId } = parse(ActorRefSchema, raw);
      return textResponse({ actorId, ...noActorQueryKind() });
    }
    case 'actor_list': {
      return textResponse({ ...noActorQueryKind() });
    }
    default:
      throw notFound(toolName);
  }
}
