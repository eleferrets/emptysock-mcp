/**
 * Read and validate required environment variables at startup.
 * Throws with a descriptive message so the process refuses to start
 * rather than failing silently during a tool call.
 */

function positiveInt(raw: string | undefined, fallback: number): number {
  const v = Number(raw ?? fallback);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const env = {
  /**
   * Absolute path the save-system tools may read/write.
   * Defaults to cwd; always normalised to a string so handlers can rely on it.
   */
  saveBaseDir: process.env['SAVE_BASE_DIR'] ?? process.cwd(),

  /**
   * Absolute path where project asset files (story graphs, etc.) live.
   * Defaults to cwd. Override in production to the directory that holds
   * the game project's assets folder.
   */
  assetBaseDir: process.env['ASSET_BASE_DIR'] ?? process.cwd(),

  /** Maximum tool calls allowed per key per rate-limit window. Default 60. */
  rateLimitMax: positiveInt(process.env['RATE_LIMIT_MAX'], 60),

  /** Rate-limit sliding window in milliseconds. Default 60 000 (1 minute). */
  rateLimitWindowMs: positiveInt(process.env['RATE_LIMIT_WINDOW_MS'], 60_000),

  /**
   * Port the live-bridge WebSocket server listens on (127.0.0.1 only — see
   * `lib/bridge.ts`). A live game/IDE preview dials in as the client, and
   * this server relays `physics_*`/`scene_*`/`navmesh_*`/`actor_*` tool
   * calls through it as `EngineQuery`/`EngineQueryResult` envelopes over a
   * WebSocket, matching the wire protocol `apps/ide`'s preview host
   * implements against `QueryChannel` on the engine side. Default 7777.
   */
  bridgePort: positiveInt(process.env['EMPTYSOCK_BRIDGE_PORT'], 7777),
} as const;
