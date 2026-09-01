# emptysock-mcp — Claude Code Instructions

MCP server that exposes EmptySock engine systems as tools consumable by Claude Desktop, AI agents, and the Claude API.

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
    actor.ts         actor_send_message, actor_broadcast, actor_inbox_size
    gms2.ts          gms2_inspect_project, emptysock_layer_info
    navmesh.ts       navmesh_find_path, navmesh_nearest_node
    physics.ts       physics_raycast_2d, physics_raycast_3d, physics_overlap_circle, physics_body_state
    save.ts          save_read, save_write, save_delete, save_list
    scene.ts         scene_list_entities, scene_entity_info, scene_get_component
```

---

## Absolute rules

### Environment variables
- **Always** read env vars from `src/env.ts`. Never call `process.env['VAR']` directly inside a tool or lib file.
- Adding a new env var: add it to the `env` object in `env.ts` AND document it in `.env.example`.

### Path safety
- User-supplied filesystem paths **must** be validated with `SafeRelPath` (Zod schema in `validate.ts`).
- After resolving with `path.resolve(env.saveBaseDir, userPath)`, assert containment: the resolved path must start with `path.resolve(env.saveBaseDir)`.
- Never use `path.resolve(userPath)` alone — that allows absolute paths to escape the base directory.

### Adding a new tool
1. Create or extend the appropriate file under `src/tools/`.
2. Export `<domain>ToolDefs` (the MCP schema array) and `<domain>Handler` (the async dispatch function).
3. Register both in `src/tools/index.ts` via `register(...)`.
4. Add Zod schemas in the tool file (not in `validate.ts` unless the shape is reused across tools).
5. Add a test in `src/tests/tools.test.ts`.
6. Document the tool in `README.md` under **Available tools**.

### Error handling
- Use `invalidParams(message)` for bad input (throws `McpError(InvalidParams)`).
- Use `wrapError(err)` in catch blocks (re-throws McpError, wraps anything else).
- Never `throw new Error(...)` from a handler — always use the helpers in `lib/errors.ts`.
- Handlers that do I/O should `try/catch` and return `textResponse({ error: ... })` for user-recoverable failures (file not found, bad JSON) rather than throwing.

### Security
- All file I/O is restricted to `env.saveBaseDir`. The `gms2_inspect_project` tool inherits the same restriction.
- The rate limiter (`defaultLimiter`) is applied per tool name in `server.ts` before dispatch.
- Audit entries go to **stderr only** — stdout is the MCP wire protocol; mixing them corrupts the stream.

### TypeScript
- Zero `any`. Use `unknown` + Zod or explicit type guards.
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

Conventional Commits: `feat(tools): ...`, `fix(save): ...`, `chore(deps): ...`
