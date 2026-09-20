import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import { parse, SafeId } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';
import { invalidParams, notFound } from '../lib/errors.js';
import { env } from '../env.js';

const StoryGraphExportSchema = z.object({
  sceneId: SafeId,
  graphId: SafeId.optional(),
});

/**
 * Mirrors VariableCondition from @emptysock/engine's VariableStore. Gates
 * `condition` nodes and, via `optionWhens`, individual choice options.
 */
const VariableConditionSchema = z.union([
  z.object({ kind: z.literal('switch'), index: z.number().int(), equals: z.boolean() }),
  z.object({
    kind: z.literal('variable'),
    index: z.number().int(),
    op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
    value: z.number(),
  }),
]);

/**
 * Mirrors StoryGraphNode from @emptysock/engine's VNScriptConvert.ts — the
 * visual-editor representation persisted as .storyGraph.json. Note this is
 * NOT the same shape as a VNSystem DialogueNode: choice options are plain
 * label strings (the `next` target lives on the edge, keyed by fromPort),
 * and a `condition` node's true/false targets likewise come from its edges
 * (fromPort 0 = true, fromPort 1 = optional false), not from fields on the
 * node itself.
 */
const StoryGraphNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['dialogue', 'choice', 'condition']),
  x: z.number(),
  y: z.number(),
  speaker: z.string().optional(),
  text: z.string(),
  options: z.array(z.string()).optional(),
  /**
   * Per-option `when` gate, aligned by index with `options`. Present only on
   * `"choice"` nodes; an `undefined` entry (or a shorter/absent array) means
   * that option has no condition and is always shown.
   */
  // JSON has no `undefined` — a serialized array's absent entries round-trip as `null`,
  // so each slot accepts a VariableCondition or null (no condition for that option).
  optionWhens: z.array(VariableConditionSchema.nullable()).optional(),
  /** Present only on `"condition"` nodes — the gate evaluated to pick a branch. */
  condition: VariableConditionSchema.optional(),
});

const StoryGraphEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  fromPort: z.number(),
  to: z.string(),
});

const StoryGraphSchema = z.object({
  nodes: z.array(StoryGraphNodeSchema),
  edges: z.array(StoryGraphEdgeSchema),
  startNodeId: z.string(),
});

/** Resolve the story graph file path and assert containment within assetBaseDir. */
function graphPath(sceneId: string, graphId: string): string {
  const base = path.resolve(env.assetBaseDir);
  const resolved = path.resolve(base, sceneId, `${graphId}.storyGraph.json`);
  if (!resolved.startsWith(base)) {
    invalidParams('path traversal detected');
  }
  return resolved;
}

export const vnToolDefs = [
  {
    name: 'story_graph_export',
    description:
      'Read the Story Graph (VNSystem) for a named scene from {assetBaseDir}/{sceneId}/{graphId}.storyGraph.json and return the parsed nodes, edges, and startNodeId. Node types are "dialogue", "choice", and the VariableStore-driven "condition" type. Choice nodes carry option labels in `options` and, when any option is gated, a parallel `optionWhens` array of VariableCondition; a condition node carries a single `condition`. Branch targets (a choice option\'s destination, or a condition node\'s true/false destinations) are edges, not node fields: edges are keyed by `fromPort` (condition: 0 = true, 1 = false; choice: index into `options`).',
    inputSchema: {
      type: 'object',
      properties: {
        sceneId: { type: 'string' },
        graphId: { type: 'string', description: 'Graph identifier. Defaults to "default".' },
      },
      required: ['sceneId'],
    },
  },
] as const;

export async function vnHandler(
  toolName: string,
  raw: unknown,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (toolName) {
    case 'story_graph_export': {
      const { sceneId, graphId } = parse(StoryGraphExportSchema, raw);
      const resolvedGraphId = graphId ?? 'default';
      const filePath = graphPath(sceneId, resolvedGraphId);
      try {
        const text = await fs.readFile(filePath, 'utf8');
        let raw_json: unknown;
        try {
          raw_json = JSON.parse(text) as unknown;
        } catch (err) {
          return textResponse({
            error: 'invalid story graph format',
            detail: (err as Error).message,
          });
        }
        const result = StoryGraphSchema.safeParse(raw_json);
        if (!result.success) {
          return textResponse({
            error: 'invalid story graph format',
            detail: result.error.message,
          });
        }
        return textResponse(result.data);
      } catch (err) {
        const nodeErr = err as NodeJS.ErrnoException;
        if (nodeErr.code === 'ENOENT') {
          return textResponse({ error: 'story graph not found', sceneId, graphId: resolvedGraphId });
        }
        return textResponse({ error: 'failed to read story graph', detail: nodeErr.message });
      }
    }
    default:
      throw notFound(toolName);
  }
}
