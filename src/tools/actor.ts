import { z } from 'zod';
import { parse, SafeId } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';
import { notFound } from '../lib/errors.js';
import { queryLiveGame } from '../lib/bridge.js';
import type { ActorSendResultData, ActorBroadcastResultData } from '../lib/bridgeTypes.js';

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
      'Enqueue a message in a specific actor\'s inbox on the connected live game\'s ActorSystem. Returns ok:false/no-live-instance if no game is connected, ok:false/no-actor-system if the live scene has no ActorSystem, or ok:false/not-found if the actorId is unknown.',
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
    description:
      'Broadcast a message to every actor registered in the connected live game\'s ActorSystem, returning how many received it. Returns ok:false/no-live-instance if no game is connected, ok:false/no-actor-system if the live scene has no ActorSystem.',
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
    description:
      'Return the number of pending (not yet flushed) messages in an actor\'s inbox. Returns ok:false/no-live-instance if no game is connected, ok:false/no-actor-system if the live scene has no ActorSystem, or ok:false/not-found if the actorId is unknown.',
    inputSchema: {
      type: 'object',
      properties: { actorId: { type: 'string' } },
      required: ['actorId'],
    },
  },
  {
    name: 'actor_list',
    description:
      'List every actor id currently registered in the connected live game\'s ActorSystem, in registration order. Returns ok:false/no-live-instance if no game is connected, ok:false/no-actor-system if the live scene has no ActorSystem.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
] as const;

export async function actorHandler(toolName: string, raw: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (toolName) {
    case 'actor_send_message': {
      const { actorId, message } = parse(SendMessageSchema, raw);
      const result = await queryLiveGame({ kind: 'actorSendMessage', actorId, message });
      if (!result.ok) return textResponse({ actorId, message, error: result.error });
      const data = result.data as ActorSendResultData;
      return textResponse({ actorId, queued: data.queued });
    }
    case 'actor_broadcast': {
      const { message } = parse(BroadcastSchema, raw);
      const result = await queryLiveGame({ kind: 'actorBroadcast', message });
      if (!result.ok) return textResponse({ message, error: result.error });
      const data = result.data as ActorBroadcastResultData;
      return textResponse({ delivered: data.delivered });
    }
    case 'actor_inbox_size': {
      const { actorId } = parse(ActorRefSchema, raw);
      const result = await queryLiveGame({ kind: 'actorInboxSize', actorId });
      if (!result.ok) return textResponse({ actorId, error: result.error });
      return textResponse({ actorId, inboxSize: result.data as number });
    }
    case 'actor_list': {
      const result = await queryLiveGame({ kind: 'actorList' });
      if (!result.ok) return textResponse({ error: result.error });
      return textResponse({ actors: result.data as string[] });
    }
    default:
      throw notFound(toolName);
  }
}
