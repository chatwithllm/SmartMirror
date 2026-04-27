import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseGestureState, wireGestures, type GesturePayload } from './events.js';
import { gestureRouter } from './router.js';

describe('parseGestureState', () => {
  it('rejects empty / non-JSON', () => {
    expect(parseGestureState(null)).toBeNull();
    expect(parseGestureState('')).toBeNull();
    expect(parseGestureState('not json')).toBeNull();
  });

  it('rejects unknown gesture names', () => {
    expect(parseGestureState('{"gesture":"shrug","ts":1}')).toBeNull();
  });

  it('rejects missing or non-numeric ts', () => {
    expect(parseGestureState('{"gesture":"wake"}')).toBeNull();
    expect(parseGestureState('{"gesture":"wake","ts":"x"}')).toBeNull();
    expect(parseGestureState('{"gesture":"wake","ts":0}')).toBeNull();
  });

  it('accepts a well-formed payload', () => {
    const p = parseGestureState('{"gesture":"focus","ts":12345,"payload":{"k":1}}');
    expect(p).toEqual<GesturePayload>({ gesture: 'focus', ts: 12345, payload: { k: 1 } });
  });

  it('coerces stringified numeric ts', () => {
    const p = parseGestureState('{"gesture":"wake","ts":"42"}');
    expect(p?.ts).toBe(42);
  });
});

describe('wireGestures (with injected fetcher)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('does not dispatch on the baseline tick', async () => {
    const seen: string[] = [];
    const off = gestureRouter.on('focus', () => seen.push('focus'));
    const fetcher = vi.fn(async () => ({ gesture: 'focus' as const, ts: 100 }));

    const stop = wireGestures({ intervalMs: 1000, fetcher, now: () => 100 });
    await vi.runOnlyPendingTimersAsync();

    expect(seen).toEqual([]);
    stop();
    off();
  });

  it('dispatches on a fresher ts after baseline', async () => {
    const seen: string[] = [];
    const off = gestureRouter.on('mode_next', () => seen.push('mode_next'));
    let ts = 100;
    const fetcher = vi.fn(async () => ({ gesture: 'mode_next' as const, ts }));

    const stop = wireGestures({ intervalMs: 1000, fetcher, now: () => 100 });
    await vi.runOnlyPendingTimersAsync(); // baseline
    ts = 101;
    vi.advanceTimersByTime(1000);
    await vi.runOnlyPendingTimersAsync();

    expect(seen).toEqual(['mode_next']);
    stop();
    off();
  });

  it('drops stale events outside the freshness window', async () => {
    const seen: string[] = [];
    const off = gestureRouter.on('alert_ack', () => seen.push('alert_ack'));
    let ts = 100;
    const fetcher = vi.fn(async () => ({ gesture: 'alert_ack' as const, ts }));
    let nowSec = 100;

    const stop = wireGestures({
      intervalMs: 1000,
      fetcher,
      now: () => nowSec
    });
    await vi.runOnlyPendingTimersAsync(); // baseline at ts=100
    ts = 101;
    nowSec = 200; // 99s in the future — outside 30s window
    vi.advanceTimersByTime(1000);
    await vi.runOnlyPendingTimersAsync();

    expect(seen).toEqual([]);
    stop();
    off();
  });

  it('ignores duplicate ts on subsequent ticks', async () => {
    let calls = 0;
    const off = gestureRouter.on('wake', () => (calls += 1));
    const fetcher = vi.fn(async () => ({ gesture: 'wake' as const, ts: 200 }));

    const stop = wireGestures({ intervalMs: 1000, fetcher, now: () => 200 });
    await vi.runOnlyPendingTimersAsync(); // baseline
    vi.advanceTimersByTime(2500);
    await vi.runOnlyPendingTimersAsync();

    expect(calls).toBe(0);
    stop();
    off();
  });
});
