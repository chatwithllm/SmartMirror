import list from './list.json';

export interface WordEntry {
  word: string;
  pos: string;
  def: string;
}

const words: WordEntry[] = list as WordEntry[];

/**
 * Pick a deterministic word based on the absolute hour. Same hour =
 * same word across all kiosks / page reloads, so the strip doesn't
 * flicker on remounts.
 */
export function wordForHour(d: Date = new Date()): WordEntry {
  if (words.length === 0) {
    return { word: '—', pos: '', def: '' };
  }
  const hourEpoch = Math.floor(d.getTime() / 3_600_000);
  const idx = ((hourEpoch % words.length) + words.length) % words.length;
  return words[idx];
}

export function wordCount(): number {
  return words.length;
}
