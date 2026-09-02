import { z } from 'zod';
import { parse, SafeId } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';

const DEFAULT_CONFIG = {
  maxParticles: 100,
  emitRate: 30,
  lifetime: 1.5,
  speed: 80,
  angle: 270,
  spread: 30,
  colorStart: '#ffffff',
  colorEnd: '#ff8800',
  alphaStart: 1,
  alphaEnd: 0,
};

const EmitterConfigSchema = z.object({
  emitterId: SafeId,
  config: z.object({
    maxParticles: z.number().optional(),
    emitRate: z.number().optional(),
    lifetime: z.number().optional(),
    speed: z.number().optional(),
    angle: z.number().optional(),
    spread: z.number().optional(),
    colorStart: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    colorEnd: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    alphaStart: z.number().optional(),
    alphaEnd: z.number().optional(),
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
            maxParticles: { type: 'number' },
            emitRate: { type: 'number' },
            lifetime: { type: 'number' },
            speed: { type: 'number' },
            angle: { type: 'number' },
            spread: { type: 'number' },
            colorStart: { type: 'string' },
            colorEnd: { type: 'string' },
            alphaStart: { type: 'number' },
            alphaEnd: { type: 'number' },
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
      throw new Error(`Unrouted particle tool: ${toolName}`);
  }
}
