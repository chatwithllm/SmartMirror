import type { Layout } from './schema.js';

/**
 * Dense offline demo layout. Used when HA is unreachable / not configured.
 * Mirrors ha/layouts/ops.portrait.json so dev output matches what HA would
 * eventually push.
 */
export const DEMO_LAYOUT: Layout = {
  version: 1,
  mode: 'ops',
  orientation: 'portrait',
  theme: 'minimal-dark',
  resolution: '1080p',
  transition: 'flip',
  grid: { cols: 8, rows: 14, gap: 14 },
  tiles: [
    {
      id: 'clock',
      type: 'clock',
      x: 0,
      y: 0,
      w: 4,
      h: 2,
      z: 0,
      props: { format: '24h', showSeconds: true, showDate: true },
      audio: false,
      resizable: true
    },
    {
      id: 'weather',
      type: 'weather',
      x: 4,
      y: 0,
      w: 4,
      h: 2,
      z: 0,
      props: { entity_id: 'weather.4340', units: 'imperial', days: 3 },
      audio: false,
      resizable: true
    },
    {
      id: 'alerts',
      type: 'alerts',
      x: 0,
      y: 2,
      w: 8,
      h: 2,
      z: 0,
      props: { severity_min: 'warn' },
      audio: false,
      resizable: true
    },
    {
      id: 'svc',
      type: 'service_status',
      x: 0,
      y: 4,
      w: 4,
      h: 3,
      z: 0,
      props: {},
      audio: false,
      resizable: true
    },
    {
      id: 'hosts',
      type: 'host_health',
      x: 4,
      y: 4,
      w: 4,
      h: 3,
      z: 0,
      props: {
        hosts: [
          {
            name: 'ha',
            cpu: 'sensor.processor_use',
            ram: 'sensor.memory_use_percent',
            disk: 'sensor.disk_use_percent_config'
          }
        ]
      },
      audio: false,
      resizable: true
    },
    {
      id: 'metrics',
      type: 'metrics_chart',
      x: 0,
      y: 7,
      w: 4,
      h: 2,
      z: 0,
      props: { title: 'System' },
      audio: false,
      resizable: true
    },
    {
      id: 'cal',
      type: 'calendar',
      x: 4,
      y: 7,
      w: 4,
      h: 2,
      z: 0,
      props: { entity_id: 'calendar.palakurla4340_gmail_com', count: 4 },
      audio: false,
      resizable: true
    },
    {
      id: 'news',
      type: 'news_briefing',
      x: 0,
      y: 9,
      w: 4,
      h: 3,
      z: 0,
      props: { count: 5 },
      audio: false,
      resizable: true
    },
    {
      id: 'logs',
      type: 'log_tail',
      x: 4,
      y: 9,
      w: 4,
      h: 3,
      z: 0,
      props: { source: 'ha', lines: 10 },
      audio: false,
      resizable: true
    },
    {
      id: 'board',
      type: 'project_board',
      x: 0,
      y: 12,
      w: 8,
      h: 2,
      z: 0,
      props: {},
      audio: false,
      resizable: true
    }
  ]
};
