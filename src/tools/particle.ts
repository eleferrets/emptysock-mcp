import { z } from 'zod';
import { parse, SafeId } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';
import { notFound } from '../lib/errors.js';

/**
 * Mirrors ParticleEmitterOptions from @emptysock/engine's ParticleSystem.ts.
 * Kept in sync by hand since there is no shared runtime import between this
 * server and the engine package.
 */
const RangeSchema = z.object({ min: z.number(), max: z.number() });

const EmitterOptionsSchema = z.object({
  texture: z.string().max(256).optional(),
  emissionRate: z.number().nonnegative().optional(),
  lifetime: RangeSchema.optional(),
  velocity: z
    .object({
      x: RangeSchema.optional(),
      y: RangeSchema.optional(),
    })
    .optional(),
  acceleration: z.object({ x: z.number().optional(), y: z.number().optional() }).optional(),
  startScale: z.number().nonnegative().optional(),
  endScale: z.number().nonnegative().optional(),
  startAlpha: z.number().min(0).max(1).optional(),
  endAlpha: z.number().min(0).max(1).optional(),
  colorGradient: z.array(z.number().int().nonnegative()).optional(),
  shape: z.enum(['point', 'circle', 'rectangle', 'line']).optional(),
  shapeRadius: z.number().nonnegative().optional(),
  shapeWidth: z.number().nonnegative().optional(),
  shapeHeight: z.number().nonnegative().optional(),
  rotationSpeed: z.number().optional(),
  maxParticles: z.number().int().positive().optional(),
});

const DEFAULT_CONFIG: z.infer<typeof EmitterOptionsSchema> = {
  emissionRate: 30,
  lifetime: { min: 0.8, max: 1.5 },
  startAlpha: 1,
  endAlpha: 0,
  startScale: 1,
  endScale: 0.2,
  shape: 'point',
  maxParticles: 200,
};

const EmitterConfigSchema = z.object({
  emitterId: SafeId,
  config: EmitterOptionsSchema.optional(),
});

export const particleToolDefs = [
  {
    name: 'particle_emitter_config',
    description:
      'Get or set a ParticleSystem emitter configuration (ParticleEmitterOptions) by emitter ID. Omit `config` to read; provide `config` to write.',
    inputSchema: {
      type: 'object',
      properties: {
        emitterId: { type: 'string' },
        config: {
          type: 'object',
          properties: {
            texture: { type: 'string', description: 'Texture / sprite name for each particle.' },
            emissionRate: { type: 'number', description: 'Particles emitted per second.' },
            lifetime: {
              type: 'object',
              properties: { min: { type: 'number' }, max: { type: 'number' } },
              description: 'Particle lifetime range in seconds.',
            },
            velocity: {
              type: 'object',
              properties: {
                x: { type: 'object', properties: { min: { type: 'number' }, max: { type: 'number' } } },
                y: { type: 'object', properties: { min: { type: 'number' }, max: { type: 'number' } } },
              },
            },
            acceleration: {
              type: 'object',
              properties: { x: { type: 'number' }, y: { type: 'number' } },
            },
            startScale: { type: 'number', minimum: 0 },
            endScale: { type: 'number', minimum: 0 },
            startAlpha: { type: 'number', minimum: 0, maximum: 1 },
            endAlpha: { type: 'number', minimum: 0, maximum: 1 },
            colorGradient: { type: 'array', items: { type: 'number' }, description: 'Hex colour values sampled across particle lifetime.' },
            shape: { type: 'string', enum: ['point', 'circle', 'rectangle', 'line'] },
            shapeRadius: { type: 'number', minimum: 0 },
            shapeWidth: { type: 'number', minimum: 0 },
            shapeHeight: { type: 'number', minimum: 0 },
            rotationSpeed: { type: 'number' },
            maxParticles: { type: 'number', minimum: 1 },
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
