import { describe, it, expect, vi } from 'vitest';
import { audit } from '../lib/audit.js';

describe('audit', () => {
  it('writes a JSON line to stderr', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    audit({ kind: 'tool_call', tool: 'navmesh_find_path', status: 'ok', durationMs: 5 });
    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line) as { kind: string; tool: string; status: string };
    expect(parsed.kind).toBe('tool_call');
    expect(parsed.tool).toBe('navmesh_find_path');
    expect(parsed.status).toBe('ok');
    spy.mockRestore();
  });

  it('never writes to stdout', () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    audit({ kind: 'server_start' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
