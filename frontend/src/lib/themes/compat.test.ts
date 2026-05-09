import { describe, it, expect } from 'vitest';
import { ALLOWED, coerceTheme } from './compat.js';

describe('theme compat', () => {
  it('leaves legal combos alone', () => {
    const r = coerceTheme('work', 'minimal-dark');
    expect(r).toEqual({ theme: 'minimal-dark', coerced: false });
  });

  it('coerces illegal combos to first allowed', () => {
    const r = coerceTheme('editorial', 'minimal-dark');
    expect(r.coerced).toBe(true);
    expect(r.theme).toBe('editorial');
    expect(r.from).toBe('minimal-dark');
  });

  it('every mode has at least one allowed theme', () => {
    for (const k of Object.keys(ALLOWED)) {
      expect(ALLOWED[k as keyof typeof ALLOWED].length).toBeGreaterThan(0);
    }
  });

  it('night mode allows minimal-dark theme', () => {
    expect(ALLOWED.night).toContain('minimal-dark');
  });

  it('editorial mode only allows editorial theme', () => {
    expect(ALLOWED.editorial).toEqual(['editorial']);
  });
});
