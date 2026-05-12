import type { Layout, ModeName, Orientation, ThemeName } from './schema.js';
import { safeParseLayout } from './schema.js';
import { coerceTheme } from '$lib/themes/compat.js';

// Import every bundled layout JSON as an inline module — Vite resolves
// the glob at build time so they all land in the client chunk.
// Shape: { '../layout/bundled/work.portrait.json': { default: {...} }, ... }
const BUNDLED = import.meta.glob('./bundled/*.json', {
  eager: true,
  import: 'default'
}) as Record<string, unknown>;

const PRESETS: Record<string, { mode: ModeName; theme: ThemeName }> = {
  'editorial-daily':   { mode: 'editorial',    theme: 'editorial'    },
  'work':              { mode: 'work',         theme: 'minimal-dark' },
  'morning-editorial': { mode: 'morning',      theme: 'editorial'    },
  'magic-mirror':      { mode: 'magic-mirror', theme: 'magic-mirror' }
};

export interface ResolveInput {
  preset?: string;
  mode?: ModeName | 'auto';
  theme?: ThemeName | 'auto';
  orientation?: Orientation;
}

export interface ResolveResult {
  layout: Layout;
  picked: { mode: ModeName; theme: ThemeName; orientation: Orientation };
}

function lookupBundled(mode: ModeName, orientation: Orientation): unknown | null {
  const key = `./bundled/${mode}.${orientation}.json`;
  return BUNDLED[key] ?? null;
}

function defaultModeAndTheme(
  input: ResolveInput
): { mode: ModeName; theme: ThemeName } {
  let mode = input.mode && input.mode !== 'auto' ? (input.mode as ModeName) : null;
  let theme = input.theme && input.theme !== 'auto' ? (input.theme as ThemeName) : null;

  if (input.preset && input.preset !== 'auto' && PRESETS[input.preset]) {
    const p = PRESETS[input.preset];
    if (!mode) mode = p.mode;
    if (!theme) theme = p.theme;
  }

  if (!mode) {
    const h = new Date().getHours();
    if (h < 6 || h >= 22) mode = 'night';
    else if (h < 10) mode = 'morning';
    else mode = 'work';
  }

  if (!theme) theme = coerceTheme(mode, 'minimal-dark').theme;

  return { mode, theme };
}

/**
 * Resolve an HA preset/mode/theme/orientation tuple into the bundled
 * layout JSON that best matches. Coerces illegal (mode × theme) combos
 * via the shared `compat.ts` map.
 */
export function resolveLayout(input: ResolveInput): ResolveResult | null {
  const { mode: rawMode, theme: rawTheme } = defaultModeAndTheme(input);
  const orientation: Orientation = input.orientation ?? 'portrait';

  const coerce = coerceTheme(rawMode, rawTheme);
  const picked = { mode: rawMode, theme: coerce.theme, orientation };

  const raw = lookupBundled(picked.mode, orientation);
  if (!raw) return null;

  const parsed = safeParseLayout(raw);
  if (!parsed.ok) return null;

  // Override the layout's theme with the coerced value so UI stays
  // consistent regardless of what's hard-coded in the bundled JSON.
  const layout = { ...parsed.layout, theme: picked.theme, mode: picked.mode };
  return { layout, picked };
}
