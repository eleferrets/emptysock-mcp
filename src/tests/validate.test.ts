import { describe, it, expect } from 'vitest';
import { parse, SafeRelPath, SafeId, Vec2 } from '../lib/validate.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

describe('parse helper', () => {
  it('returns parsed data on success', () => {
    const result = parse(z.object({ x: z.number() }), { x: 42 });
    expect(result.x).toBe(42);
  });

  it('throws McpError(InvalidParams) on failure', () => {
    expect(() => parse(z.object({ x: z.number() }), { x: 'bad' })).toThrow(McpError);
  });
});

describe('SafeRelPath', () => {
  it('accepts safe relative paths', () => {
    expect(SafeRelPath.parse('saves/slot1')).toBe('saves/slot1');
  });

  it('rejects path traversal', () => {
    expect(() => SafeRelPath.parse('../etc/passwd')).toThrow();
  });

  it('rejects absolute paths', () => {
    expect(() => SafeRelPath.parse('/etc/passwd')).toThrow();
  });
});

describe('SafeId', () => {
  it('accepts valid identifiers', () => {
    expect(SafeId.parse('my-map_01')).toBe('my-map_01');
  });

  it('rejects shell metacharacters', () => {
    expect(() => SafeId.parse('map; rm -rf /')).toThrow();
  });

  it('rejects empty strings', () => {
    expect(() => SafeId.parse('')).toThrow();
  });
});

describe('Vec2', () => {
  it('accepts finite numbers', () => {
    const v = Vec2.parse({ x: 1.5, y: -3 });
    expect(v.x).toBe(1.5);
  });

  it('rejects Infinity', () => {
    expect(() => Vec2.parse({ x: Infinity, y: 0 })).toThrow();
  });
});
