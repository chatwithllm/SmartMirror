import { describe, it, expect } from 'vitest';
import { snapshot } from './report.js';

describe('telemetry snapshot', () => {
  it('returns shape with fps/dom/heap_mb/ts', () => {
    const s = snapshot();
    expect(typeof s.fps).toBe('number');
    expect(typeof s.dom).toBe('number');
    expect(typeof s.heap_mb).toBe('number');
    expect(typeof s.ts).toBe('number');
  });
});
