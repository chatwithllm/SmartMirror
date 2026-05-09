import { describe, it, expect } from 'vitest';
import { phaseAt, type Phase } from './clock.js';

function at(h: number, m = 0): Date {
  const d = new Date(2026, 4, 9, h, m, 0, 0); // 9 May 2026 (locale-stable)
  return d;
}

describe('phaseAt', () => {
  it('returns ratri for hours 22-23', () => {
    expect(phaseAt(at(22))).toBe('ratri');
    expect(phaseAt(at(23, 59))).toBe('ratri');
  });

  it('returns ratri for hours 0-4', () => {
    expect(phaseAt(at(0))).toBe('ratri');
    expect(phaseAt(at(4, 59))).toBe('ratri');
  });

  it('returns pratah from 05:00 to 10:59', () => {
    expect(phaseAt(at(5))).toBe('pratah');
    expect(phaseAt(at(10, 59))).toBe('pratah');
  });

  it('returns madhyahna from 11:00 to 16:59', () => {
    expect(phaseAt(at(11))).toBe('madhyahna');
    expect(phaseAt(at(16, 59))).toBe('madhyahna');
  });

  it('returns sandhya from 17:00 to 21:59', () => {
    expect(phaseAt(at(17))).toBe('sandhya');
    expect(phaseAt(at(21, 59))).toBe('sandhya');
  });

  it('boundary: 11:00 flips pratah to madhyahna', () => {
    expect(phaseAt(at(10, 59))).toBe('pratah');
    expect(phaseAt(at(11, 0))).toBe('madhyahna');
  });

  it('boundary: 17:00 flips madhyahna to sandhya', () => {
    expect(phaseAt(at(16, 59))).toBe('madhyahna');
    expect(phaseAt(at(17, 0))).toBe('sandhya');
  });

  it('boundary: 22:00 flips sandhya to ratri', () => {
    expect(phaseAt(at(21, 59))).toBe('sandhya');
    expect(phaseAt(at(22, 0))).toBe('ratri');
  });

  it('boundary: 05:00 flips ratri to pratah', () => {
    expect(phaseAt(at(4, 59))).toBe('ratri');
    expect(phaseAt(at(5, 0))).toBe('pratah');
  });
});
