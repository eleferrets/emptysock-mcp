import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { navmeshToolDefs, navmeshHandler } from './navmesh.js';
import { physicsToolDefs, physicsHandler } from './physics.js';
import { sceneToolDefs, sceneHandler } from './scene.js';
import { saveToolDefs, saveHandler } from './save.js';
import { actorToolDefs, actorHandler } from './actor.js';

type ToolHandler = (toolName: string, args: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;

type RegistryEntry = {
  handler: ToolHandler;
  domain: string;
};

/** Build the handler registry once at startup — O(1) dispatch per call. */
function buildRegistry(): Map<string, RegistryEntry> {
  const map = new Map<string, RegistryEntry>();

  const register = (defs: ReadonlyArray<{ name: string }>, handler: ToolHandler, domain: string) => {
    for (const def of defs) {
      map.set(def.name, { handler, domain });
    }
  };

  register(navmeshToolDefs, navmeshHandler, 'navmesh');
  register(physicsToolDefs, physicsHandler, 'physics');
  register(sceneToolDefs,   sceneHandler,   'scene');
  register(saveToolDefs,    saveHandler,    'save');
  register(actorToolDefs,   actorHandler,   'actor');

  return map;
}

const registry = buildRegistry();

/** Return all tool definitions for the ListTools response. */
export function listTools() {
  return [
    ...navmeshToolDefs,
    ...physicsToolDefs,
    ...sceneToolDefs,
    ...saveToolDefs,
    ...actorToolDefs,
  ];
}

/** Dispatch a tool call. Throws McpError(MethodNotFound) for unknown names. */
export async function dispatchTool(name: string, args: unknown) {
  const entry = registry.get(name);
  if (!entry) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }
  return entry.handler(name, args);
}
