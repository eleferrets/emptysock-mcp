import { textResponse } from '../lib/response.js';
import { notFound } from '../lib/errors.js';

export const layerToolDefs = [
  {
    name: 'emptysock_layer_info',
    description:
      'Return reference documentation for the EmptySock LayerSystem API (@emptysock/engine): defineLayer, addEntity, removeEntity, setDepth, setVisible, setOffset, getLayersSorted, and how RenderPipeline shares a LayerSystem. Static documentation, not project-specific.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
] as const;

export async function layerHandler(toolName: string, _raw: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  switch (toolName) {
    case 'emptysock_layer_info': {
      return textResponse({
        api: 'LayerSystem',
        package: '@emptysock/engine',
        description:
          'Manages named render layers, draw order, and entity depth sorting. ' +
          'Entities (by numeric entity.eid) are assigned to a named layer at a depth; the renderer draws layers in ascending index order, ' +
          'then entities within a layer in ascending depth. Four layers exist out of the box: background (-1000), default (0), foreground (100), ui (1000). ' +
          'RenderPipeline owns a LayerSystem (render.layers) and assigns sprites to layers automatically from Sprite.layer / Sprite.depth.',
        methods: {
          'new LayerSystem()': 'Constructor. Pre-registers background, default, foreground and ui. Pass it to RenderPipeline via the layers option to share it.',
          'defineLayer(name, index)':
            'Define or redefine a named layer at the given sort index. Lower index renders first (behind).',
          'addEntity(entityId, layerName, depth?)':
            'Assign an entity (numeric id, entity.eid) to a named layer, optionally with a depth for sub-layer sorting (default 0). An unknown layer name falls back to "default" with a warning.',
          'removeEntity(entityId)':
            'Unregister an entity from the layer system. The entity is not destroyed.',
          'setDepth(entityId, depth)':
            'Change an entity\'s depth within its current layer.',
          'setVisible(name, visible)':
            'Show or hide an entire layer. Hidden layers are skipped in the render pass.',
          'isVisible(name)': 'Whether a layer is visible.',
          'setOffset(name, x, y) / getOffset(name)': 'Per-layer pixel offset, for parallax or scrolling layers.',
          'getEntityLayer(entityId) / getEntityDepth(entityId)': 'Current layer name (or null) and depth (or 0).',
          'getSortKey(entityId)': 'Returns [layerIndex, depth] for use in a sort comparator.',
          'getEntitiesOnLayer(layerName)': 'Entities on a layer sorted by depth ascending.',
          'getLayersSorted()':
            'Returns LayerConfig[] ({ name, index, visible }) sorted by ascending index.',
          'destroy()': 'Clear all placements and layers.',
        },
        notes: [
          'Use index gaps (0, 10, 20, ...) so layers can be inserted later without renumbering.',
          'Most games never call addEntity: RenderPipeline syncs Sprite.layer / Sprite.depth into its LayerSystem every frame.',
          'There is no addToLayer or setParallax method; use addEntity and setOffset.',
          'Toggling setVisible is cheaper than destroying and re-adding entities.',
          'RenderPipeline.attachLighting(lighting, layerId = "default") applies the lighting darkness filter to one named layer; pick the layer there, not on LayerSystem.',
        ],
        exampleCode: `
import { LayerSystem, RenderPipeline, Sprite, Transform } from '@emptysock/engine';

const layers = new LayerSystem();
layers.defineLayer('midground', 50);
layers.defineLayer('fx', 80);

const render = new RenderPipeline({ layers });
await render.init({ width: 1280, height: 720 });

// Normal path: the pipeline reads layer/depth off the Sprite component.
const hero = scene.spawn('hero');
hero.add(Transform, { x: 100, y: 200 });
hero.add(Sprite, { texturePath: 'hero.png', layer: 'midground', depth: 5 });

// Manual placement / visibility control:
layers.addEntity(hero.eid, 'foreground', 10);
layers.setVisible('fx', false);

// on shutdown:
render.destroy();
        `.trim(),
      });
    }

    default:
      throw notFound(toolName);
  }
}
