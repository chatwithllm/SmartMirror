import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import CalendarTile from './CalendarTile.svelte';
import NewsBriefingTile from './NewsBriefingTile.svelte';
import ServiceStatusTile from './ServiceStatusTile.svelte';
import HostHealthTile from './HostHealthTile.svelte';
import AlertsTile from './AlertsTile.svelte';
import LogTailTile from './LogTailTile.svelte';
import MetricsChartTile from './MetricsChartTile.svelte';
import IframeTile from './IframeTile.svelte';
import WeatherTile from './WeatherTile.svelte';

describe('core tiles render non-empty with minimal props', () => {
  it('calendar', () => {
    const { getByTestId } = render(CalendarTile, { props: { id: 'cal' } });
    expect(getByTestId('calendar')).toBeInTheDocument();
  });
  it('news_briefing', () => {
    const { getByTestId } = render(NewsBriefingTile, { props: { id: 'nb' } });
    expect(getByTestId('news')).toBeInTheDocument();
  });
  it('service_status', () => {
    const { getByTestId } = render(ServiceStatusTile, { props: { id: 'ss' } });
    expect(getByTestId('svc-status')).toBeInTheDocument();
  });
  it('host_health', () => {
    const { getByTestId } = render(HostHealthTile, { props: { id: 'hh' } });
    expect(getByTestId('host-health')).toBeInTheDocument();
  });
  it('alerts', () => {
    const { getByTestId } = render(AlertsTile, { props: { id: 'al' } });
    expect(getByTestId('alerts')).toBeInTheDocument();
  });
  it('log_tail', () => {
    const { getByTestId } = render(LogTailTile, { props: { id: 'lt' } });
    expect(getByTestId('log-tail')).toBeInTheDocument();
  });
  it('metrics_chart', () => {
    const { getByTestId } = render(MetricsChartTile, { props: { id: 'mc' } });
    expect(getByTestId('metrics-chart')).toBeInTheDocument();
  });
  it('iframe (no url -> empty)', () => {
    const { getByTestId } = render(IframeTile, { props: { id: 'if' } });
    expect(getByTestId('iframe-empty')).toBeInTheDocument();
  });
  it('iframe (with url -> frame)', () => {
    const { getByTestId } = render(IframeTile, {
      props: { id: 'if', props: { url: 'about:blank' } }
    });
    expect(getByTestId('iframe-tile')).toBeInTheDocument();
  });
  it('weather', () => {
    const { getByTestId } = render(WeatherTile, { props: { id: 'wx' } });
    expect(getByTestId('weather')).toBeInTheDocument();
  });
});
