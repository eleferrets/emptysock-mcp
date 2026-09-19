import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

/** Wrap any caught value into an McpError, logging the full trace to stderr. */
export function wrapError(err: unknown): never {
  console.error('[emptysock-mcp] tool error:', err);
  if (err instanceof McpError) throw err;
  const message = err instanceof Error ? err.message : 'Internal error';
  throw new McpError(ErrorCode.InternalError, message);
}

export function invalidParams(message: string): never {
  throw new McpError(ErrorCode.InvalidParams, message);
}

export function notFound(name: string): never {
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
}
