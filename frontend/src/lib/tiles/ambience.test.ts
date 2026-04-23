import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import RoutineChecklistTile from './RoutineChecklistTile.svelte';
import CoffeeTimerTile from './CoffeeTimerTile.svelte';
import CommuteTile from './CommuteTile.svelte';
import AmbientScenesTile from './AmbientScenesTile.svelte';
import DeviceSliderTile from './DeviceSliderTile.svelte';
import SleepTimerTile from './SleepTimerTile.svelte';

describe('ambience / morning bundle', () => {
  it('Routine checklist toggles', async () => {
    const { getByTestId } = render(RoutineChecklistTile, { props: { id: 'rc' } });
    expect(getByTestId('routine')).toBeInTheDocument();
    await fireEvent.click(getByTestId('rc-1'));
    expect(getByTestId('routine').textContent).toContain('1/5');
  });

  it('Coffee timer start/pause/reset', async () => {
    const { getByTestId } = render(CoffeeTimerTile, { props: { id: 'ct' } });
    await fireEvent.click(getByTestId('coffee-start'));
    expect(getByTestId('coffee-pause')).toBeInTheDocument();
    await fireEvent.click(getByTestId('coffee-pause'));
    expect(getByTestId('coffee-resume')).toBeInTheDocument();
    await fireEvent.click(getByTestId('coffee-reset'));
    expect(getByTestId('coffee-start')).toBeInTheDocument();
  });

  it('Commute renders', () => {
    const { getByTestId } = render(CommuteTile, { props: { id: 'cm' } });
    expect(getByTestId('commute')).toBeInTheDocument();
  });

  it('Ambient scenes set active on click', async () => {
    const { getByTestId } = render(AmbientScenesTile, { props: { id: 'as' } });
    await fireEvent.click(getByTestId('scene-2'));
    expect(getByTestId('scenes')).toBeInTheDocument();
  });

  it('DeviceSlider renders', () => {
    const { getByTestId } = render(DeviceSliderTile, { props: { id: 'ds' } });
    expect(getByTestId('device-sliders')).toBeInTheDocument();
  });

  it('SleepTimer sets and cancels', async () => {
    const { getByTestId, queryByTestId } = render(SleepTimerTile, { props: { id: 'st' } });
    await fireEvent.click(getByTestId('sleep-30'));
    expect(getByTestId('sleep-remaining')).toBeInTheDocument();
    await fireEvent.click(getByTestId('sleep-cancel'));
    expect(queryByTestId('sleep-remaining')).toBeNull();
  });
});
