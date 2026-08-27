# emptysock-mcp

Model Context Protocol server for the EmptySock game engine. Exposes engine systems (NavMesh, Physics, Scene, Save, Actor) as MCP tools consumable by AI agents and Claude Desktop.

## Quick start

```bash
npm install
npm run build
npm run dev        # stdio transport (Claude Desktop / local)
```

## Security model

- All tool arguments validated with Zod before handler execution — no raw `unknown` reaches business logic
- String lengths bounded; path traversal rejected at the schema layer
- Secrets read from environment variables only — never hardcoded
- Internal error stacks logged to stderr, safe strings returned to clients
- No shell injection: child processes spawned with explicit `execFile` argv arrays

## Environment variables

Copy `.env.example` → `.env` and fill in values. The server refuses to start if required variables are absent.

## Adding a tool

1. Create `src/tools/<domain>.ts` — export a `toolDef` and `handler`
2. Register both in `src/tools/index.ts`
3. Add an entry to `api-reference.json` in `emptysock-engine`
4. Add a skill to `eleferrets/emptysock-ai-skills`
