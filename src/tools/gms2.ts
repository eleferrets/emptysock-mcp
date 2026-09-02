import fs from 'fs';
import path from 'path';
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

export async function gms2Handler(toolName: string, raw: unknown) {
  switch (toolName) {
    case 'gms2_inspect_project': {
      const { yypPath } = parse(Gms2InspectSchema, raw);

      // Resolve and enforce containment within saveBaseDir so callers cannot
      // read arbitrary files by supplying an absolute path like /etc/passwd.
      const resolved = path.resolve(env.saveBaseDir, yypPath);
      if (!resolved.startsWith(path.resolve(env.saveBaseDir) + path.sep) &&
          resolved !== path.resolve(env.saveBaseDir)) {
        return textResponse({ error: 'Path is outside the allowed base directory' });
      }

      let fileContent: string;
      try {
        fileContent = fs.readFileSync(resolved, 'utf8');
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
          'Manages named render layers, draw order, visibility, and per-layer camera parallax. ' +
          'Entities are assigned to a layer; RenderSystem draws layers in ascending zOrder.',
        methods: {
          'new LayerSystem()': 'Constructor. Create once in onLoad.',
          'defineLayer(opts)':
            'Register a layer. opts: { name: string, zOrder: number, parallax?: {x,y}, blendMode?: "normal"|"additive", fixed?: boolean }',
          'addToLayer(name, entity)': 'Assign an entity to a named layer.',
          'removeFromLayer(name, entity)': 'Remove an entity from a layer (entity is not destroyed).',
          'setVisible(name, visible)': 'Show or hide an entire layer. Hidden layers are skipped in the render pass.',
          'setParallax(name, {x, y})': 'Change the camera offset multiplier for a layer at runtime.',
          'sorted()': 'Returns all layers in ascending zOrder.',
          'destroy()': 'Release layer state. Call in onDestroy.',
        },
        integration:
          'Call scene.setLayerSystem(layers) once in onLoad. Without this call, entities render in insertion order with no parallax.',
        notes: [
          'Use zOrder gaps (0, 10, 20, …) so layers can be inserted later without renumbering.',
          'fixed: true makes a layer ignore camera translation — correct for HUD and UI layers.',
          'blendMode: "additive" on particle/glow layers avoids dark halos on transparent sprites.',
          'Toggling setVisible is cheaper than destroying and re-adding entities.',
        ],
        exampleCode: `
import { LayerSystem } from '@emptysock/engine';
const layers = new LayerSystem();
layers.defineLayer({ name: 'Background', zOrder: 0,  parallax: { x: 0.2, y: 0.2 } });
layers.defineLayer({ name: 'Gameplay',   zOrder: 20 });
layers.defineLayer({ name: 'UI',         zOrder: 40, fixed: true });
scene.setLayerSystem(layers);
layers.addToLayer('Gameplay', player);
layers.setVisible('Background', false);
// in onDestroy:
layers.destroy();
        `.trim(),
      });
    }

    default:
      throw notFound(toolName);
  }
}
