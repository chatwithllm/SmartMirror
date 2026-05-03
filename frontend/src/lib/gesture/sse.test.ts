import { describe, it, expect } from 'vitest';
import { parseGestureMessage, wireGestures } from './sse.js';
import { gestureRouter } from './router.js';

/**
 * Minimal EventSource fake. Only what wireGestures actually touches:
 * addEventListener('gesture', …), removeEventListener, close(). We
 * expose a `push(json)` helper to simulate a server-sent message.
 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  listeners: Record<string, EventListener[]> = {};
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: EventListener): void {
    (this.listeners[type] ??= []).push(handler);
  }

  removeEventListener(type: string, handler: EventListener): void {
    const arr = this.listeners[type];
    if (!arr) return;
    this.listeners[type] = arr.filter((h) => h !== handler);
  }

  close(): void {
    this.closed = true;
  }

  push(data: string): void {
    const ev = { data } as unknown as MessageEvent<string>;
    for (const h of this.listeners['gesture'] ?? []) {
      h(ev as unknown as Event);
    }
  }
}

describe('parseGestureMessage', () => {
  it('rejects malformed JSON', () => {
    expect(parseGestureMessage('not json')).toBeNull();
  });

  it('rejects unknown gesture names', () => {
    expect(parseGestureMessage('{"gesture":"shrug","ts":1}')).toBeNull();
  });

  it('rejects missing ts', () => {
    expect(parseGestureMessage('{"gesture":"wake"}')).toBeNull();
  });

  it('accepts a well-formed payload', () => {
    expect(parseGestureMessage('{"gesture":"focus","ts":12,"payload":{"x":1}}')).toEqual({
      gesture: 'focus',
      ts: 12,
      payload: { x: 1 }
    });
  });
});

describe('wireGestures', () => {
  it('dispatches incoming gestures into the router', () => {
    FakeEventSource.instances = [];
    const seen: string[] = [];
    const off = gestureRouter.on('mode_next', () => seen.push('mode_next'));

    const stop = wireGestures({
      EventSourceCtor: FakeEventSource as unknown as typeof EventSource,
      now: () => 100
    });
    const es = FakeEventSource.instances[0];
    es.push(JSON.stringify({ gesture: 'mode_next', ts: 100 }));

    expect(seen).toEqual(['mode_next']);
    stop();
    off();
  });

  it('drops stale events outside the freshness window', () => {
    FakeEventSource.instances = [];
    const seen: string[] = [];
    const off = gestureRouter.on('alert_ack', () => seen.push('alert_ack'));

    const stop = wireGestures({
      EventSourceCtor: FakeEventSource as unknown as typeof EventSource,
      now: () => 200 // 100s after the event
    });
    const es = FakeEventSource.instances[0];
    es.push(JSON.stringify({ gesture: 'alert_ack', ts: 100 }));

    expect(seen).toEqual([]);
    stop();
    off();
  });

  it('stop() closes the EventSource and detaches the listener', () => {
    FakeEventSource.instances = [];
    const seen: string[] = [];
    const off = gestureRouter.on('wake', () => seen.push('wake'));

    const stop = wireGestures({
      EventSourceCtor: FakeEventSource as unknown as typeof EventSource,
      now: () => 1
    });
    const es = FakeEventSource.instances[0];
    stop();

    es.push(JSON.stringify({ gesture: 'wake', ts: 1 }));
    expect(seen).toEqual([]);
    expect(es.closed).toBe(true);
    off();
  });
});
