import { describe, it, expect } from 'vitest';
import { ALLOWED, coerceTheme } from './compat.js';

describe('theme compat', () => {
  it('leaves legal combos alone', () => {
    const r = coerceTheme('ops', 'ops-cyberpunk');
    expect(r).toEqual({ theme: 'ops-cyberpunk', coerced: false });
  });

  it('coerces illegal combos to first allowed', () => {
    const r = coerceTheme('ops', 'editorial');
    expect(r.coerced).toBe(true);
    expect(r.theme).toBe('ops-cyberpunk');
    expect(r.from).toBe('editorial');
  });

  it('every mode has at least one allowed theme', () => {
    for (const k of Object.keys(ALLOWED)) {
      expect(ALLOWED[k as keyof typeof ALLOWED].length).toBeGreaterThan(0);
    }
  });

  it('security mode accepts security theme', () => {
    expect(ALLOWED.security).toContain('security');
  });

  it('editorial mode only allows editorial theme', () => {
    expect(ALLOWED.editorial).toEqual(['editorial']);
  });
});
