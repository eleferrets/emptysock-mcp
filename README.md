# emptysock-mcp

> **Deprecated and archived.** EmptySock development has stopped. This server is kept as a working reference for how to expose a game engine to AI agents over MCP; it is no longer maintained, and issues and pull requests are not being reviewed.


A Model Context Protocol server for the [EmptySock](https://github.com/eleferrets/emptysock-engine) game engine. It hands Claude Desktop, AI agents, and the Claude API a set of tools for poking at an EmptySock project: reading save files, validating Story Graphs and VisualScript graphs, estimating battle damage, and querying a live running game's physics, scene, actor and navmesh state over a local WebSocket bridge.

The server exposes **22 tools**: 20 are live (they do real work on files on disk, or relay to a connected live game), 1 is a documentation tool (`emptysock_layer_info`), and 1 is a stub (`particle_emitter_config`). The table below tells you which is which — no tool here pretends to be more finished than it is.

---

## Requirements

- Node.js 20+
- npm 9+

---

## Installation

```bash
git clone https://github.com/eleferrets/emptysock-mcp.git
cd emptysock-mcp
npm ci          # or `npm install`
npm run build   # compiles to dist/ (dist/server.js is the entry point)
```

Optional checks: `npm run lint` (type-check), `npm test` (Vitest, 80 tests).

---

## Configuration

Every variable is optional and read from the process environment (`src/env.ts`). The server does **not** load a `.env` file by itself, so copying `.env.example` to `.env` has no effect unless you pass it in. Either export the variables, set them in your MCP host's `env` block (see Claude Desktop below), or let Node load the file:

```bash
cp .env.example .env     # then edit the paths
node --env-file=.env dist/server.js        # Node 20.6+
npx tsx --env-file=.env src/server.ts      # development, no build step
```

| Variable | Required | What it does |
|---|---|---|
| `SAVE_BASE_DIR` | No | The one directory the save tools are allowed to touch. Everything `save_read`/`save_write`/`save_delete`/`save_list` does is sandboxed to this path. Defaults to the process's working directory, which is fine for poking around locally and not what you want in production. |
| `ASSET_BASE_DIR` | No | The directory project asset files live under. `story_graph_export` resolves their paths from here. Same story: defaults to cwd, set it explicitly once this is running somewhere real. |
| `RATE_LIMIT_MAX` | No | How many calls a single tool can take in one rate-limit window before it starts saying no. Default `60`. This exists mostly so an agent stuck in a retry loop doesn't hammer the process forever. |
| `RATE_LIMIT_WINDOW_MS` | No | The length of that window, in milliseconds. Default `60000` (one minute). |
| `EMPTYSOCK_BRIDGE_PORT` | No | Port the live-bridge WebSocket server binds to on `127.0.0.1`. A live game or the IDE preview dials in as the client so physics_*/scene_*/navmesh_*/actor_* tools can relay real queries to it. Default `7777`. |

> **Never commit `.env`.** It's gitignored for a reason — keep secrets in your CI/CD secret manager instead.

---

## Running the server

### stdio (recommended for local use and Claude Desktop)

```bash
npm run dev          # development — tsx, no build step
# or after building:
node dist/server.js
```

The MCP protocol itself runs over stdin/stdout, so there is no MCP network port and no MCP auth layer. The one network listener is the optional live bridge: a WebSocket server bound to `127.0.0.1:EMPTYSOCK_BRIDGE_PORT` (default `7777`) that a live game dials into (see below). If that port is already taken (for example by a second copy of this server), the bind error is written to the audit log on stderr and the server keeps running; the bridge-backed tools then report `no-live-instance`.

To check that the server starts and lists its tools, send it an MCP handshake on stdin, for example `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}` followed by `{"jsonrpc":"2.0","method":"notifications/initialized"}` and `{"jsonrpc":"2.0","id":2,"method":"tools/list"}` (one JSON message per line). `tools/list` returns the 22 tools described below.

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

This server hosts a plain WebSocket bridge on `127.0.0.1:EMPTYSOCK_BRIDGE_PORT` (default `7777`, see `lib/bridge.ts`) that a live game or the IDE preview dials into as the client. Once connected, tool calls relay real `EngineQuery`/`EngineQueryResult` envelopes to `@emptysock/engine`'s `QueryChannel` (`packages/engine/src/bridge/QueryChannel.ts`) running inside that live process and return its real answer — not a guess. No auth token: this is a localhost-only trust model, matching how this server already treats local file I/O. Only one live game is expected connected at a time; a newer connection replaces an older one rather than being queued.

What that means in practice, split by domain:

- **Physics, Scene, NavMesh, and Actor tools** (`physics_*`, `scene_*`, `navmesh_*`, `actor_*`) are all live: they relay real queries to the connected live game's `QueryChannel` and return its real answer. With no live game connected, they return `{ ok: false, error: { code: "no-live-instance", ... } }`. Beyond that, each domain has its own honest "attached but not that system" error: physics queries against a scene with no initialized `PhysicsSystem` get `"no-physics-world"`; `actor_*` against a scene with no `ActorSystem` attached gets `"no-actor-system"`; `navmesh_*` against a scene with no navmesh attached gets `"no-navmesh"`. None of these ever collapse into a fabricated empty result — a `navmesh_find_path` call that finds no route reports `path: null`, not an error, and is distinguishable from every one of the three "nothing to even ask" cases above.
- **Save, Story Graph export, and VisualScript validation** are all real, working tools that operate on static project files on disk (save JSON, `.storyGraph.json` files, a `VisualScriptGraph` payload you hand it directly). No live game required, because none of these ever needed one.
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

Status key: **live** — does real work (either standalone, or by relaying to a connected live game over the bridge). **stub** — validates input correctly but has no live-bridge query kind to call yet, so it always returns an honest `ok: false` error. **docs** — returns static reference information by design, not a stub.

### NavMesh

| Tool | Status | Parameters | Returns |
|---|---|---|---|
| `navmesh_find_path` | live | `from: Vec2` (required), `to: Vec2` (required), `mapId: string` (required; echoed back, not sent to the bridge — the live game has exactly one attached navmesh) | `{ mapId, from, to, path }` — the real waypoint array from `@emptysock/tilemap`'s `NavMeshSystem` (`path: null` if genuinely no route exists); `{ ..., error }` (`no-live-instance` or `no-navmesh`) when there's nothing real to ask. |
| `navmesh_nearest_node` | live | `mapId: string` (required), `point: Vec2` (required) | `{ mapId, point, node }` — the nearest walkable point (`node: null` if none found); `{ ..., error }` on `no-live-instance`/`no-navmesh`. |

Relays to `QueryChannel`'s `navmeshFindPath`/`navmeshNearestNode` query kinds, which reach an optional `NavMeshQuerySource` (`@emptysock/tilemap`'s `NavMeshSystem`, wired in only if the live game's scene actually attached one) — a scene with no navmesh loaded is normal, not an error, and reports `"no-navmesh"` rather than `"not-found"`.

**Example call — find path:**
```json
{ "from": { "x": 0, "y": 0 }, "to": { "x": 100, "y": 50 }, "mapId": "level1" }
```

---

### Physics

| Tool | Status | Parameters | Returns |
|---|---|---|---|
| `physics_raycast_2d` | live | `origin: Vec2`, `direction: Vec2`, `maxDistance: number > 0` (all required); `layerMask: number` (optional) | `{ hit, args }` on success (`hit` is the real raycast result, or `null` for a genuine clear line of sight); `{ error, args }` when no live game is connected. |
| `physics_overlap_circle` | live | `center: Vec2`, `radius: number > 0, ≤ 100000` (required); `layerMask: number` (optional) | `{ entities, args }` — the real overlapping entity ids (possibly empty); `{ error, args }` when no live game is connected. |
| `physics_body_state` | live | `entityId: string` (numeric string, required) | `{ entityId, position, rotation, velocity, type, isSensor }` from the live `PhysicsBody`; `{ entityId, error }` when no live game is connected, the scene has no `PhysicsSystem`, or `entityId` isn't a live numeric id. |

There's no `physics_raycast_3d` tool in this registry. 3D raycasting isn't offered at all right now, not even as a stub — implementing it needs a Rapier3D WASM build available server-side, which this server doesn't have (the engine's 3D physics runs in the browser's WASM context, not in Node). Don't call it expecting an error message with useful detail; you'll just get an unknown-tool error like any other made-up tool name.

**Example call — overlap circle:**
```json
{ "center": { "x": 50, "y": 50 }, "radius": 20, "layerMask": 3 }
```

---

### Scene

| Tool | Status | Parameters | Returns |
|---|---|---|---|
| `scene_list_entities` | live | `sceneId: string` (required) | `{ sceneId, entities }` — every live entity's `EntitySummary` (components, and `Meta`/`Transform` fields when present); `{ sceneId, error }` when no live game is connected. |
| `scene_entity_info` | live | `sceneId: string`, `entityId: string` (numeric string, both required) | `{ sceneId, entityId, components, name?, tags?, active?, x?, y?, rotation? }`; `{ sceneId, entityId, error }` when not found, no live game, or `entityId` isn't numeric. |
| `scene_get_component` | live | `sceneId: string`, `entityId: string` (numeric string, e.g. `"1"`, from `scene_list_entities`), `componentType: string` (PascalCase component name such as `Transform`, all required) | `{ sceneId, entityId, componentType, data }` — the component's real live field values; `{ ..., error }` on failure. |
| `scene_create_entity` | live | `sceneId: string` (required; echoed back, not sent to the bridge — the live game has one current scene); `tag: string`, `components: string[]` (optional) | `{ sceneId, entityId, tag, components, skipped }` — the real spawned entity id, the components actually added, and any requested component names that weren't a registered `ComponentDef` (`skipped`, never a hard failure); `{ sceneId, tag, components, error }` when no live game is connected. |

**Example call — get component:**
```json
{ "sceneId": "gameplay", "entityId": "1", "componentType": "Transform" }
```

---

### Save

All save tools are sandboxed to `SAVE_BASE_DIR`. Path traversal (`..`, absolute paths) is rejected both at the schema layer and again when the path is resolved.

Each slot is one `{slot}.json` file holding this server's own envelope: `{ id, scene, data, timestamp, playtime }`. This is **not** the format the engine's current `SaveSystem` writes (that one is component-based and asynchronous: a `StorageAdapter`-backed blob with a `formatVersion`, per-component versions and entity data, bound to a live `Scene`). Treat these tools as sandboxed JSON file storage with a fixed envelope; a game that wants them to read its saves has to write the same envelope itself.

| Tool | Status | Parameters | Returns |
|---|---|---|---|
| `save_read` | live | `slot: string` (alphanumeric + `-`/`_`, required) | The slot envelope read from disk, or `{ error }` if the slot is missing or doesn't match the shape. |
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
| `actor_send_message` | live | `actorId: string`, `message: { type: string, payload?: unknown }` (both required) | `{ actorId, queued: true }` on success; `{ actorId, message, error }` — `no-live-instance`, `no-actor-system`, or `not-found` for an unknown `actorId`. |
| `actor_broadcast` | live | `message: { type: string, payload?: unknown }` (required) | `{ delivered }` — the real count of actors the message was enqueued for; `{ message, error }` on `no-live-instance`/`no-actor-system`. |
| `actor_inbox_size` | live | `actorId: string` (required) | `{ actorId, inboxSize }` — the actor's real currently-queued (not yet flushed) message count; `{ actorId, error }` on `no-live-instance`, `no-actor-system`, or `not-found`. |
| `actor_list` | live | none | `{ actors }` — every registered actor id, in registration order; `{ error }` on `no-live-instance`/`no-actor-system`. |

Relays to `QueryChannel`'s `actorSendMessage`/`actorBroadcast`/`actorInboxSize`/`actorList` query kinds, which reach the live game's real `ActorSystem` directly. A scene can legitimately be live with zero actors running, so a missing `ActorSystem` is its own error, `"no-actor-system"`, never `"no-live-instance"`. The same ordering guarantee `ActorSystem` uses everywhere else applies: it drains every actor's inbox before calling `update()` on any actor, so a message sent during frame N is fully processed before frame N's `update()` logic runs.

**Example call — send message:**
```json
{ "actorId": "enemy-spawner", "message": { "type": "SPAWN_WAVE", "payload": { "wave": 3 } } }
```

---

### Layers

| Tool | Status | Parameters | Returns |
|---|---|---|---|
| `emptysock_layer_info` | docs | none | A reference document for the `LayerSystem` API from `@emptysock/engine` (`defineLayer`, `addEntity`, `removeEntity`, `setDepth`, `setVisible`, `setOffset`, `getLayersSorted`, and how `RenderPipeline` shares a `LayerSystem`) with an example that uses real exports. Not project-specific; same response every time. |

---

### Particles

| Tool | Status | Parameters | Returns |
|---|---|---|---|
| `particle_emitter_config` | stub | `emitterId: string` (required); `config: ParticleEmitterOptions` (optional — omit to read, provide to write) | Reading returns a fixed default config merged with nothing real; writing returns `{ emitterId, updated: true, config }` where `config` is your input merged over those same defaults. Nothing is persisted and no live `ParticleEmitter` is actually touched. |

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

This runs a real, complete structural check against a `VisualScriptGraph` (the node graph `@emptysock/engine`'s `VisualScriptSystem` compiles and runs): duplicate node ids, dangling `next`/connection targets, nodes unreachable from an `onUpdate`/`onEvent` entry node, and `branch` nodes missing a false branch. It does not execute the graph against a live `VariableStore` or `ActorSystem` — that's a different, much bigger job — but everything it does check, it checks for real.

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
npm run build       # tsc -> dist/
```

Tests live in `src/tests/`. They cover input validation, tool dispatch, and the security invariants that actually matter here (path traversal, unknown tool names, and confirming the stubs stay honest stubs).

---

## Adding a tool

1. Create `src/tools/<domain>.ts` — export a `toolDef` array entry and a `handler` function.
2. Register both in `src/tools/index.ts` via the `register()` call in `buildRegistry()`.
3. (Optional, both companion repos are archived) Mirror the tool in the `emptysock-ai-skills` pack.
4. Update this README's tools table and the tool count in the intro. If it's a stub, say so plainly — don't let it look more finished than it is.

Shared helpers live in `src/lib/`:

- `parse(schema, raw)` — Zod parse that throws `McpError(InvalidParams)` on failure
- `SafeRelPath`, `SafeId`, `Vec2`, `Vec3`, `GameNum` — reusable Zod schemas
- `textResponse(data)` — builds the standard MCP text content response
- `wrapError(err)` — logs to stderr and re-throws as `McpError(InternalError)`
- `queryLiveGame(query)` (`lib/bridge.ts`) — relays an `EngineQuery` to the connected live game

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
