import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import PomodoroTile from './PomodoroTile.svelte';
import MeetingCountdownTile from './MeetingCountdownTile.svelte';
import ProjectBoardTile from './ProjectBoardTile.svelte';
import PrListTile from './PrListTile.svelte';
import DeployPipelineTile from './DeployPipelineTile.svelte';
import MessagesTile from './MessagesTile.svelte';
import { pomodoro } from '$lib/stores/pomodoro.js';

describe('work bundle', () => {
  it('Pomodoro: start → pause → reset', async () => {
    const { getByTestId } = render(PomodoroTile, {
      props: { id: 'pd', props: { minutes: 25 } }
    });
    expect(getByTestId('pomodoro')).toBeInTheDocument();
    await fireEvent.click(getByTestId('pomo-start'));
    expect(getByTestId('pomo-pause')).toBeInTheDocument();
    await fireEvent.click(getByTestId('pomo-pause'));
    expect(getByTestId('pomo-resume')).toBeInTheDocument();
    await fireEvent.click(getByTestId('pomo-reset'));
    expect(getByTestId('pomo-start')).toBeInTheDocument();
    pomodoro.reset();
  });

  it('Meeting countdown renders', () => {
    const { getByTestId } = render(MeetingCountdownTile, { props: { id: 'mc' } });
    expect(getByTestId('meeting')).toBeInTheDocument();
  });

  it('ProjectBoard renders', () => {
    const { getByTestId } = render(ProjectBoardTile, { props: { id: 'pb' } });
    expect(getByTestId('project-board')).toBeInTheDocument();
  });

  it('PrList renders', () => {
    const { getByTestId } = render(PrListTile, { props: { id: 'pl' } });
    expect(getByTestId('pr-list')).toBeInTheDocument();
  });

  it('DeployPipeline renders', () => {
    const { getByTestId } = render(DeployPipelineTile, { props: { id: 'dp' } });
    expect(getByTestId('deploy')).toBeInTheDocument();
  });

  it('Messages renders', () => {
    const { getByTestId } = render(MessagesTile, { props: { id: 'ms' } });
    expect(getByTestId('messages')).toBeInTheDocument();
  });
});
