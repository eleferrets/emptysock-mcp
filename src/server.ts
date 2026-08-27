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

const server = new Server(
  { name: 'emptysock-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: listTools(),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    return await dispatchTool(name, args ?? {});
  } catch (err) {
    // Log full trace to stderr — never to the client.
    console.error('[emptysock-mcp] unhandled error in tool', name, err);
    if (err instanceof McpError) throw err;
    throw new McpError(
      ErrorCode.InternalError,
      err instanceof Error ? err.message : 'Internal error',
    );
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[emptysock-mcp] server started on stdio');
