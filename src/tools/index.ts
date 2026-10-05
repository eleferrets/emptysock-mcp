import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { navmeshToolDefs, navmeshHandler } from './navmesh.js';
import { physicsToolDefs, physicsHandler } from './physics.js';
import { sceneToolDefs, sceneHandler } from './scene.js';
import { saveToolDefs, saveHandler } from './save.js';
import { actorToolDefs, actorHandler } from './actor.js';
import { layerToolDefs, layerHandler } from './layer.js';
import { particleToolDefs, particleHandler } from './particle.js';
import { vnToolDefs, vnHandler } from './vn.js';
import { battleToolDefs, battleHandler } from './battle.js';
import { visualscriptToolDefs, visualscriptHandler } from './visualscript.js';
import { notFound } from '../lib/errors.js';

type ToolHandler = (toolName: string, args: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;

/** Build the handler registry once at startup — O(1) dispatch per call. */
function buildRegistry(): Map<string, ToolHandler> {
  const map = new Map<string, ToolHandler>();

  const register = (defs: ReadonlyArray<{ name: string }>, handler: ToolHandler) => {
    for (const def of defs) map.set(def.name, handler);
  };

  register(navmeshToolDefs, navmeshHandler);
  register(physicsToolDefs, physicsHandler);
  register(sceneToolDefs,   sceneHandler);
  register(saveToolDefs,    saveHandler);
  register(actorToolDefs,   actorHandler);
  register(layerToolDefs,      layerHandler);
  register(particleToolDefs,  particleHandler);
  register(vnToolDefs,        vnHandler);
  register(battleToolDefs,    battleHandler);
  register(visualscriptToolDefs, visualscriptHandler);

  return map;
}

const registry = buildRegistry();

/** Return all tool definitions for the ListTools response. */
export function listTools(): Tool[] {
  return [
    ...navmeshToolDefs,
    ...physicsToolDefs,
    ...sceneToolDefs,
    ...saveToolDefs,
    ...actorToolDefs,
    ...layerToolDefs,
    ...particleToolDefs,
    ...vnToolDefs,
    ...battleToolDefs,
    ...visualscriptToolDefs,
  ] as Tool[];
}

/** Dispatch a tool call. Throws McpError(MethodNotFound) for unknown names. */
export async function dispatchTool(
  name: string,
  args: unknown,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const handler = registry.get(name);
  if (!handler) {
    throw notFound(name);
  }
  return handler(name, args);
}
