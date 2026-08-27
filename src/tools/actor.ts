import { z } from 'zod';
import { parse, SafeId } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';

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
    description: 'Enqueue a message in a specific actor\'s inbox. The actor processes it on the next flush pass.',
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
    description: 'Broadcast a message to all registered actors in the current ActorSystem.',
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
    description: 'Return the number of pending messages in an actor\'s inbox.',
    inputSchema: {
      type: 'object',
      properties: { actorId: { type: 'string' } },
      required: ['actorId'],
    },
  },
] as const;

export async function actorHandler(toolName: string, raw: unknown) {
  switch (toolName) {
    case 'actor_send_message': {
      const { actorId, message } = parse(SendMessageSchema, raw);
      return textResponse({ actorId, enqueued: true, message });
    }
    case 'actor_broadcast': {
      const { message } = parse(BroadcastSchema, raw);
      return textResponse({ broadcast: true, message });
    }
    case 'actor_inbox_size': {
      const { actorId } = parse(ActorRefSchema, raw);
      return textResponse({ actorId, inboxSize: 0 });
    }
    default:
      throw new Error(`Unrouted actor tool: ${toolName}`);
  }
}
