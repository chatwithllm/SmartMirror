import type { ModeName, ThemeName } from '$lib/layout/schema.js';

export const ALLOWED: Record<ModeName, ThemeName[]> = {
  morning: ['minimal-dark', 'editorial'],
  work: ['minimal-dark', 'editorial'],
  night: ['minimal-dark'],
  editorial: ['editorial'],
  'magic-mirror': ['magic-mirror']
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
