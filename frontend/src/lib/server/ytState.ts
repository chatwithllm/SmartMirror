// Module-level singleton holding the last YouTube video the mirror
// was asked to play. The /paste route writes here, the frontend
// polls GET /api/admin/yt and reacts on ts change. No HA round-trip
// — keeps the paste flow working even when HA is unreachable or an
// input_text helper refuses to register.

let current = { value: '', ts: 0 };

export function setYt(value: string): { value: string; ts: number } {
  current = { value, ts: Date.now() };
  return current;
}

export function getYt(): { value: string; ts: number } {
  return current;
}
