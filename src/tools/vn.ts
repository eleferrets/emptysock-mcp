import { z } from 'zod';
import { parse, SafeId } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';

const StoryGraphExportSchema = z.object({
  sceneId: SafeId,
  graphId: SafeId.optional(),
});

export const vnToolDefs = [
  {
    name: 'story_graph_export',
    description:
      'Export the Story Graph (VNSystem) for a named scene as a JSON object containing nodes and edges.',
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

export async function vnHandler(toolName: string, raw: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (toolName) {
    case 'story_graph_export': {
      const { sceneId, graphId } = parse(StoryGraphExportSchema, raw);
      return textResponse({ sceneId, graphId: graphId ?? 'default', nodes: [], edges: [] });
    }
    default:
      throw new Error(`Unrouted vn tool: ${toolName}`);
  }
}
