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

const StoryGraphNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['dialogue', 'choice']),
  x: z.number(),
  y: z.number(),
  speaker: z.string().optional(),
  text: z.string(),
  options: z.array(z.string()).optional(),
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
      'Read the Story Graph (VNSystem) for a named scene from {assetBaseDir}/{sceneId}/{graphId}.storyGraph.json and return the parsed nodes, edges, and startNodeId.',
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
      notFound(toolName);
  }
}
