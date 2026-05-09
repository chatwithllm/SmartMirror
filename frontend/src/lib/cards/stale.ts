/**
 * Returns true when the last successful fetch is older than 3× the
 * card's refresh interval. Cards add `data-stale={isStale ? 'true' :
 * undefined}` to their root and CSS fades content to 60% opacity.
 */
export function isStale(lastSuccessTs: number, refreshIntervalMs: number): boolean {
  if (lastSuccessTs === 0) return false;
  return Date.now() - lastSuccessTs > 3 * refreshIntervalMs;
}
