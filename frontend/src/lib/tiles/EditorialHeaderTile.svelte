<script lang="ts">
  /**
   * Editorial masthead — single composite header for editorial-daily
   * portrait. Renders title (left, two-tone Fraunces italic) +
   * time/date/weather (right, small caps + tabular numerals) under a
   * single full-bleed triple ornamental rule. Chromeless.
   *
   * Distinctive detail: the edition kicker rotates by hour
   * (MORNING / AFTERNOON / EVENING / LATE) so the masthead feels
   * authored, not static. Like a real daily that prints multiple
   * editions.
   */
  import { onDestroy, onMount } from 'svelte';
  import BaseTile from './BaseTile.svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';
  import { currentPhase, type Phase } from '$lib/phase/clock.js';

  interface Props {
    id: string;
    props?: {
      title?: string;
      weatherEntity?: string;
      units?: 'metric' | 'imperial';
      locale?: string;
    };
  }

  let { id, props = {} }: Props = $props();

  const title = $derived(props.title ?? 'The Mirror Daily');
  const units = $derived(props.units ?? 'imperial');
  const locale = $derived(props.locale ?? 'en-GB');

  // Time tick — 1s. Cheap; this tile is mounted once.
  let now = $state(new Date());
  let timer: ReturnType<typeof setInterval> | null = null;
  onMount(() => {
    timer = setInterval(() => (now = new Date()), 1000);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  // Weather watch — only if entity_id provided.
  let haEntity = $state<HaEntity | null>(null);
  let stopWatch: (() => void) | null = null;
  $effect(() => {
    stopWatch?.();
    haEntity = null;
    if (!props.weatherEntity) return;
    const w = watchEntity(props.weatherEntity, 60_000);
    const unsub = w.store.subscribe((e) => (haEntity = e));
    stopWatch = () => {
      unsub();
      w.stop();
    };
  });
  onDestroy(() => stopWatch?.());

  const weather = $derived.by(() => {
    if (!haEntity) return { tempC: 18, condition: 'Partly cloudy' };
    const a = haEntity.attributes as {
      temperature?: number;
      temperature_unit?: string;
    };
    const tempC =
      typeof a.temperature === 'number'
        ? a.temperature_unit === '°F'
          ? ((a.temperature - 32) * 5) / 9
          : a.temperature
        : 18;
    return { tempC, condition: haEntity.state || 'Partly cloudy' };
  });

  const tempLabel = $derived(
    units === 'imperial'
      ? `${Math.round((weather.tempC * 9) / 5 + 32)}°F`
      : `${Math.round(weather.tempC)}°C`
  );

  const split = $derived.by(() => {
    const idx = title.lastIndexOf(' ');
    return idx < 0
      ? { lead: title, tail: '' }
      : { lead: title.slice(0, idx), tail: title.slice(idx + 1) };
  });

  const timeText = $derived(
    now.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  );

  const dateText = $derived(
    now
      .toLocaleDateString(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      })
      .toUpperCase()
  );

  // Sanskrit (with IAST diacritics) and English labels per phase. Flip
  // every 8s so both halves get airtime; respects prefers-reduced-motion
  // by pinning to side-by-side static.
  const PHASE_LABELS: Record<Phase, { sa: string; en: string }> = {
    pratah:    { sa: 'Prātaḥ Edition',    en: 'Morning Edition' },
    madhyahna: { sa: 'Madhyāhna Edition', en: 'Midday Edition' },
    sandhya:   { sa: 'Sandhyā Edition',   en: 'Evening Edition' },
    ratri:     { sa: 'Rātri Edition',     en: 'Late Edition' }
  };

  let flipIdx = $state(0); // 0 = sanskrit, 1 = english
  let flipTimer: ReturnType<typeof setInterval> | null = null;
  let reducedMotion = $state(false);

  onMount(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = mq.matches;
    const onChange = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
    mq.addEventListener('change', onChange);

    if (!reducedMotion) {
      flipTimer = setInterval(() => (flipIdx = flipIdx === 0 ? 1 : 0), 8000);
    }

    return () => {
      mq.removeEventListener('change', onChange);
    };
  });

  onDestroy(() => {
    if (flipTimer) clearInterval(flipTimer);
  });

  const edition = $derived.by(() => {
    const labels = PHASE_LABELS[$currentPhase];
    if (reducedMotion) return `${labels.sa} · ${labels.en}`;
    return flipIdx === 0 ? labels.sa : labels.en;
  });

  const conditionShort = $derived(
    weather.condition
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );

  // Ticker content. Falls back to weekly weather when nothing else.
  // Future: HA notifications + calendar items will pre-empt the
  // weather strip via priority queue. For now: weather only.
  type TickerItem = { kind: 'weather' | 'alert' | 'event'; text: string };

  const weatherForecast = $derived.by((): { day: string; tempC: number; cond: string }[] => {
    if (!haEntity) {
      // Synthesize a 7-day demo so the ticker has motion in dev.
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const conds = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Sunny', 'Sunny', 'Cloudy'];
      const temps = [18, 20, 17, 14, 19, 22, 16];
      return days.map((d, i) => ({ day: d, tempC: temps[i], cond: conds[i] }));
    }
    const a = haEntity.attributes as {
      forecast?: { datetime: string; temperature: number; condition: string }[];
      temperature_unit?: string;
    };
    const fc = a.forecast ?? [];
    return fc.slice(0, 7).map((f) => ({
      day: new Date(f.datetime).toLocaleDateString('en-GB', { weekday: 'short' }),
      tempC:
        a.temperature_unit === '°F' ? ((f.temperature - 32) * 5) / 9 : f.temperature,
      cond: f.condition
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    }));
  });

  const tickerItems = $derived.by((): TickerItem[] => {
    // Eventually: pull HA notifications + calendar here, prepend.
    const wkLabel = units === 'imperial' ? '°F' : '°C';
    const fmtT = (c: number) =>
      units === 'imperial' ? Math.round((c * 9) / 5 + 32) : Math.round(c);
    const items: TickerItem[] = weatherForecast.map((f) => ({
      kind: 'weather',
      text: `${f.day.toUpperCase()} ${fmtT(f.tempC)}${wkLabel} ${f.cond}`
    }));
    return items.length
      ? items
      : [{ kind: 'weather', text: 'Weekly outlook unavailable' }];
  });
