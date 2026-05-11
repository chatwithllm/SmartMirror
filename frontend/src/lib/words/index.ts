import list from './list.json';
import quoteList from './quotes.json';

export interface WordEntry {
  word: string;
  pos: string;
  def: string;
}

export interface QuoteEntry {
  q: string;
  by: string;
}

const words: WordEntry[] = list as WordEntry[];
const quotes: QuoteEntry[] = quoteList as QuoteEntry[];

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

/** Same hour-bucket logic as wordForHour, but offset so word + quote
 *  don't share an obvious cadence (different prime offsets pull from
 *  different points in their respective lists). */
export function quoteForHour(d: Date = new Date()): QuoteEntry {
  if (quotes.length === 0) return { q: '', by: '' };
  const hourEpoch = Math.floor(d.getTime() / 3_600_000);
  const idx = ((hourEpoch + 7) % quotes.length + quotes.length) % quotes.length;
  return quotes[idx];
}

export function wordCount(): number {
  return words.length;
}
