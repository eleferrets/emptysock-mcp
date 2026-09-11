/**
 * Read and validate required environment variables at startup.
 * Throws with a descriptive message so the process refuses to start
 * rather than failing silently during a tool call.
 */
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
  rateLimitMax: Number(process.env['RATE_LIMIT_MAX'] ?? 60),

  /** Rate-limit sliding window in milliseconds. Default 60 000 (1 minute). */
  rateLimitWindowMs: Number(process.env['RATE_LIMIT_WINDOW_MS'] ?? 60_000),
} as const;