</script>

<BaseTile {id} type="editorial_header" chromeless={true} label={title}>
  <header class="eh">
    <div class="masthead">
      <div class="left">
        <div class="kicker">
          <span class="flip" data-idx={flipIdx}>— {edition} —</span>
        </div>
        <h1 class="brand">
          <span class="lead">{split.lead}</span>{#if split.tail}<span class="tail"> {split.tail}</span>{/if}
        </h1>
      </div>

      <div class="right">
        <time class="time" datetime={now.toISOString()}>{timeText}</time>
        <div class="date">{dateText}</div>
        <div class="weather-line">
          <span class="temp">{tempLabel}</span>
          <span class="dot">·</span>
          <span class="cond">{conditionShort}</span>
        </div>
      </div>
    </div>

    <div class="rule" aria-hidden="true"></div>

    <div class="ticker" aria-label="News ticker">
      <div class="ticker-tag">Weekly Outlook</div>
      <div class="ticker-strip">
        <div class="ticker-track">
          {#each [0, 1] as i (i)}
            <div class="ticker-loop" aria-hidden={i === 1}>
              {#each tickerItems as item, idx (idx)}
                <span class="t-item" data-kind={item.kind}>{item.text}</span>
                <span class="t-sep" aria-hidden="true">◆</span>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </div>
  </header>
</BaseTile>

<style>
  .eh {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    position: relative;
    color: var(--fg);
    font-family: 'Fraunces', Georgia, serif;
  }

  /* Masthead is intrinsic-height — does not flex-grow. The rule +
   * ticker hug right beneath it so there's no dead air between the
   * brand and the scrolling strip. */
  .masthead {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: start;
    min-height: 0;
  }

  .left {
    padding: 0.3rem 0 0.35rem 0.7rem;
  }
  .right {
    padding: 0.3rem 0.7rem 0.35rem 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    text-align: right;
    line-height: 1;
    gap: 0.32rem;
  }

  .kicker {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 400;
    font-size: 0.65rem;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: var(--dim);
    margin-bottom: 0.4rem;
    font-feature-settings: 'tnum';
  }
  .kicker .flip {
    display: inline-block;
    transition: opacity 400ms ease;
  }

  .brand {
    font-weight: 700;
    font-style: italic;
    font-size: clamp(2.2rem, 6.2vw, 3.6rem);
    letter-spacing: -0.012em;
    line-height: 0.92;
    margin: 0;
    /* Slight optical kerning fix for italic Fraunces "T" */
    text-indent: -0.02em;
  }
  .brand .tail {
    color: var(--accent);
  }

  .time {
    font-weight: 700;
    font-style: italic;
    font-size: clamp(1.7rem, 4.8vw, 2.8rem);
    letter-spacing: -0.005em;
    font-variant-numeric: tabular-nums;
    color: var(--fg);
    line-height: 1;
  }
  .date {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(0.85rem, 1.6vw, 1.05rem);
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--fg);
    font-feature-settings: 'tnum';
  }
  .weather-line {
    display: flex;
    align-items: baseline;
    gap: 0.5em;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(0.85rem, 1.6vw, 1.05rem);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-feature-settings: 'tnum';
  }
  .weather-line .temp {
    color: var(--accent);
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .weather-line .dot {
    color: var(--dimmer);
    letter-spacing: 0;
  }
  .weather-line .cond {
    color: var(--dim);
  }

  /* NYT-style triple ornamental rule between masthead and ticker.
   * Hairline + thick + hairline — printed feel. Spans full bleed. */
  .rule {
    flex: none;
    height: 5px;
    background:
      linear-gradient(
        to bottom,
        var(--fg) 0,
        var(--fg) 1px,
        transparent 1px,
        transparent 2px,
        var(--fg) 2px,
        var(--fg) 4px,
        transparent 4px,
        transparent 5px
      );
    /* Fade ends so the rule reads as a typeset element, not a hard
     * sealing edge. Subtle but matches real broadsheet composition. */
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0,
      black 4%,
      black 96%,
      transparent 100%
    );
    mask-image: linear-gradient(
      to right,
      transparent 0,
      black 4%,
      black 96%,
      transparent 100%
    );
  }

  /* News-channel scrolling ticker. Pinned tag on the left ("WEEKLY
   * OUTLOOK") + endless marquee strip. Two duplicate loops in the
   * track give a seamless wrap as it translates -50%. */
  .ticker {
    flex: none;
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: stretch;
    height: clamp(1.6rem, 3.2vw, 2.2rem);
    border-bottom: 1px solid var(--line);
    background: transparent;
    overflow: hidden;
  }
  .ticker-tag {
    display: flex;
    align-items: center;
    padding: 0 1rem;
    background: var(--accent);
    color: #000;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: clamp(0.6rem, 1.2vw, 0.78rem);
    letter-spacing: 0.18em;
    text-transform: uppercase;
    white-space: nowrap;
    /* Slanted right edge — broadcast lower-third feel */
    clip-path: polygon(0 0, 100% 0, calc(100% - 0.7rem) 100%, 0 100%);
    padding-right: 1.5rem;
  }
  .ticker-strip {
    overflow: hidden;
    position: relative;
    /* Edge fade so text doesn't pop into existence at the right edge */
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0,
      black 2%,
      black 98%,
      transparent 100%
    );
    mask-image: linear-gradient(
      to right,
      transparent 0,
      black 2%,
      black 98%,
      transparent 100%
    );
  }
  .ticker-track {
    display: inline-flex;
    align-items: center;
    height: 100%;
    white-space: nowrap;
    animation: ticker-scroll 60s linear infinite;
    will-change: transform;
  }
  .ticker-loop {
    display: inline-flex;
    align-items: center;
    padding-left: 1.2rem;
  }
  .t-item {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: clamp(0.7rem, 1.4vw, 0.95rem);
    letter-spacing: 0.08em;
    color: var(--fg);
    font-feature-settings: 'tnum';
  }
  .t-item[data-kind='alert'] {
    color: var(--bad, #c95a4a);
    font-weight: 700;
  }
  .t-item[data-kind='event'] {
    color: var(--accent);
  }
  .t-sep {
    margin: 0 1.4rem;
    color: var(--accent);
    font-size: 0.55rem;
    transform: translateY(-1px);
  }

  @keyframes ticker-scroll {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(-50%);
    }
  }

  /* Pause on hover — useful for dev-poking, harmless on mirror. */
  .ticker-strip:hover .ticker-track {
    animation-play-state: paused;
  }
</style>
