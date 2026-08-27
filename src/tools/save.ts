import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import { parse, SafeRelPath } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';
import { env } from '../env.js';

const SlotSchema = z.object({
  slot: z.string().min(1).max(64).regex(/^[\w-]+$/, 'Slot name must be alphanumeric with dashes/underscores'),
});

const WriteSchema = SlotSchema.extend({
  data: z.record(z.unknown()).describe('Save data as a plain JSON object'),
});

const ListSchema = z.object({
  subdir: SafeRelPath.optional(),
});

/** Resolve a slot name to an absolute path within the allowed base directory. */
function slotPath(slot: string): string {
  // SafeRelPath already forbids '..' and absolute paths at the schema layer,
  // but we also resolve and assert containment as defence-in-depth.
  const resolved = path.resolve(env.saveBaseDir, `${slot}.json`);
  if (!resolved.startsWith(path.resolve(env.saveBaseDir))) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

export const saveToolDefs = [
  {
    name: 'save_read',
    description: 'Read a save slot from disk and return its JSON data.',
    inputSchema: {
      type: 'object',
      properties: { slot: { type: 'string', description: 'Alphanumeric slot name, e.g. "slot1" or "autosave"' } },
      required: ['slot'],
    },
  },
  {
    name: 'save_write',
    description: 'Write JSON data to a save slot on disk.',
    inputSchema: {
      type: 'object',
      properties: {
        slot: { type: 'string' },
        data: { type: 'object', description: 'Arbitrary save data' },
      },
      required: ['slot', 'data'],
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

export async function saveHandler(toolName: string, raw: unknown) {
  switch (toolName) {
    case 'save_read': {
      const { slot } = parse(SlotSchema, raw);
      const file = slotPath(slot);
      const text = await fs.readFile(file, 'utf8');
      return textResponse({ slot, data: JSON.parse(text) as unknown });
    }
    case 'save_write': {
      const { slot, data } = parse(WriteSchema, raw);
      const file = slotPath(slot);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
      return textResponse({ slot, written: true });
    }
    case 'save_delete': {
      const { slot } = parse(SlotSchema, raw);
      const file = slotPath(slot);
      await fs.rm(file, { force: true });
      return textResponse({ slot, deleted: true });
    }
    case 'save_list': {
      parse(ListSchema, raw);
      const entries = await fs.readdir(env.saveBaseDir).catch(() => [] as string[]);
      const slots = entries.filter((e) => e.endsWith('.json')).map((e) => e.replace(/\.json$/, ''));
      return textResponse({ slots });
    }
    default:
      throw new Error(`Unrouted save tool: ${toolName}`);
  }
}
