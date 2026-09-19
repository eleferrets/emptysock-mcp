import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { parse, SafeRelPath } from '../lib/validate.js';
import { textResponse } from '../lib/response.js';
import { notFound } from '../lib/errors.js';
import { env } from '../env.js';

const Gms2InspectSchema = z.object({
  yypPath: SafeRelPath.refine((p) => p.endsWith('.yyp'), {
    message: 'Path must point to a .yyp file',
  }),
});

/**
 * Prefix groups that map to GMS2 asset types.
 * Keys are the leading path component inside the .yyp resources array.
 */
const ASSET_PREFIXES: Record<string, string> = {
  objects:  'objects',
  scripts:  'scripts',
  rooms:    'rooms',
  sprites:  'sprites',
  sounds:   'sounds',
  tilesets: 'tilesets',
  fonts:    'fonts',
  shaders:  'shaders',
  paths:    'paths',
  sequences: 'sequences',
};

interface YypResource {
  id: { name: string; path: string };
  order?: number;
}

interface YypFile {
  name?: string;
  resources?: YypResource[];
  [key: string]: unknown;
}

export const gms2ToolDefs = [
  {
    name: 'gms2_inspect_project',
    description:
      'Read a GameMaker Studio 2 .yyp project file and return a JSON summary: project name, asset counts by type, and lists of object and script names. Read-only — does not modify any files.',
    inputSchema: {
      type: 'object',
      properties: {
        yypPath: {
          type: 'string',
          description: 'Absolute or relative path to the .yyp project file.',
        },
      },
      required: ['yypPath'],
    },
  },
  {
    name: 'emptysock_layer_info',
    description:
      'Return reference documentation for the EmptySock LayerSystem API: defineLayer, addToLayer, setVisible, setParallax, and RenderSystem integration.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
] as const;

export async function gms2Handler(toolName: string, raw: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (toolName) {
    case 'gms2_inspect_project': {
      const { yypPath } = parse(Gms2InspectSchema, raw);

      // Resolve and enforce containment within assetBaseDir so callers cannot
      // read arbitrary files by supplying an absolute path like /etc/passwd.
      const base = path.resolve(env.assetBaseDir);
      const resolved = path.resolve(base, yypPath);
      if (!resolved.startsWith(base + path.sep) &&
          resolved !== base) {
        return textResponse({ error: 'Path is outside the allowed base directory' });
      }

      let fileContent: string;
      try {
        fileContent = await fs.readFile(resolved, 'utf8');
      } catch (err) {
        return textResponse({ error: `Could not read file: ${(err as NodeJS.ErrnoException).message}` });
      }

      let yyp: YypFile;
      try {
        yyp = JSON.parse(fileContent) as YypFile;
      } catch {
        return textResponse({ error: 'File is not valid JSON — is this a GMS2 2.3+ project?' });
      }

      const resources: YypResource[] = Array.isArray(yyp.resources) ? yyp.resources : [];

      // Count assets by type and collect object/script names
      const counts: Record<string, number> = {};
      const objectNames: string[] = [];
      const scriptNames: string[] = [];

      for (const res of resources) {
        const resPath: string = res?.id?.path ?? '';
        const prefix = resPath.split('/')[0] ?? 'unknown';
        const typeName = ASSET_PREFIXES[prefix] ?? prefix;
        counts[typeName] = (counts[typeName] ?? 0) + 1;

        const name: string = res?.id?.name ?? '';
        if (prefix === 'objects' && name) objectNames.push(name);
        if (prefix === 'scripts' && name) scriptNames.push(name);
      }

      return textResponse({
        projectName: yyp.name ?? path.basename(yypPath, '.yyp'),
        yypPath,
        totalResources: resources.length,
        assetCounts: counts,
        objectNames: objectNames.sort(),
        scriptNames: scriptNames.sort(),
      });
    }

    case 'emptysock_layer_info': {
      return textResponse({
        api: 'LayerSystem',
        package: '@emptysock/engine',
        description:
          'Manages named render layers, draw order, and entity depth sorting. ' +
          'Entities are assigned to a named layer; LayerSystem.getLayersSorted() returns ' +
          'layers in ascending index order for use by the renderer.',
        methods: {
          'new LayerSystem()': 'Constructor. Create once in onLoad and pass to RenderSystem.',
          'defineLayer(name, index)':
            'Register a named layer at the given sort index. Lower index renders first (behind).',
          'addEntity(entityId, layerName, depth?)':
            'Assign an entity to a named layer, optionally with a depth value for sub-layer sorting.',
          'removeEntity(entityId)':
            'Remove an entity from whichever layer it belongs to. Entity is not destroyed.',
          'setVisible(name, visible)':
            'Show or hide an entire layer. Hidden layers are skipped in the render pass.',
          'getLayersSorted()':
            'Returns LayerConfig[] sorted by ascending index.',
          'destroy()': 'Release layer state. Call in onDestroy.',
        },
        notes: [
          'Use index gaps (0, 10, 20, …) so layers can be inserted later without renumbering.',
          'Pass the LayerSystem instance to RenderSystem via the layerSystem option in init().',
          'Toggling setVisible is cheaper than destroying and re-adding entities.',
        ],
        exampleCode: `
import { LayerSystem, RenderSystem } from '@emptysock/engine';
const layers = new LayerSystem();
layers.defineLayer('background', 0);
layers.defineLayer('gameplay', 20);
layers.defineLayer('ui', 40);

const renderer = new RenderSystem();
await renderer.init({ layerSystem: layers });

layers.addEntity(player.id, 'gameplay');
layers.addEntity(bg.id, 'background');
layers.setVisible('background', true);

// in onDestroy:
layers.destroy();
        `.trim(),
      });
    }

    default:
      throw notFound(toolName);
  }
}
