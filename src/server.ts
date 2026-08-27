#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { listTools, dispatchTool } from './tools/index.js';
import { audit } from './lib/audit.js';
import { defaultLimiter } from './lib/ratelimit.js';

const server = new Server(
  { name: 'emptysock-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: listTools(),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  // Rate limit per tool name.
  if (!defaultLimiter.allow(name)) {
    throw new McpError(ErrorCode.InvalidRequest, `Rate limit exceeded for tool: ${name}`);
  }

  const start = Date.now();
  try {
    const result = await dispatchTool(name, args ?? {});
    audit({ kind: 'tool_call', tool: name, status: 'ok', durationMs: Date.now() - start });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    audit({ kind: 'tool_call', tool: name, status: 'error', durationMs: Date.now() - start, error: message });
    if (err instanceof McpError) throw err;
    throw new McpError(ErrorCode.InternalError, message);
  }
});

// Graceful shutdown — give the transport a chance to flush before exit.
async function shutdown(reason: string): Promise<void> {
  audit({ kind: 'server_stop', reason });
  try {
    await server.close();
  } catch {
    // Ignore errors during shutdown.
  }
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT',  () => void shutdown('SIGINT'));

// Catch unhandled rejections so they are logged and the process exits cleanly.
process.on('unhandledRejection', (reason) => {
  console.error('[emptysock-mcp] unhandledRejection:', reason);
  void shutdown('unhandledRejection');
});

const transport = new StdioServerTransport();
await server.connect(transport);
audit({ kind: 'server_start' });
