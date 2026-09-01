/**
 * Read and validate required environment variables at startup.
 * Throws with a descriptive message so the process refuses to start
 * rather than failing silently during a tool call.
 */
export const env = {
  /** Optional bearer token for authenticated engine API calls. */
  apiToken: process.env['EMPTYSOCK_API_TOKEN'] ?? '',

  /** Optional bearer token required on SSE requests. Empty = no auth. */
  mcpAuthToken: process.env['MCP_AUTH_TOKEN'] ?? '',

  /**
   * Absolute path the save-system tools may read/write.
   * Defaults to cwd; always normalised to a string so handlers can rely on it.
   */
  saveBaseDir: process.env['SAVE_BASE_DIR'] ?? process.cwd(),

  /** Maximum tool calls allowed per key per rate-limit window. Default 60. */
  rateLimitMax: Number(process.env['RATE_LIMIT_MAX'] ?? 60),

  /** Rate-limit sliding window in milliseconds. Default 60 000 (1 minute). */
  rateLimitWindowMs: Number(process.env['RATE_LIMIT_WINDOW_MS'] ?? 60_000),
} as const;
