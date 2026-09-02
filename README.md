# emptysock-mcp

Model Context Protocol server for the [EmptySock](https://github.com/eleferrets/emptysock-engine) game engine. Exposes engine systems — NavMesh, Physics, Scene, Save, Actor, Particles, and Story Graph — as MCP tools consumable by Claude Desktop, AI agents, and the Claude API.

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

Copy the example env file and fill in any values you need:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `EMPTYSOCK_API_TOKEN` | No | Bearer token for authenticated engine API calls |
| `MCP_AUTH_TOKEN` | No | Required bearer token on SSE transport requests. Leave blank to disable auth. |
| `SAVE_BASE_DIR` | No | Absolute path the save tools may read/write. Defaults to the process working directory. Set explicitly in production. |

> **Never commit `.env`** — it is gitignored. Store secrets in your CI/CD secret manager, not in the repository.

---

## Running the server

### stdio (recommended for local use and Claude Desktop)

```bash
npm run dev          # development — tsx, no build step
# or after building:
node dist/server.js
```

The server communicates over stdin/stdout. There is no network port and no authentication surface.

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

Restart Claude Desktop. The EmptySock tools will appear in the tool picker.

---

## Available tools

### NavMesh

| Tool | Description |
|---|---|
| `navmesh_find_path` | A* path between two 2D world points on a loaded navmesh. Returns ordered waypoints or `[]` if no path exists. |
| `navmesh_nearest_node` | Nearest walkable navmesh node to a given world point. |

**Example — find path:**
```json
{
  "from": { "x": 0, "y": 0 },
  "to":   { "x": 100, "y": 50 },
  "mapId": "level1"
}
```

---

### Physics

| Tool | Description |
|---|---|
| `physics_raycast_2d` | Cast a ray in 2D physics space; returns first hit entity, hit point, and normal. |
| `physics_raycast_3d` | Cast a ray in 3D physics space (Rapier3D); returns first hit. |
| `physics_overlap_circle` | All entity IDs whose 2D colliders overlap a circle. |
| `physics_body_state` | Current position, velocity, and angular velocity of a physics body by entity ID. |

**Example — overlap circle:**
```json
{
  "center": { "x": 50, "y": 50 },
  "radius": 20,
  "layerMask": 3
}
```

---

### Scene

| Tool | Description |
|---|---|
| `scene_list_entities` | All entity IDs active in a scene. |
| `scene_entity_info` | Tag, active state, and component list for a specific entity. |
| `scene_get_component` | Serialised state of a specific component on an entity. |
| `scene_create_entity` | Add a new entity to a scene. Returns the new entity's ID. |

**Example — get component:**
```json
{
  "sceneId": "gameplay",
  "entityId": "player-001",
  "componentType": "Transform"
}
```

---

### Save

All save tools are sandboxed to `SAVE_BASE_DIR`. Path traversal (`..`, absolute paths) is rejected at the schema layer and again at resolution time.

| Tool | Description |
|---|---|
| `save_read` | Read a save slot from disk and return its JSON data. |
| `save_write` | Write a JSON object to a named save slot. |
| `save_delete` | Delete a save slot. |
| `save_list` | List all available save slots. |

**Example — write:**
```json
{
  "slot": "autosave",
  "data": { "level": 3, "score": 4200, "checkpoint": "bridge" }
}
```

Slot names are alphanumeric + dashes/underscores only (e.g. `slot1`, `autosave`, `new-game-plus`).

---

### Actor

| Tool | Description |
|---|---|
| `actor_send_message` | Enqueue a message in a specific actor's inbox. Processed on the next ActorSystem flush. |
| `actor_broadcast` | Broadcast a message to all registered actors. |
| `actor_inbox_size` | Number of pending messages in an actor's inbox. |

**Example — send message:**
```json
{
  "actorId": "enemy-spawner",
  "message": { "type": "SPAWN_WAVE", "payload": { "wave": 3 } }
}
```

> **Ordering note:** ActorSystem drains every actor's inbox before calling `update()`. Messages sent during frame N are fully processed before frame N's update logic runs.

---

### GMS2

| Tool | Description |
|---|---|
| `gms2_inspect_project` | Read a GameMaker Studio 2 `.yyp` project file and return a JSON summary: project name, asset counts, and lists of object and script names. Read-only. |
| `emptysock_layer_info` | Reference information about the EmptySock LayerSystem API — available methods and usage examples. |

---

### Particles

| Tool | Description |
|---|---|
| `particle_emitter_config` | Get or set a ParticleSystem emitter configuration by emitter ID. Omit `config` to read; provide `config` to write. |

**Example — read config:**
```json
{ "emitterId": "dust" }
```

**Example — write config:**
```json
{
  "emitterId": "dust",
  "config": { "maxParticles": 200, "emitRate": 60, "colorStart": "#ffcc00" }
}
```

---

### Story Graph

| Tool | Description |
|---|---|
| `story_graph_export` | Export the Story Graph (VNSystem) for a named scene as a JSON object containing nodes and edges. |

**Example:**
```json
{ "sceneId": "chapter1", "graphId": "intro" }
```

---

## Development

```bash
npm run lint        # TypeScript type-check (no emit)
npm test            # run Vitest suite
npm run test:watch  # watch mode
```

Tests live in `src/tests/`. They cover input validation, tool dispatch, and security invariants (path traversal, shell metacharacter injection, unknown tool names).

---

## Adding a tool

1. Create `src/tools/<domain>.ts` — export a `toolDef` array entry and a `handler` function.
2. Register both in `src/tools/index.ts` via the `register()` call in `buildRegistry()`.
3. Add an entry to `api-reference.json` in `emptysock-engine`.
4. Add a skill file to `eleferrets/emptysock-ai-skills`.

Use the shared helpers in `src/lib/`:

- `parse(schema, raw)` — Zod parse that throws `McpError(InvalidParams)` on failure
- `SafeRelPath`, `SafeId`, `Vec2`, `Vec3`, `GameNum` — reusable Zod schemas
- `textResponse(data)` — builds the standard MCP text content response
- `wrapError(err)` — logs to stderr and re-throws as `McpError(InternalError)`

---

## Security model

| Concern | Mitigation |
|---|---|
| Malformed arguments | Zod `safeParse` on every input; `McpError(InvalidParams)` returned on failure |
| Path traversal | `SafeRelPath` schema + `path.resolve` containment check in save handler |
| Shell injection | No `exec()` with template strings; `execFile` with argv arrays when subprocesses are needed |
| Credential leakage | Secrets from `process.env` only; stacks logged to `stderr`, never to client |
| Oversized inputs | String lengths bounded on every schema field |
| Unknown tools | `McpError(MethodNotFound)` — no fallthrough to unintended handlers |
