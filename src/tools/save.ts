import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import { parse, SafeRelPath } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';
import { invalidParams, notFound } from '../lib/errors.js';
import { env } from '../env.js';

const SlotSchema = z.object({
  slot: z.string().min(1).max(64).regex(/^[\w-]+$/, 'Slot name must be alphanumeric with dashes/underscores'),
});

/**
 * Matches the engine's default `GameSaveSlot` shape (SaveSystem.ts,
 * @emptysock/engine). SaveSystem is now generic over any Zod schema passed
 * to its constructor, but this tool only supports the default slot shape
 * ({ id, scene, data, timestamp, playtime }) rather than accepting an
 * arbitrary caller-supplied schema. A custom `SaveSystem<TSlot>` schema is a
 * TypeScript type living in game code — there is no way for an MCP caller to
 * transmit a Zod schema over JSON-RPC, so supporting custom shapes here
 * would mean re-inventing schema serialization for a rare case. Games using
 * a custom slot schema can still use `save_read`/`save_write` as opaque JSON
 * storage; only the default-shape convenience (auto-filled id/timestamp/
 * playtime) assumes `GameSaveSlot`.
 */
const GameSaveSlotSchema = z.object({
  id: z.string(),
  scene: z.string(),
  data: z.record(z.string(), z.unknown()),
  timestamp: z.number(),
  playtime: z.number().nonnegative(),
});

const WriteSchema = SlotSchema.extend({
  scene: z.string().min(1).describe('Scene name the save was taken in, matching GameSaveSlot.scene'),
  data: z.record(z.string(), z.unknown()).describe('Save data as a plain JSON object'),
  timestamp: z.number().optional().describe('Defaults to Date.now() if omitted, matching SaveSystem.save()'),
  playtime: z.number().nonnegative().optional().describe('Defaults to 0 if omitted, matching SaveSystem.save()'),
});

const ListSchema = z.object({
  subdir: SafeRelPath.optional(),
});

/** Resolve a slot name to an absolute path within the allowed base directory. */
function slotPath(slot: string): string {
  // SafeRelPath already forbids '..' and absolute paths at the schema layer,
  // but we also resolve and assert containment as defence-in-depth.
  const base = path.resolve(env.saveBaseDir);
  const resolved = path.resolve(base, `${slot}.json`);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    invalidParams('path traversal detected');
  }
  return resolved;
}

export const saveToolDefs = [
  {
    name: 'save_read',
    description:
      'Read a save slot from disk and return it as a GameSaveSlot ({ id, scene, data, timestamp, playtime }), matching the default schema of @emptysock/engine\'s SaveSystem.',
    inputSchema: {
      type: 'object',
      properties: { slot: { type: 'string', description: 'Alphanumeric slot name, e.g. "slot1" or "autosave"' } },
      required: ['slot'],
    },
  },
  {
    name: 'save_write',
    description:
      'Write a GameSaveSlot to disk under the given slot name. `timestamp` defaults to Date.now() and `playtime` defaults to 0, matching SaveSystem.save() with the default schema.',
    inputSchema: {
      type: 'object',
      properties: {
        slot: { type: 'string' },
        scene: { type: 'string', description: 'Scene name, matching GameSaveSlot.scene' },
        data: { type: 'object', description: 'Arbitrary save data' },
        timestamp: { type: 'number', description: 'Defaults to Date.now() if omitted' },
        playtime: { type: 'number', description: 'Defaults to 0 if omitted' },
      },
      required: ['slot', 'scene', 'data'],
    },
  },
  {
    name: 'save_delete',
    description: 'Delete a save slot from disk.',
    inputSchema: {
      type: 'object',
      properties: { slot: { type: 'string' } },
      required: ['slot'],
    },
  },
  {
    name: 'save_list',
    description: 'List all available save slots.',
    inputSchema: {
      type: 'object',
      properties: { subdir: { type: 'string', description: 'Optional sub-directory within save base (no traversal)' } },
    },
  },
] as const;

export async function saveHandler(toolName: string, raw: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (toolName) {
    case 'save_read': {
      const { slot } = parse(SlotSchema, raw);
      const file = slotPath(slot);
      try {
        const text = await fs.readFile(file, 'utf8');
        const result = GameSaveSlotSchema.safeParse(JSON.parse(text));
        if (!result.success) {
          return textResponse({ error: `Slot "${slot}" does not match the GameSaveSlot schema`, detail: result.error.message });
        }
        return textResponse(result.data);
      } catch (err) {
        return textResponse({ error: `Could not read slot "${slot}": ${(err as NodeJS.ErrnoException).message}` });
      }
    }
    case 'save_write': {
      const { slot, scene, data, timestamp, playtime } = parse(WriteSchema, raw);
      const file = slotPath(slot);
      const record = {
        id: slot,
        scene,
        data,
        timestamp: timestamp ?? Date.now(),
        playtime: playtime ?? 0,
      };
      const result = GameSaveSlotSchema.safeParse(record);
      if (!result.success) {
        return textResponse({ error: `Assembled slot does not match the GameSaveSlot schema`, detail: result.error.message });
      }
      try {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify(result.data, null, 2), 'utf8');
        return textResponse({ slot, written: true });
      } catch (err) {
        return textResponse({ error: `Could not write slot "${slot}": ${(err as NodeJS.ErrnoException).message}` });
      }
    }
    case 'save_delete': {
      const { slot } = parse(SlotSchema, raw);
      const file = slotPath(slot);
      try {
        await fs.rm(file, { force: true });
        return textResponse({ slot, deleted: true });
      } catch (err) {
        return textResponse({ error: `Could not delete slot "${slot}": ${(err as NodeJS.ErrnoException).message}` });
      }
    }
    case 'save_list': {
      const { subdir } = parse(ListSchema, raw);
      const dir = subdir ? path.resolve(env.saveBaseDir, subdir) : path.resolve(env.saveBaseDir);
      // Containment check — SafeRelPath forbids traversal at schema level, but
      // we assert here as defence-in-depth.
      if (!dir.startsWith(path.resolve(env.saveBaseDir))) {
        return textResponse({ error: 'Path is outside the allowed base directory' });
      }
      const entries = await fs.readdir(dir).catch(() => [] as string[]);
      const slots = entries.filter((e) => e.endsWith('.json')).map((e) => e.replace(/\.json$/, ''));
      return textResponse({ slots, dir });
    }
    default:
      throw notFound(toolName);
  }
}
