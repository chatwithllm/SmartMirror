/**
 * HA weather condition → glyph mapping. Returns a single character
 * styled with VS-15 (`︎`) where appropriate to nudge browsers
 * toward monochrome text-presentation rendering instead of full-color
 * emoji — fits the Fraunces editorial palette better.
 *
 * HA's documented condition set:
 *   clear-night, cloudy, exceptional, fog, hail, lightning,
 *   lightning-rainy, partlycloudy, pouring, rainy, snowy, snowy-rainy,
 *   sunny, windy, windy-variant
 *
 * Anything unrecognized falls back to a thin generic glyph.
 */
const MAP: Record<string, string> = {
  'clear-night': '🌙',
  'cloudy': '☁️',
  'fog': '🌫️',
  'hail': '🌨️',
  'lightning': '⚡',
  'lightning-rainy': '⛈️',
  'partlycloudy': '⛅',
  'pouring': '🌧️',
  'rainy': '🌦️',
  'snowy': '❄️',
  'snowy-rainy': '🌨️',
  'sunny': '☀️',
  'windy': '💨',
  'windy-variant': '💨',
  'exceptional': '⚠️'
};

/**
 * Resolve a HA condition string to a glyph. Normalizes by lowercasing
 * + collapsing spaces/underscores/dashes, so 'Partly Cloudy',
 * 'partly_cloudy', 'partly-cloudy', 'partlycloudy' all resolve to the
 * same key.
 */
export function weatherIcon(condition: string | null | undefined): string {
  if (!condition) return '·';
  const k = condition.toLowerCase().replace(/[\s_-]+/g, '');
  // Try the canonical kebab form, then the collapsed form.
  return (
    MAP[condition.toLowerCase()] ??
    MAP[Object.keys(MAP).find((m) => m.replace(/-/g, '') === k) ?? ''] ??
    '·'
  );
}
