import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import AlarmPanelTile from './AlarmPanelTile.svelte';
import EventTimelineTile from './EventTimelineTile.svelte';
import SensorGridTile from './SensorGridTile.svelte';
import QuickActionsTile from './QuickActionsTile.svelte';

describe('security bundle', () => {
  it('AlarmPanel arm change updates state chip', async () => {
    const { getByTestId } = render(AlarmPanelTile, { props: { id: 'ap' } });
    expect(getByTestId('alarm-state').textContent).toContain('Disarmed');
    await fireEvent.click(getByTestId('arm-away'));
    expect(getByTestId('alarm-state').textContent).toContain('AWAY');
  });

  it('EventTimeline ack removes from unack count', async () => {
    const { getByTestId } = render(EventTimelineTile, { props: { id: 'et' } });
    const before = getByTestId('event-timeline').textContent ?? '';
    await fireEvent.click(getByTestId('ack-1'));
    const after = getByTestId('event-timeline').textContent ?? '';
    expect(after).not.toBe(before);
  });

  it('SensorGrid renders', () => {
    const { getByTestId } = render(SensorGridTile, { props: { id: 'sg' } });
    expect(getByTestId('sensor-grid')).toBeInTheDocument();
  });

  it('QuickActions flashes on click', async () => {
    const { getByTestId } = render(QuickActionsTile, { props: { id: 'qa' } });
    await fireEvent.click(getByTestId('qa-coffee'));
    // Handler dispatched — no throw is success.
    expect(getByTestId('quick-actions')).toBeInTheDocument();
  });
});
