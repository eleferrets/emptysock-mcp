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

## The live bridge: real on the engine side, not connected here yet

`@emptysock/engine` now has a real, finished query bridge for exactly this purpose: `v2/bridge/QueryChannel.ts` (see that repo's `CLAUDE.md`, "QueryChannel: transport-agnostic, and errors instead of fabricated empty results"). It's a plain synchronous `handle(query)` function that never imports a transport — the same "engine defines the interface, whoever has a live instance wires the actual pipe" pattern the engine uses for `Transport` and `StorageAdapter` elsewhere. It also draws a careful three-way distinction between "queried and found nothing" (`{ ok: true, data: null }` / `{ ok: true, data: [] }`), "there's no live instance to even ask" (`ok: false, "no-live-instance"`), and "there's a scene but its physics world was never initialized" (`ok: false, "no-physics-world"`).

That means the engine-side half of "give this MCP server real physics and scene answers" is done and ready to be connected to. What's still missing, and is explicitly **not** this repo's job to build without being asked, is the actual transport: something that takes a query from a tool handler here, gets it to a `QueryChannel.handle()` running inside a live game process, and relays the answer back. Until that transport exists, `physics_*`, `scene_*`, `navmesh_*`, and `actor_*` stay honest stubs — they validate input for real and return a fixed placeholder shape, never a stack trace and never a fabricated answer dressed up as a real one. If you're the one picking up that follow-up work: read the `QueryChannel` doc comment in the engine repo first, since it defines the exact three-state result shape (empty vs. no-instance vs. no-physics-world) your relay needs to preserve rather than collapsing into one generic "empty" case.

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
