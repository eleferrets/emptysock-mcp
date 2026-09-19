import { z } from 'zod';
import { parse, SafeId } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';
import { notFound } from '../lib/errors.js';

const DEFAULT_CONFIG = {
  emissionRate: 30,
  lifetimeMin: 0.8,
  lifetimeMax: 1.5,
  startAlpha: 1,
  endAlpha: 0,
  startScale: 1,
  endScale: 0.2,
};

const EmitterConfigSchema = z.object({
  emitterId: SafeId,
  config: z.object({
    emissionRate: z.number().nonnegative().optional(),
    lifetimeMin: z.number().nonnegative().optional(),
    lifetimeMax: z.number().nonnegative().optional(),
    startAlpha: z.number().min(0).max(1).optional(),
    endAlpha: z.number().min(0).max(1).optional(),
    startScale: z.number().nonnegative().optional(),
    endScale: z.number().nonnegative().optional(),
  }).optional(),
});

export const particleToolDefs = [
  {
    name: 'particle_emitter_config',
    description:
      'Get or set a ParticleSystem emitter configuration by emitter ID. Omit `config` to read; provide `config` to write.',
    inputSchema: {
      type: 'object',
      properties: {
        emitterId: { type: 'string' },
        config: {
          type: 'object',
          properties: {
            emissionRate: { type: 'number', description: 'Particles emitted per second.' },
            lifetimeMin: { type: 'number', description: 'Minimum particle lifetime in seconds.' },
            lifetimeMax: { type: 'number', description: 'Maximum particle lifetime in seconds.' },
            startAlpha: { type: 'number', minimum: 0, maximum: 1 },
            endAlpha: { type: 'number', minimum: 0, maximum: 1 },
            startScale: { type: 'number', minimum: 0 },
            endScale: { type: 'number', minimum: 0 },
          },
        },
      },
      required: ['emitterId'],
    },
  },
] as const;

export async function particleHandler(toolName: string, raw: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (toolName) {
    case 'particle_emitter_config': {
      const { emitterId, config } = parse(EmitterConfigSchema, raw);
      if (config === undefined) {
        return textResponse({ emitterId, config: { ...DEFAULT_CONFIG } });
      }
      const merged = { ...DEFAULT_CONFIG, ...config };
      return textResponse({ emitterId, updated: true, config: merged });
    }
    default:
      throw notFound(toolName);
  }
}
