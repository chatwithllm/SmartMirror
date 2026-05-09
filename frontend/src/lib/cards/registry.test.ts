import { describe, it, expect } from 'vitest';
import { registerCard, cardFor, listRegistered } from './registry.js';
import type { CardEntry, CardProps } from './types.js';
import type { Component } from 'svelte';

const stub: Component<CardProps> = (() => null) as unknown as Component<CardProps>;

describe('card registry', () => {
  it('registers and retrieves a card', () => {
    const entry: CardEntry = {
      id: 'calendar_today',
      component: stub,
      refreshIntervalMs: 60_000,
      emptyState: 'No events today'
    };
    registerCard(entry);
    expect(cardFor('calendar_today')).toBe(entry);
  });

  it('lists all registered ids', () => {
    const ids = listRegistered();
    expect(ids).toContain('calendar_today');
  });
});
