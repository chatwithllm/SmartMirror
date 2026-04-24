import type { ModeName, ThemeName } from '$lib/layout/schema.js';

export const ALLOWED: Record<ModeName, ThemeName[]> = {
  morning: ['minimal-dark', 'editorial', 'ops-cyberpunk'],
  work: ['ops-cyberpunk', 'minimal-dark', 'editorial'],
  relax: ['minimal-dark', 'editorial'],
  shopping: ['minimal-dark', 'ops-cyberpunk', 'editorial'],
  security: ['security', 'ops-cyberpunk'],
  night: ['minimal-dark', 'security'],
  ops: ['ops-cyberpunk', 'security'],
  guest: ['editorial', 'minimal-dark'],
  showcase: ['editorial', 'minimal-dark'],
  editorial: ['editorial'],
  minimal: ['minimal-dark']
};

export interface CoerceResult {
  theme: ThemeName;
  coerced: boolean;
  from?: ThemeName;
}

export function coerceTheme(mode: ModeName, theme: ThemeName): CoerceResult {
  const allowed = ALLOWED[mode] ?? ['minimal-dark'];
  if (allowed.includes(theme)) return { theme, coerced: false };
  return { theme: allowed[0], coerced: true, from: theme };
}
