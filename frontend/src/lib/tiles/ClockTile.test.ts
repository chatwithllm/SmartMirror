import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ClockTile from './ClockTile.svelte';

describe('ClockTile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-23T09:15:30Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a time element on mount', () => {
    render(ClockTile, { props: { id: 'clock', props: { showSeconds: true } } });
    const time = screen.getByTestId('clock-time');
    expect(time).toBeInTheDocument();
    // en-GB 24h seconds
    expect(time.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('advances the time text when the clock ticks', async () => {
    render(ClockTile, { props: { id: 'clock', props: { showSeconds: true } } });
    const time = screen.getByTestId('clock-time');
    const before = time.textContent;

    await vi.advanceTimersByTimeAsync(1_500);

    expect(time.textContent).not.toBe(before);
  });

  it('shows date when showDate is true', () => {
    render(ClockTile, { props: { id: 'clock', props: { showDate: true } } });
    expect(screen.getByTestId('clock-date')).toBeInTheDocument();
  });

  it('hides date when showDate is false', () => {
    render(ClockTile, { props: { id: 'clock', props: { showDate: false } } });
    expect(screen.queryByTestId('clock-date')).toBeNull();
  });
});
