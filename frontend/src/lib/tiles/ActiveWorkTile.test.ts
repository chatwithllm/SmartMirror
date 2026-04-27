import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import ActiveWorkTile from './ActiveWorkTile.svelte';
import type { KanbanCard } from '$lib/kanban/types.js';

const FAKE_CARDS: KanbanCard[] = [
  {
    id: 'c1',
    title: 'Voice control for tiles',
    status: 'in_progress',
    tags: ['smartmirror', 'voice', 'deployed-local'],
    project: 'github.com/chatwithllm/smartmirror',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'c2',
    title: 'Auth leak fix',
    status: 'today',
    tags: ['blocked'],
    project: 'github.com/chatwithllm/argus',
    updated_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  },
];

function mockFetch(payload: KanbanCard[], status = 200) {
  globalThis.fetch = vi.fn(async () => ({
    ok: status === 200,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => payload,
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ActiveWorkTile', () => {
  it('renders project label + title for each card', async () => {
    mockFetch(FAKE_CARDS);
    render(ActiveWorkTile, {
      props: { id: 't1', props: { kanbanUrl: 'http://k', mirrorToken: 'm', refreshSeconds: 30 } },
    });
    await waitFor(() => expect(screen.getByText(/Voice control for tiles/i)).toBeInTheDocument());
    expect(screen.getByText(/Auth leak fix/i)).toBeInTheDocument();
    expect(screen.getByText(/smartmirror/i)).toBeInTheDocument();
    expect(screen.getByText(/argus/i)).toBeInTheDocument();
  });

  it('shows the deployed-local tag indicator', async () => {
    mockFetch(FAKE_CARDS);
    const { container } = render(ActiveWorkTile, {
      props: { id: 't1', props: { kanbanUrl: 'http://k', mirrorToken: 'm' } },
    });
    await waitFor(() => expect(screen.getByText(/Voice control/)).toBeInTheDocument());
    expect(container.querySelector('[data-tag="deployed-local"]')).toBeTruthy();
  });

  it('shows the blocked indicator on a blocked card', async () => {
    mockFetch(FAKE_CARDS);
    const { container } = render(ActiveWorkTile, {
      props: { id: 't1', props: { kanbanUrl: 'http://k', mirrorToken: 'm' } },
    });
    await waitFor(() => expect(screen.getByText(/Auth leak/)).toBeInTheDocument());
    expect(container.querySelector('[data-tag="blocked"]')).toBeTruthy();
  });

  it('renders empty state when no cards', async () => {
    mockFetch([]);
    render(ActiveWorkTile, {
      props: { id: 't1', props: { kanbanUrl: 'http://k', mirrorToken: 'm' } },
    });
    await waitFor(() => expect(screen.getByText(/No active work/i)).toBeInTheDocument());
  });

  it('renders error footer on fetch failure', async () => {
    mockFetch([], 500);
    render(ActiveWorkTile, {
      props: { id: 't1', props: { kanbanUrl: 'http://k', mirrorToken: 'm' } },
    });
    await waitFor(() => expect(screen.getByText(/error/i)).toBeInTheDocument());
  });

  it('truncates to maxCards and shows "+N more"', async () => {
    const many: KanbanCard[] = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i}`, title: `Task ${i}`, status: 'in_progress', tags: [],
      project: 'p', updated_at: new Date(Date.now() - i * 60000).toISOString(),
    }));
    mockFetch(many);
    render(ActiveWorkTile, {
      props: { id: 't1', props: { kanbanUrl: 'http://k', mirrorToken: 'm', maxCards: 3 } },
    });
    await waitFor(() => expect(screen.getByText(/Task 0/)).toBeInTheDocument());
    expect(screen.getByText(/\+5 more/)).toBeInTheDocument();
  });
});
