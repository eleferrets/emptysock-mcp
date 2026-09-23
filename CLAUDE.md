# emptysock-mcp — Claude Code Instructions

An MCP server that exposes EmptySock engine systems as tools for Claude Desktop, AI agents, and the Claude API. Some tools do real work against static project files today; a few are deliberate stubs waiting on a live connection to a running game (see the bridge note below). Both kinds are documented honestly in the README's tool table — keep it that way when you touch a handler.

---

## Architecture

```
src/
  server.ts          Entry point — wires transport, rate limiter, audit log
  env.ts             Single source of truth for all env vars (never read process.env directly elsewhere)
  lib/
    audit.ts         Structured JSON audit log → stderr only
    bridge.ts        Live bridge — WebSocket server + queryLiveGame() (see "The live bridge" below)
    bridgeTypes.ts   EngineQuery/EngineQueryResult wire types, mirrored from `@emptysock/engine`'s QueryChannel
    errors.ts        McpError factory helpers (wrapError, invalidParams, notFound)
    ratelimit.ts     Sliding-window rate limiter (uses env.rateLimitMax / env.rateLimitWindowMs)
    response.ts      textResponse() — standard MCP tool content wrapper
    validate.ts      Zod schemas + parse() helper; SafeRelPath, SafeId, Vec2, Vec3, GameNum
  tools/
    index.ts         Registry — maps tool name → handler; dispatchTool(); listTools()
    actor.ts         actor_send_message, actor_broadcast, actor_inbox_size, actor_list
    battle.ts        battle_estimate_damage
    gms2.ts          gms2_inspect_project, emptysock_layer_info
    navmesh.ts       navmesh_find_path, navmesh_nearest_node
    particle.ts      particle_emitter_config
    physics.ts       physics_raycast_2d, physics_overlap_circle, physics_body_state
    save.ts          save_read, save_write, save_delete, save_list (GameSaveSlot shape)
    scene.ts         scene_list_entities, scene_entity_info, scene_get_component, scene_create_entity
    vn.ts            story_graph_export
    visualscript.ts  visualscript_validate
```

---

## The live bridge: built, and why it's a bare WebSocket with no auth

`@emptysock/engine`'s query bridge (`packages/engine/src/bridge/QueryChannel.ts`, see that repo's `CLAUDE.md`) is a plain synchronous `handle(query)` function that never imports a transport — "engine defines the interface, whoever has a live instance wires the actual pipe," the same pattern as `Transport`/`StorageAdapter`. `lib/bridge.ts` is that pipe: this process hosts a `ws` `WebSocketServer` bound to `127.0.0.1:EMPTYSOCK_BRIDGE_PORT` (default `7777`), and a live game/IDE preview dials in as the client. No auth token — a deliberate localhost-only trust model, the same one this server already extends to local file I/O; don't add one without the project owner asking.

Wire envelope (JSON text frames): server→client is `{ id, query: EngineQuery }`, client→server is `{ id, result: EngineQueryResult<T> }`, with `id` round-tripped to match responses to in-flight requests (`lib/bridge.ts`'s `pending` map). `EngineQuery`/`EngineQueryResult` are hand-mirrored in `lib/bridgeTypes.ts` rather than imported from a real `@emptysock/engine` dependency — that package is `private: true` with native/WASM deps (Rapier, pixi.js) and isn't published anywhere this server can install from. If it ever is, replace `bridgeTypes.ts` with a real `import type` and delete the mirror; until then, any change to `QueryChannel`'s query/result shapes has to be mirrored here by hand.

`QueryChannel` draws a careful three-way distinction — "queried and found nothing" (`{ ok: true, data: null }` / `{ ok: true, data: [] }`), "no live instance to even ask" (`no-live-instance`), "scene attached but no physics world" (`no-physics-world`) — and `physics_*`/`scene_*` preserve it exactly rather than collapsing any of the three into "empty." A query the connected client never answers within 5 seconds (`QUERY_TIMEOUT_MS` in `lib/bridge.ts`) also resolves `no-live-instance`, never a fabricated empty result — a stalled reply and "nothing to ask" both mean the caller can't trust an answer, so they get the same honest error.

`QueryChannel` itself has no navmesh or `ActorSystem` query kind — only `listEntities`/`entityInfo`/`getComponent`/`setComponent` plus the three physics kinds. `navmesh_*`/`actor_*` therefore still can't relay real data even with a live game connected; they report `no-live-instance` or `not-found` (naming the missing query kind) rather than fabricating a path or an "enqueued: true". Adding those query kinds is engine-side work (`QueryChannel.ts`), not something to fake around here.

`scene_create_entity` has the same shape of gap: `QueryChannel` is deliberately read/patch only (no entity-creation query kind), so it always returns `ok: false`/`not-found` — don't wire it to `setComponent` or any other existing kind as a workaround, since neither actually creates a live entity.

---

## Absolute rules

### Environment variables
- **Always** read env vars through `src/env.ts`. Never call `process.env['VAR']` directly from a tool or lib file — `env.ts` is the one place that's allowed to know the variable names.
- Adding a new env var: add it to the `env` object in `env.ts` *and* document it in `.env.example`. One without the other is a bug waiting to be filed.

### Path safety
- Any filesystem path a caller supplies **must** go through `SafeRelPath` (the Zod schema in `validate.ts`) before it touches anything else.
- After resolving with `path.resolve(env.saveBaseDir, userPath)` (or the equivalent base for asset paths), assert containment: the resolved path has to start with `path.resolve(env.saveBaseDir)`. Trust the schema, then check again anyway.
- Never call `path.resolve(userPath)` on its own — that's exactly the shape of bug that lets an absolute path walk right out of the sandbox.

### Adding a new tool
1. Create or extend the appropriate file under `src/tools/`.
2. Export `<domain>ToolDefs` (the MCP schema array) and `<domain>Handler` (the async dispatch function).
3. Register both in `src/tools/index.ts` via `register(...)`.
4. Add Zod schemas in the tool file itself (only promote a shape to `validate.ts` once it's actually reused across tools).
5. Add a test in `src/tests/tools.test.ts`.
6. Document the tool in `README.md` under **Available tools** — including its real status (working / stub / docs). A stub that reads like a finished feature in the README is worse than no README entry at all.

### Error handling
- Use `invalidParams(message)` for bad input — it throws `McpError(InvalidParams)`.
- Use `wrapError(err)` in catch blocks — it re-throws an existing `McpError` as-is and wraps anything else.
- Never `throw new Error(...)` from a handler. Always go through the helpers in `lib/errors.ts`.
- Handlers doing I/O should `try/catch` and return `textResponse({ error: ... })` for the recoverable stuff (file not found, bad JSON) rather than throwing. Save that for genuinely exceptional failures.

### Security
- All file I/O is restricted to `env.saveBaseDir` (or `env.assetBaseDir` for the asset-reading tools). `gms2_inspect_project` inherits the same restriction.
- The rate limiter (`defaultLimiter`) sits in front of every tool call by name, before dispatch, in `server.ts`.
- Audit entries go to **stderr only**. stdout is the live MCP wire protocol — anything else written there corrupts every message that follows it.

### TypeScript
- Zero `any`. Use `unknown` plus Zod, or an explicit type guard.
- Zero `!` non-null assertions.
- Every exported function needs an explicit return type.

---

## Running tests

```bash
npm test        # vitest run
npm run lint    # tsc --noEmit
```

---

## Commits

Conventional Commits: `feat(tools): ...`, `fix(save): ...`, `chore(deps): ...`, `docs(...)` for documentation-only passes like this one.
