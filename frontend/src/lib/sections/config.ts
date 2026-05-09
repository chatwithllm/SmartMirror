import type { ChannelConfig, SectionId } from '$lib/cards/types.js';

/**
 * Locked from spec: docs/superpowers/specs/2026-05-09-mirror-daily-v1-design.md
 * Each section has a pool of candidate cards and a phase-default map.
 * Gesture-cycle moves through the pool. Phase change snaps to the default
 * unless an active manual override is in effect.
 */
export const CHANNELS: Record<SectionId, ChannelConfig> = {
  'section-2': {
    pool: ['calendar_today', 'immich_photo', 'news_tech', 'calendar_tomorrow', 'calendar_next'],
    phaseDefaults: {
      pratah: 'calendar_today',
      madhyahna: 'calendar_next',
      sandhya: 'calendar_tomorrow',
      ratri: 'immich_photo'
    }
  },
  'section-3': {
    pool: ['news_tech', 'grocery', 'calendar_today', 'calendar_tomorrow'],
    phaseDefaults: {
      pratah: 'news_tech',
      madhyahna: 'grocery',
      sandhya: 'news_tech',
      ratri: 'calendar_tomorrow'
    }
  },
  'section-4': {
    pool: ['weather_hourly', 'ha_notifications', 'immich_photo'],
    phaseDefaults: {
      pratah: 'weather_hourly',
      madhyahna: 'ha_notifications',
      sandhya: 'immich_photo',
      ratri: 'ha_notifications'
    }
  }
};

export const OVERRIDE_TIMEOUT_MS = 10 * 60 * 1000;
