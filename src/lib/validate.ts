import { z } from 'zod';
import { invalidParams } from './errors.js';

/** Parse with Zod and throw McpError(InvalidParams) on failure. */
export function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) invalidParams(result.error.message);
  return result.data;
}

/**
 * A safe relative-path string: no traversal sequences, no absolute prefix,
 * bounded length. Use for any user-supplied filesystem path.
 */
export const SafeRelPath = z
  .string()
  .max(512)
  .refine((p) => !p.includes('..') && !p.startsWith('/') && !p.startsWith('\\'), {
    message: 'Path traversal or absolute paths are not allowed',
  });

/** Bounded identifier: alphanumeric + dashes/underscores, max 128 chars. */
export const SafeId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\w-]+$/, 'Identifier must be alphanumeric with dashes/underscores only');

/** A finite number within a reasonable game-world range. */
export const GameNum = z.number().finite();

/** 2D point. */
export const Vec2 = z.object({ x: GameNum, y: GameNum });

/** 3D point. */
export const Vec3 = z.object({ x: GameNum, y: GameNum, z: GameNum });
