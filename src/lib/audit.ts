/**
 * Structured audit log written to stderr only.
 * stderr is never forwarded to the MCP client — the MCP protocol only reads stdout.
 * Each entry is one line of JSON so it can be ingested by any log aggregator.
 */

export type AuditEvent =
  | { kind: 'tool_call';   tool: string; status: 'ok' | 'error'; durationMs: number; error?: string }
  | { kind: 'server_start' }
  | { kind: 'server_stop';  reason: string };

export function audit(event: AuditEvent): void {
  const entry = { ts: new Date().toISOString(), ...event };
  process.stderr.write(JSON.stringify(entry) + '\n');
}
