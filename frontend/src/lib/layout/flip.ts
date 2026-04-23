/**
 * FLIP animation helper — spec FRONTEND_SPEC §6.
 * Caller snapshots rects BEFORE mutating DOM, then calls `flip()` after.
 */
export function snapshotRects(nodes: NodeListOf<HTMLElement> | HTMLElement[]):
  Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  for (const el of Array.from(nodes)) {
    const id = el.dataset.tileId;
    if (id) map.set(id, el.getBoundingClientRect());
  }
  return map;
}

export function flip(
  nodes: NodeListOf<HTMLElement> | HTMLElement[],
  prevRects: Map<string, DOMRect>,
  opts: { duration?: number; easing?: string } = {}
): void {
  const duration = opts.duration ?? 280;
  const easing = opts.easing ?? 'cubic-bezier(0.2, 0.9, 0.2, 1.0)';
  for (const el of Array.from(nodes)) {
    const id = el.dataset.tileId;
    if (!id) continue;
    const prev = prevRects.get(id);
    if (!prev) continue;
    const next = el.getBoundingClientRect();
    const dx = prev.left - next.left;
    const dy = prev.top - next.top;
    const sx = next.width > 0 ? prev.width / next.width : 1;
    const sy = next.height > 0 ? prev.height / next.height : 1;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(1 - sx) < 0.01 && Math.abs(1 - sy) < 0.01) {
      continue;
    }
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transform: 'translate(0,0) scale(1,1)' }
      ],
      { duration, easing }
    );
  }
}
