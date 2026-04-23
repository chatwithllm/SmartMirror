import { z } from 'zod';

export const Orientation = z.enum(['portrait', 'landscape']);
export type Orientation = z.infer<typeof Orientation>;

export const ThemeName = z.enum(['minimal-dark', 'ops-cyberpunk', 'editorial', 'security']);
export type ThemeName = z.infer<typeof ThemeName>;

export const ModeName = z.enum([
  'morning',
  'work',
  'relax',
  'shopping',
  'security',
  'night',
  'ops',
  'guest',
  'showcase',
  'editorial'
]);
export type ModeName = z.infer<typeof ModeName>;

export const GridSchema = z.object({
  cols: z.number().int().min(4).max(16),
  rows: z.number().int().min(4).max(24),
  gap: z.number().int().min(0).max(40)
});
export type GridConfig = z.infer<typeof GridSchema>;

export const TileSchema = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
  z: z.number().int().default(0),
  props: z.record(z.string(), z.unknown()).default({}),
  audio: z.boolean().default(false),
  resizable: z.boolean().default(true),
  min: z.object({ w: z.number().int(), h: z.number().int() }).optional(),
  max: z.object({ w: z.number().int(), h: z.number().int() }).optional(),
  since: z.string().datetime().optional()
});
export type Tile = z.infer<typeof TileSchema>;

export const LayoutSchema = z.object({
  version: z.literal(1),
  mode: ModeName,
  orientation: Orientation,
  theme: ThemeName,
  resolution: z.enum(['4k', '1440p', '1080p']).default('1080p'),
  grid: GridSchema,
  tiles: z.array(TileSchema),
  transition: z.enum(['fade', 'flip', 'none']).default('flip'),
  ttl_seconds: z.number().int().optional()
});
export type Layout = z.infer<typeof LayoutSchema>;

export function parseLayout(raw: unknown): Layout {
  return LayoutSchema.parse(raw);
}

export function safeParseLayout(raw: unknown):
  | { ok: true; layout: Layout }
  | { ok: false; error: z.ZodError } {
  const r = LayoutSchema.safeParse(raw);
  return r.success ? { ok: true, layout: r.data } : { ok: false, error: r.error };
}
