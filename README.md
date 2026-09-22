# emptysock-mcp

A Model Context Protocol server for the [EmptySock](https://github.com/eleferrets/emptysock-engine) game engine. It hands Claude Desktop, AI agents, and the Claude API a set of tools for poking at an EmptySock project: reading save files, validating Story Graphs and VisualScript graphs, importing GameMaker Studio 2 projects, estimating battle damage, and (eventually, see below) querying a live running game's physics and scene state.

Some of these tools do real work against real files on disk today. A few are honest placeholders waiting on a live connection to an actual game process. The table below tells you which is which — no tool here pretends to be more finished than it is.

---

## Requirements

- Node.js 20+
- npm 9+

---

## Installation

```bash
git clone https://github.com/eleferrets/emptysock-mcp.git
cd emptysock-mcp
npm install
npm run build
```

---

## Configuration

Copy the example env file and fill in whatever you need:

```bash
cp .env.example .env
```

| Variable | Required | What it does |
|---|---|---|
| `SAVE_BASE_DIR` | No | The one directory the save tools are allowed to touch. Everything `save_read`/`save_write`/`save_delete`/`save_list` does is sandboxed to this path. Defaults to the process's working directory, which is fine for poking around locally and not what you want in production. |
| `ASSET_BASE_DIR` | No | The directory project asset files live under. `story_graph_export` and `gms2_inspect_project` both resolve their paths from here. Same story: defaults to cwd, set it explicitly once this is running somewhere real. |
| `RATE_LIMIT_MAX` | No | How many calls a single tool can take in one rate-limit window before it starts saying no. Default `60`. This exists mostly so an agent stuck in a retry loop doesn't hammer the process forever. |
| `RATE_LIMIT_WINDOW_MS` | No | The length of that window, in milliseconds. Default `60000` (one minute). |

> **Never commit `.env`.** It's gitignored for a reason — keep secrets in your CI/CD secret manager instead.

---

## Running the server

### stdio (recommended for local use and Claude Desktop)

```bash
npm run dev          # development — tsx, no build step
# or after building:
node dist/server.js
```

The server talks over stdin/stdout. There's no network port and no auth layer to configure, because there's nothing listening for anyone to break into.

### Claude Desktop

Add the server to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "emptysock": {
      "command": "node",
      "args": ["/absolute/path/to/emptysock-mcp/dist/server.js"],
      "env": {
        "SAVE_BASE_DIR": "/absolute/path/to/your/saves"
      }
    }
  }
}
```

Restart Claude Desktop and the EmptySock tools show up in the tool picker.

---

## What this server actually talks to (read this before assuming a tool does more than it does)

There is currently no live connection between this server and a running EmptySock game. That's not an oversight, it's the current state of a real piece of engine work: `@emptysock/engine`'s `QueryChannel` (`v2/bridge/QueryChannel.ts`) is a real, finished, transport-agnostic query interface built specifically so a server like this one can eventually ask a live game "what's at this entity" or "what does this raycast hit" and get a real answer back instead of a guess. Wiring an actual transport between that channel and this process (a socket, a `postMessage` bridge, whatever a given host needs) is deliberate follow-up work for a later pass — it is not done yet, and this pass didn't attempt it.

What that means in practice, split by domain:

- **Physics and Scene tools** (`physics_*`, `scene_*`) are honest stubs today. They validate your input correctly and return a fixed, empty-ish shape — not because the tool is broken, but because there's no live game for it to ask. See the tool tables below for exactly what each one currently returns.
- **NavMesh and Actor tools** (`navmesh_*`, `actor_*`) are also stubs for the same reason — there's no live `ActorSystem` or `NavMeshSystem` instance to reach into.
- **Save, GMS2 import, Story Graph export, and VisualScript validation** are all real, working tools that operate on static project files on disk (save JSON, `.yyp`/`.yy` files, `.storyGraph.json` files, a `VisualScriptGraph` payload you hand it directly). No live game required, because none of these ever needed one.
- **Battle damage estimation** is a real, working, pure calculation — it reimplements `BattleSystem`'s default physical damage formula rather than driving a live `BattleSystem` instance, because that instance is a stateful turn machine meant to run inside a real game loop, not something this server has any business owning.
- **`emptysock_layer_info`** is reference documentation served as a tool response, not a stub — there's nothing to fake here, it's just handing back API docs.

One more note on terminology: the engine's recent module-package split moved VN, battle, and tilemap logic out of core `@emptysock/engine` into their own packages (`@emptysock/vn`, `@emptysock/battle`, `@emptysock/tilemap`). This server is a separate Node process and doesn't import the engine at all, so none of that split changes any code here — but the `story_graph_export`, `battle_estimate_damage`, and `navmesh_*` tools below are documented against the current package names (VNSystem now lives in `@emptysock/vn`, BattleSystem in `@emptysock/battle`, NavMeshSystem in `@emptysock/tilemap`) so you know which package's shape you're actually matching.

### Security model, in plain terms

- **Path safety.** Every filesystem path a caller supplies goes through a `SafeRelPath` Zod schema (no `..`, no leading `/` or `\`) and then gets resolved and checked again against the allowed base directory before any file touches disk. Two independent checks, because "the schema already rejected it" is a bad place to stop trusting yourself.
- **Rate limiting.** A sliding-window limiter sits in front of every tool call, keyed by tool name, tuned by `RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS`. It exists to stop a runaway agent loop from calling the same tool a thousand times in ten seconds, not to defend against a hostile network attacker (there is no network surface to attack).
- **Audit logging.** Every tool call gets logged as one line of JSON to stderr — tool name, status, duration. Never to stdout, because stdout is the actual MCP wire protocol and mixing log lines into it would corrupt every message after.
- **Input validation.** Every tool argument is parsed with Zod before anything happens. Malformed input gets a clean `InvalidParams` error, not a stack trace or a half-executed side effect.
- **No credentials, no secrets.** There's no auth surface to configure because stdio has exactly one caller: the MCP host process that spawned this one.

---

## Available tools

Status key: **live** — does real work, no live game needed. **stub** — validates input correctly, returns a fixed placeholder shape, waiting on the `QueryChannel` bridge described above. **docs** — returns static reference information by design, not a stub.

### NavMesh

| Tool | Status | Parameters | Returns |
|---|---|---|---|
| `navmesh_find_path` | stub | `from: Vec2` (required), `to: Vec2` (required), `mapId: string` (required) | `{ mapId, path }` — currently a fabricated 3-point path (`from`, the midpoint, `to`), not a real A* result off any loaded navmesh. |
| `navmesh_nearest_node` | stub | `mapId: string` (required), `point: Vec2` (required) | `{ mapId, nearestNode }` — currently just echoes `point` back unchanged. |

`@emptysock/tilemap`'s `NavMeshSystem` is where a real path or nearest-node query would eventually come from, once there's a live instance to query. Right now there isn't one, so treat these two as schema demonstrations rather than usable pathfinding.

**Example call — find path:**
```json
{ "from": { "x": 0, "y": 0 }, "to": { "x": 100, "y": 50 }, "mapId": "level1" }
```

---

### Physics

| Tool | Status | Parameters | Returns |
|---|---|---|---|
| `physics_raycast_2d` | stub | `origin: Vec2`, `direction: Vec2`, `maxDistance: number > 0` (all required); `layerMask: number` (optional) | `{ hit: null, args }` — always reports no hit. There is no 2D physics world attached to check against. |
| `physics_overlap_circle` | stub | `center: Vec2`, `radius: number > 0, ≤ 100000` (required); `layerMask: number` (optional) | `{ entities: [], args }` — always reports an empty overlap set. |
| `physics_body_state` | stub | `entityId: string` (required) | `{ entityId, position: null, velocity: null, angularVelocity: null, bodyHandle: null, colliderHandle: null, isSensor: null }` — every field is `null` because there's no live `PhysicsSystem` registering handles for this entity yet. |

There's no `physics_raycast_3d` tool in this registry. 3D raycasting isn't offered at all right now, not even as a stub — implementing it needs a Rapier3D WASM build available server-side, which this server doesn't have (the engine's 3D physics runs in the browser's WASM context, not in Node). Don't call it expecting an error message with useful detail; you'll just get an unknown-tool error like any other made-up tool name.

**Example call — overlap circle:**
```json
{ "center": { "x": 50, "y": 50 }, "radius": 20, "layerMask": 3 }
```

---

### Scene

| Tool | Status | Parameters | Returns |
|---|---|---|---|
| `scene_list_entities` | stub | `sceneId: string` (required) | `{ sceneId, entities: [] }` — always empty. |
| `scene_entity_info` | stub | `sceneId: string`, `entityId: string` (both required) | `{ sceneId, entityId, tag: null, active: true, components: [] }` — fixed placeholder, not a real lookup. |
| `scene_get_component` | stub | `sceneId: string`, `entityId: string`, `componentType: string` (PascalCase class name, all required) | `{ sceneId, entityId, componentType, data: null }` — always `null`. |
| `scene_create_entity` | stub | `sceneId: string` (required); `tag: string`, `components: string[]` (optional) | `{ sceneId, entityId, tag, components }` — `entityId` is a locally-generated placeholder (`entity-<timestamp>`), not an ID handed out by a real `Scene`. Calling this does not create anything in an actual game. |

**Example call — get component:**
```json
{ "sceneId": "gameplay", "entityId": "player-001", "componentType": "Transform" }
```

---

### Save

All save tools are sandboxed to `SAVE_BASE_DIR`. Path traversal (`..`, absolute paths) is rejected both at the schema layer and again when the path is resolved.

Slots are read and written using the engine's default `GameSaveSlot` shape (`{ id, scene, data, timestamp, playtime }`, from `SaveSystem` in `@emptysock/engine`). `SaveSystem` itself is generic over any Zod schema you construct it with, but these tools only speak the default shape — there's no way to carry an arbitrary Zod schema over MCP's JSON-RPC wire, so a game using a custom `SaveSystem<TSlot>` shape should treat these as opaque JSON storage rather than relying on the auto-filled `id`/`timestamp`/`playtime` convenience.

| Tool | Status | Parameters | Returns |
|---|---|---|---|
| `save_read` | live | `slot: string` (alphanumeric + `-`/`_`, required) | The `GameSaveSlot` read from disk, or `{ error }` if the slot is missing or doesn't match the shape. |
| `save_write` | live | `slot: string`, `scene: string`, `data: object` (required); `timestamp: number`, `playtime: number` (optional, default to `Date.now()` and `0`) | `{ slot, written: true }`, or `{ error }` on failure. |
| `save_delete` | live | `slot: string` (required) | `{ slot, deleted: true }` (deleting a slot that doesn't exist still reports success). |
| `save_list` | live | `subdir: string` (optional, no traversal) | `{ slots, dir }` — every `.json` file in the directory, extension stripped. |

**Example call — write:**
```json
{ "slot": "autosave", "scene": "bridge-level", "data": { "level": 3, "score": 4200, "checkpoint": "bridge" } }
```

Slot names are alphanumeric plus dashes/underscores only (`slot1`, `autosave`, `new-game-plus`).

---

### Actor

| Tool | Status | Parameters | Returns |
|---|---|---|---|
| `actor_send_message` | stub | `actorId: string`, `message: { type: string, payload?: unknown }` (both required) | `{ actorId, enqueued: true, message }` — reports success without actually enqueueing anything in a real `ActorSystem` inbox. |
| `actor_broadcast` | stub | `message: { type: string, payload?: unknown }` (required) | `{ broadcast: true, message }` — same story, no live actors to reach. |
| `actor_inbox_size` | stub | `actorId: string` (required) | `{ actorId, inboxSize: 0 }` — always zero. |
| `actor_list` | stub | none | `{ actors: [] }` — always empty. |

Once these are wired to a live game, the same ordering guarantee `ActorSystem` uses everywhere else applies: it drains every actor's inbox before calling `update()` on any actor, so a message sent during frame N is fully processed before frame N's `update()` logic runs.

**Example call — send message:**
```json
{ "actorId": "enemy-spawner", "message": { "type": "SPAWN_WAVE", "payload": { "wave": 3 } } }
```

---

### GMS2

| Tool | Status | Parameters | Returns |
|---|---|---|---|
| `gms2_inspect_project` | live | `yypPath: string` (relative path to a `.yyp` file, required) | `{ projectName, yypPath, totalResources, assetCounts, objectNames, scriptNames }`, or `{ error }` if the file is missing, outside `ASSET_BASE_DIR`, or not valid JSON even after trailing-comma cleanup. |
| `emptysock_layer_info` | docs | none | A reference document for the `LayerSystem` API — methods, usage notes, and an example. Not project-specific; same response every time. |

`gms2_inspect_project` actually parses a real GameMaker Studio 2 project: it tolerates the trailing commas GameMaker's IDE always writes (not strict JSON) and reads the project's display name from the real `"%Name"` key rather than a `"name"` field that doesn't exist there.

---

### Particles

| Tool | Status | Parameters | Returns |
|---|---|---|---|
| `particle_emitter_config` | stub | `emitterId: string` (required); `config: ParticleEmitterOptions` (optional — omit to read, provide to write) | Reading returns a fixed default config merged with nothing real; writing returns `{ emitterId, updated: true, config }` where `config` is your input merged over those same defaults. Nothing is persisted and no live `ParticleSystem` emitter is actually touched. |

**Example call — read config:**
```json
{ "emitterId": "dust" }
```

**Example call — write config:**
```json
{
  "emitterId": "dust",
  "config": {
    "emissionRate": 60,
    "lifetime": { "min": 0.5, "max": 1.2 },
    "shape": "circle",
    "shapeRadius": 20,
    "colorGradient": [16766464, 16711680]
  }
}
```

---

### Story Graph

| Tool | Status | Parameters | Returns |
|---|---|---|---|
| `story_graph_export` | live | `sceneId: string` (required), `graphId: string` (optional, defaults to `"default"`) | The parsed Story Graph — `nodes`, `edges`, `startNodeId` — read from `{ASSET_BASE_DIR}/{sceneId}/{graphId}.storyGraph.json`, or `{ error }` if the file is missing or malformed. |

This is the Story Graph that `@emptysock/vn`'s `VNSystem` runs at play time. Node types are `"dialogue"`, `"choice"`, and the `VariableStore`-driven `"condition"` type. Choice nodes carry their option labels in a plain `options` string array and, when any option is gated, a parallel `optionWhens` array of `VariableCondition | null`. A `condition` node carries a single `condition`. Branch destinations — a choice option's target, or a condition node's true/false targets — live on the graph's `edges` (keyed by `fromPort`), never on the node itself.

**Example call:**
```json
{ "sceneId": "chapter1", "graphId": "intro" }
```

---

### Battle

| Tool | Status | Parameters | Returns |
|---|---|---|---|
| `battle_estimate_damage` | live | `effectiveAttack: number ≥ 0`, `effectiveDefense: number ≥ 0` (required); `power: number > 0` (default `1`), `critChance: number 0–1` (default `0.0625`), `critMultiplier: number > 0` (default `1.5`) | `{ normalDamage, critDamage, expectedDamage, critChance, critMultiplier }` |

This genuinely reimplements `@emptysock/battle`'s `BattleSystem` default physical damage formula (`max(1, floor((effectiveAttack - effectiveDefense / 2) * power * (isCrit ? critMultiplier : 1)))`) rather than driving a live `BattleSystem` turn machine — that machine's real job (turn order, status effects, subscriptions) is meant to run inside an actual game, and reimplementing all of that here risks drifting out of sync with the real thing. Use this one for sanity-checking combat balance numbers, not for simulating an actual fight.

**Example call:**
```json
{ "effectiveAttack": 50, "effectiveDefense": 20, "power": 1.2 }
```

---

### VisualScript

| Tool | Status | Parameters | Returns |
|---|---|---|---|
| `visualscript_validate` | live | `graph: { nodes: VSNode[], connections: VSConnection[] }` (required) | `{ valid, nodeCount, connectionCount, entryNodeIds, unreachableNodeIds, issues }` — `issues` is a list of `{ severity: "error" \| "warning", nodeId?, message }`. |

This runs a real, complete structural check against a `VisualScriptGraph` (the node graph `VisualScriptComponent` interprets): duplicate node ids, dangling `next`/connection targets, nodes unreachable from an `onUpdate`/`onEvent` entry node, and `branch` nodes missing a false branch. It does not execute the graph against a live `VariableStore` or `ActorSystem` — that's a different, much bigger job — but everything it does check, it checks for real.

**Example call:**
```json
{
  "graph": {
    "nodes": [
      { "id": "update-1", "kind": "onUpdate", "next": ["branch-1"] },
      { "id": "branch-1", "kind": "branch", "next": ["set-1"], "variableIndex": 0, "comparator": "gt", "value": 5 },
      { "id": "set-1", "kind": "setSwitch", "next": [], "switchIndex": 0, "value": true }
    ],
    "connections": [
      { "id": "c1", "from": "update-1", "to": "branch-1", "fromPort": 0 },
      { "id": "c2", "from": "branch-1", "to": "set-1", "fromPort": 0 }
    ]
  }
}
```

---

## Development

```bash
npm run lint        # TypeScript type-check (no emit)
npm test            # run Vitest suite
npm run test:watch  # watch mode
```

Tests live in `src/tests/`. They cover input validation, tool dispatch, and the security invariants that actually matter here (path traversal, unknown tool names, and confirming the stubs stay honest stubs).

---

## Adding a tool

1. Create `src/tools/<domain>.ts` — export a `toolDef` array entry and a `handler` function.
2. Register both in `src/tools/index.ts` via the `register()` call in `buildRegistry()`.
3. Add an entry to `api-reference.json` in `emptysock-engine`.
4. Add a skill file to `eleferrets/emptysock-ai-skills`.
5. Update this README's tools table. If it's a stub, say so plainly — don't let it look more finished than it is.

Shared helpers live in `src/lib/`:

- `parse(schema, raw)` — Zod parse that throws `McpError(InvalidParams)` on failure
- `SafeRelPath`, `SafeId`, `Vec2`, `Vec3`, `GameNum` — reusable Zod schemas
- `textResponse(data)` — builds the standard MCP text content response
- `wrapError(err)` — logs to stderr and re-throws as `McpError(InternalError)`

---

## Security model

| Concern | Mitigation |
|---|---|
| Malformed arguments | Zod `safeParse` on every input; `McpError(InvalidParams)` returned on failure |
| Path traversal | `SafeRelPath` schema plus a `path.resolve` containment check in every handler that touches disk |
| Shell injection | No `exec()` with template strings anywhere; subprocess calls (if any are ever added) must use `execFile` with argv arrays |
| Credential leakage | Secrets come from `process.env` only, via `src/env.ts`; stack traces go to stderr, never to the client |
| Oversized inputs | String lengths bounded on every schema field |
| Unknown tools | `McpError(MethodNotFound)` — no silent fallthrough to the wrong handler |
