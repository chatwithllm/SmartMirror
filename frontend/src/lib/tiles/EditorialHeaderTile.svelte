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
  import { onDestroy, onMount, untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import BaseTile from './BaseTile.svelte';
  import { watchEntity, type HaEntity } from '$lib/ha/entity.js';
  import { currentPhase, type Phase } from '$lib/phase/clock.js';
  import { weatherIcon } from '$lib/weather/icons.js';
  import { wordForHour, quoteForHour } from '$lib/words/index.js';

  type ValueFormat = 'number' | 'relative' | 'percent_pace';
  interface KpiSpec {
    entityId: string;
    label: string;
    suffix?: string;
    valueFormat?: ValueFormat;
    /** When true, value text colored by 25% bucket of numeric state.
     *  0-25 ok / 25-50 accent / 50-75 warn / 75-100 bad. */
    bucketize?: boolean;
  }

  interface Props {
    id: string;
    props?: {
      title?: string;
      weatherEntity?: string;
      units?: 'metric' | 'imperial';
      locale?: string;
      kpis?: KpiSpec[];
    };
  }

  let { id, props = {} }: Props = $props();

  const title = $derived(props.title ?? 'The Mirror Daily');
  const units = $derived(props.units ?? 'imperial');
  const locale = $derived(props.locale ?? 'en-GB');
  const kpis = $derived<KpiSpec[]>(props.kpis ?? []);

  // KPI watchers — set up in onMount (NOT $effect) to avoid the same
  // sync-subscribe-in-reactive-context loop that earlier broke
  // KpiStripTile / CameraGridCard.
  let kpiEntities = $state<Record<string, HaEntity | null>>({});
  let kpiStops: Array<() => void> = [];
  onMount(() => {
    const snapshot = untrack(() => kpis);
    const ids = new Set<string>();
    for (const k of snapshot) ids.add(k.entityId);
    for (const id of ids) {
      const w = watchEntity(id, 60_000);
      const unsub = w.store.subscribe((e) => {
        kpiEntities = { ...kpiEntities, [id]: e };
      });
      kpiStops.push(() => {
        unsub();
        w.stop();
      });
    }
  });
  onDestroy(() => {
    for (const stop of kpiStops) stop();
    kpiStops = [];
  });

  function fmtKpiRelative(iso: string): string {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return iso;
    const ms = t - Date.now();
    if (ms <= 0) return 'now';
    const min = Math.round(ms / 60_000);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    const rest = min % 60;
    if (hr < 24) return rest === 0 ? `${hr}h` : `${hr}h ${rest}m`;
    return `${Math.floor(hr / 24)}d`;
  }
  // Bar fill fraction in [0, 1]. Maps each value type to a 0-100% scale:
  //   bucketize/percent → raw percent
  //   percent_pace      → |pace| / 100 (closer to budget = bigger bar)
  //   relative          → time remaining vs a sensible window (5h for
  //                       session, 7d for weekly — sniffed from label)
  function kpiFraction(spec: KpiSpec): number {
    const e = kpiEntities[spec.entityId];
    if (!e) return 0;
    const raw = e.state;
    if (raw == null || raw === 'unknown' || raw === 'unavailable') return 0;
    if (spec.valueFormat === 'relative') {
      const t = Date.parse(raw);
      if (!Number.isFinite(t)) return 0;
      const minLeft = Math.max(0, (t - Date.now()) / 60_000);
      const isWeekly = /week/i.test(spec.label ?? '');
      const windowMin = isWeekly ? 7 * 24 * 60 : 5 * 60;
      return Math.min(1, minLeft / windowMin);
    }
    if (spec.valueFormat === 'percent_pace') {
      const n = Number(raw);
      if (!Number.isFinite(n)) return 0;
      return Math.min(1, Math.abs(n) / 100);
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n / 100));
  }

  // 4-bucket color band. For % values: bigger = worse (more usage).
  // For "time remaining" / "pace" the semantics flip — bucket inverts.
  function kpiBucket(spec: KpiSpec): 'ok' | 'accent' | 'warn' | 'bad' {
    const f = kpiFraction(spec);
    // For relative-time / pace, more headroom = better. Invert so
    // "lots of time left" = ok, "running out" = bad.
    const inverted =
      spec.valueFormat === 'relative' || spec.valueFormat === 'percent_pace';
    const score = inverted ? 1 - f : f;
    if (score < 0.25) return 'ok';
    if (score < 0.5) return 'accent';
    if (score < 0.75) return 'warn';
    return 'bad';
  }

  function fmtKpiValue(spec: KpiSpec): string {
    const e = kpiEntities[spec.entityId];
    if (!e) return '—';
    const raw = e.state;
    if (raw === 'unknown' || raw === 'unavailable' || raw == null) return '—';
    if (spec.valueFormat === 'relative') return fmtKpiRelative(raw);
    if (spec.valueFormat === 'percent_pace') {
      const n = Number(raw);
      if (!Number.isFinite(n)) return raw;
      return `${n >= 0 ? '+' : ''}${Math.round(n)}%`;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    const rounded = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
    return `${rounded}${spec.suffix ?? ''}`;
  }

  // Time tick — 1s. Cheap; this tile is mounted once.
  let now = $state(new Date());
  let timer: ReturnType<typeof setInterval> | null = null;
  onMount(() => {
    timer = setInterval(() => (now = new Date()), 1000);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  // Word + quote of the hour. Derived against the hour bucket only —
  // value reference stays stable across the 3,599 intra-hour ticks so
  // the {#key} block doesn't replay the fade every second.
  const hourBucket = $derived(
    new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000)
  );
  const word = $derived(wordForHour(hourBucket));
  const quote = $derived(quoteForHour(hourBucket));

  let wordRowEl: HTMLDivElement | null = $state(null);

  // Sweep highlight across the whole masthead row on each word-of-hour
  // rotation. Visual cue that the "edition" just refreshed. Single
  // play, ~2.4s, then clears itself.
  let sweepActive = $state(false);
  let lastSweepWord = '';
  $effect(() => {
    const cur = word.word;
    if (cur === lastSweepWord) return;
    lastSweepWord = cur;
    sweepActive = true;
    const t = setTimeout(() => (sweepActive = false), 2400);
    return () => clearTimeout(t);
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

  // Tail-of-title mood — drives the "Daily" word's color via [data-mood].
  // Thresholds in imperial: very hot ≥ 90°F, very cold ≤ 32°F, very
  // windy ≥ 20 mph. Falls back to the editorial gold (accent) otherwise.
  type WeatherMood = 'hot' | 'cold' | 'freezing' | 'windy' | 'normal';

  // Dev-only mood cycler. Visit /?moodCycle=1 to rotate through all
  // four states every 4s for visual QA. Removed from prod by URL gate.
  let moodCycleIdx = $state(0);
  let moodCycleEnabled = $state(false);
  $effect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('moodCycle') !== '1') return;
    moodCycleEnabled = true;
    const id = setInterval(() => {
      moodCycleIdx = (moodCycleIdx + 1) % 5;
    }, 4000);
    return () => clearInterval(id);
  });

  const weatherMood = $derived.by((): WeatherMood => {
    if (moodCycleEnabled) {
      const cycle: WeatherMood[] = ['normal', 'hot', 'cold', 'freezing', 'windy'];
      return cycle[moodCycleIdx];
    }
    return computeWeatherMood();
  });

  function computeWeatherMood(): WeatherMood {
    if (!haEntity) return 'normal';
    const a = haEntity.attributes as {
      temperature?: number;
      temperature_unit?: string;
      wind_speed?: number;
      wind_speed_unit?: string;
    };
    const tempF =
      typeof a.temperature === 'number'
        ? a.temperature_unit === '°C'
          ? (a.temperature * 9) / 5 + 32
          : a.temperature
        : null;
    let windMph: number | null = null;
    if (typeof a.wind_speed === 'number') {
      const unit = a.wind_speed_unit ?? 'mph';
      if (unit === 'km/h') windMph = a.wind_speed * 0.6214;
      else if (unit === 'm/s') windMph = a.wind_speed * 2.2369;
      else windMph = a.wind_speed; // mph or unspecified
    }
    if (tempF != null && tempF >= 90) return 'hot';
    if (tempF != null && tempF <= 32) return 'freezing';
    if (tempF != null && tempF < 65) return 'cold';
    if (windMph != null && windMph >= 20) return 'windy';
    return 'normal';
  }

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
  let reducedMotion = $state(false);

  $effect(() => {
    // Browser-only: window.matchMedia + setInterval are unsafe in SSR.
    if (typeof window === 'undefined') return;

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = mq.matches;
    let timer: ReturnType<typeof setInterval> | null = null;

    function startFlip() {
      if (timer) return;
      timer = setInterval(() => (flipIdx = flipIdx === 0 ? 1 : 0), 8000);
    }
    function stopFlip() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    if (!reducedMotion) startFlip();

    const onChange = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
      if (e.matches) stopFlip();
      else startFlip();
    };
    mq.addEventListener('change', onChange);

    return () => {
      mq.removeEventListener('change', onChange);
      stopFlip();
    };
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

  // Modern HA weather entities don't expose forecast as a state
  // attribute anymore — it's fetched via the weather/get_forecasts
  // service. Poll every 30 min and store the response so the ticker
  // can render a real 7-day strip instead of "Weekly outlook
  // unavailable".
  interface ForecastDay {
    datetime: string;
    temperature: number;
    templow?: number;
    condition: string;
    precipitation?: number;
  }
  let serviceForecast = $state<ForecastDay[]>([]);
  let forecastTimer: ReturnType<typeof setInterval> | null = null;

  async function fetchForecast(): Promise<void> {
    if (!props.weatherEntity) return;
    try {
      const r = await fetch(
        '/api/ha/api/services/weather/get_forecasts?return_response',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ entity_id: props.weatherEntity, type: 'daily' })
        }
      );
      if (!r.ok) return;
      const j = (await r.json()) as {
        service_response?: Record<string, { forecast?: ForecastDay[] }>;
      };
      const fc = j.service_response?.[props.weatherEntity]?.forecast ?? [];
      serviceForecast = fc.slice(0, 7);
    } catch {
      /* swallow — keep last known forecast */
    }
  }

  $effect(() => {
    forecastTimer && clearInterval(forecastTimer);
    serviceForecast = [];
    if (!props.weatherEntity) return;
    void fetchForecast();
    // 30 min cadence — daily forecast doesn't change fast.
    forecastTimer = setInterval(fetchForecast, 30 * 60 * 1000);
  });
  onDestroy(() => {
    if (forecastTimer) clearInterval(forecastTimer);
  });

  const weatherForecast = $derived.by((): { day: string; tempC: number; cond: string; icon: string }[] => {
    // 1. Live HA service response (preferred).
    if (serviceForecast.length > 0) {
      const isF = (haEntity?.attributes as { temperature_unit?: string } | undefined)?.temperature_unit === '°F';
      return serviceForecast.map((f) => ({
        day: new Date(f.datetime).toLocaleDateString('en-GB', { weekday: 'short' }),
        // forecast temps come back in the entity's native units.
        // Normalize to Celsius internally; ticker re-formats per `units`.
        tempC: isF ? ((f.temperature - 32) * 5) / 9 : f.temperature,
        cond: f.condition
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        icon: weatherIcon(f.condition)
      }));
    }
    // 2. Demo fallback so the ticker has motion before the first
    //    service call returns (or when HA env isn't wired).
    if (!haEntity) {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const conds = ['sunny', 'partlycloudy', 'cloudy', 'rainy', 'sunny', 'sunny', 'cloudy'];
      const temps = [18, 20, 17, 14, 19, 22, 16];
      return days.map((d, i) => ({
        day: d,
        tempC: temps[i],
        cond: conds[i].replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        icon: weatherIcon(conds[i])
      }));
    }
    return [];
  });

  const tickerItems = $derived.by((): TickerItem[] => {
    // Eventually: pull HA notifications + calendar here, prepend.
    const wkLabel = units === 'imperial' ? '°F' : '°C';
    const fmtT = (c: number) =>
      units === 'imperial' ? Math.round((c * 9) / 5 + 32) : Math.round(c);
    const items: TickerItem[] = weatherForecast.map((f) => ({
      kind: 'weather',
      text: `${f.icon}  ${f.day.toUpperCase()} ${fmtT(f.tempC)}${wkLabel} ${f.cond}`
    }));
    return items.length
      ? items
      : [{ kind: 'weather', text: 'Weekly outlook unavailable' }];
  });
</script>

<BaseTile {id} type="editorial_header" chromeless={true} label={title}>
  <header class="eh">
    <div class="masthead" class:sweep={sweepActive}>
      <div class="left">
        <div class="kicker">
          {#key edition}
            <span class="flip" in:fade={{ duration: 400 }} out:fade={{ duration: 400 }}>— {edition} —</span>
          {/key}
        </div>
        <h1 class="brand" data-mood={weatherMood}>
          <span class="lead">{split.lead}</span>{#if split.tail}<span class="tail" title="{weatherMood !== 'normal' ? `Weather: ${weatherMood}` : ''}"> {split.tail}</span>{/if}
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

    {#if kpis.length > 0}
      <div class="kpi-row">
        {#each kpis as k (k.entityId)}
          {@const bucket = kpiBucket(k)}
          {@const frac = kpiFraction(k)}
          <div
            class="kpi"
            data-bucket={bucket}
            style="--kpi-pct: {(frac * 100).toFixed(1)}%"
          >
            <div class="kpi-fill" aria-hidden="true"></div>
            <div class="kpi-content">
              <div class="kpi-lbl">{k.label}</div>
              <div class="kpi-val">{fmtKpiValue(k)}</div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <div class="word-row" bind:this={wordRowEl}>
      {#key word.word}
        <span class="word-block" in:fade={{ duration: 600 }}>
          <span class="word-term">{word.word}</span>
          {#if word.pos}<span class="word-pos">{word.pos}</span>{/if}
          <span class="word-sep" aria-hidden="true">·</span>
          <span class="word-def">{word.def}</span>
        </span>
      {/key}
      {#if quote.q}
        <span class="quote-divider" aria-hidden="true">◆</span>
        {#key quote.q}
          <span class="quote-block" in:fade={{ duration: 600 }}>
            <span class="quote-mark" aria-hidden="true">“</span>
            <span class="quote-text">{quote.q}</span>
            <span class="quote-mark" aria-hidden="true">”</span>
            <span class="quote-by">— {quote.by}</span>
          </span>
        {/key}
      {/if}
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

  /* Sweep overlay — scoped to the masthead row (brand + clock) only.
   * A bright diagonal band travels left → right once when the word-of-
   * hour rotates. `screen` blend mode lightens whatever's underneath
   * including text glyphs so 'The Mirror Daily' and the clock visibly
   * brighten as the band passes. Ticker / KPI / word strips below are
   * unaffected. */
  .masthead {
    position: relative;
    overflow: hidden;
  }
  .masthead::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      105deg,
      transparent 0%,
      transparent 30%,
      rgba(255, 245, 220, 0.12) 40%,
      rgba(255, 250, 235, 0.55) 50%,
      rgba(255, 245, 220, 0.12) 60%,
      transparent 70%,
      transparent 100%
    );
    transform: translateX(-110%);
    opacity: 0;
    mix-blend-mode: screen;
    z-index: 50;
    filter: blur(0.6px);
  }
  .masthead.sweep::before {
    animation: mh-sweep 2.6s cubic-bezier(0.22, 0.61, 0.36, 1);
  }
  .masthead.sweep {
    animation: mh-sweep-lift 2.6s cubic-bezier(0.22, 0.61, 0.36, 1);
  }
  @keyframes mh-sweep {
    0%   { transform: translateX(-110%); opacity: 0; }
    8%   { opacity: 1; }
    88%  { opacity: 1; }
    100% { transform: translateX(110%); opacity: 0; }
  }
  @keyframes mh-sweep-lift {
    0%, 100% { filter: brightness(1); }
    50%      { filter: brightness(1.12); }
  }
  @media (prefers-reduced-motion: reduce) {
    .masthead.sweep::before,
    .masthead.sweep { animation: none; }
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
    /* Allow stacked in/out transition spans to overlap during the fade */
    position: relative;
    white-space: nowrap;
  }
  .kicker .flip {
    display: inline-block;
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
    color: var(--tail-color, var(--accent));
    transition: color 600ms ease;
  }
  /* Tail flips color when the weather is extreme. Gives the masthead
   * a glance-level "today is hot / cold / windy" signal without a
   * dedicated badge. Subtle text-shadow on the colored states pops
   * the word on dark bg. */
  .brand[data-mood='hot']      { --tail-color: #e85a30; }
  .brand[data-mood='cold']     { --tail-color: #6aa3d4; }
  .brand[data-mood='freezing'] { --tail-color: #b8d9ec; }
  .brand[data-mood='windy']    { --tail-color: #87a876; }
  .brand[data-mood='hot']      .tail,
  .brand[data-mood='cold']     .tail,
  .brand[data-mood='freezing'] .tail,
  .brand[data-mood='windy']    .tail {
    text-shadow: 0 0 14px color-mix(in srgb, var(--tail-color) 35%, transparent);
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

  /* KPI row — sits directly under the Weekly Outlook ticker as a
   * fixed strip inside the masthead tile. Not a separate tile, not
   * resizable. Each KPI is now a progress bar: a faint bucket-tinted
   * fill behind the label/value showing where the value lands on its
   * 0-100% scale. */
  .kpi-row {
    flex: none;
    display: flex;
    justify-content: space-between;
    align-items: stretch;
    gap: 0.5rem;
    padding: 0.35rem 0.7rem 0.4rem;
    border-bottom: 1px solid var(--line);
    overflow: hidden;
  }
  .kpi {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    padding: 0.25rem 0.55rem;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--panel, transparent);
    overflow: hidden;
    /* Bucket color resolved per pill — drives fill + value text. */
    --kpi-color: var(--accent, #d8b36b);
  }
  .kpi[data-bucket='ok']     { --kpi-color: var(--ok,    #87a876); }
  .kpi[data-bucket='accent'] { --kpi-color: var(--accent,#d8b36b); }
  .kpi[data-bucket='warn']   { --kpi-color: var(--warn,  #c89854); }
  .kpi[data-bucket='bad']    { --kpi-color: var(--bad,   #c95a4a); }

  /* Faint bucket-colored fill — alpha low enough that text stays
   * legible across the boundary. A 2px solid right edge marks the
   * progress endpoint crisply. */
  .kpi-fill {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: var(--kpi-pct, 0%);
    background: var(--kpi-color);
    opacity: 0.22;
    border-right: 2px solid var(--kpi-color);
    transition: width 400ms ease, opacity 400ms ease;
    pointer-events: none;
  }

  .kpi-content {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: auto auto;
    column-gap: 0.5rem;
    align-items: baseline;
  }
  .kpi-lbl {
    font-style: italic;
    font-size: 0.55rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    /* Anthropic Claude brand orange — labels read as the "Claude
     * channel" without the brighter values having to inherit it. */
    color: #cc785c;
    line-height: 1;
    white-space: nowrap;
    /* Subtle shadow so the label reads over any fill color. */
    text-shadow: 0 0 6px var(--bg, transparent);
  }
  .kpi-val {
    font-style: italic;
    font-weight: 700;
    font-size: 1rem;
    color: var(--kpi-color);
    font-feature-settings: 'tnum';
    line-height: 1;
    white-space: nowrap;
    transition: color 400ms ease;
    /* Same shadow keeps the saturated bucket text legible where it
     * crosses the bucket-tinted fill. */
    text-shadow: 0 0 6px var(--bg, transparent);
  }

  /* Word of the Hour — sits directly under the KPI row inside the
   * masthead. Single line, editorial typography. Rotates hourly. */
  .word-row {
    flex: none;
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    padding: 0.35rem 0.7rem 0.45rem;
    overflow: hidden;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  .word-block {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .word-term {
    /* Term itself stays Fraunces — it's the editorial accent. */
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 1rem;
    color: var(--accent);
    letter-spacing: 0.01em;
  }
  .word-pos {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 0.7rem;
    color: var(--dimmer);
    letter-spacing: 0.04em;
  }
  .word-sep {
    color: var(--dimmer);
    font-size: 0.7rem;
  }
  .word-def {
    font-family: 'Fraunces', Georgia, serif;
    font-style: normal;
    font-weight: 450;
    font-size: 0.78rem;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  /* Quote half — fades alongside the word every hour. Truncates with
   * ellipsis when it can't fit. */
  .quote-divider {
    color: var(--dimmer);
    font-size: 0.55rem;
    flex: 0 0 auto;
  }
  .quote-block {
    display: inline-flex;
    align-items: baseline;
    gap: 0.25rem;
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .quote-mark {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 0.95rem;
    color: var(--accent);
    line-height: 0.6;
  }
  .quote-text {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 400;
    font-size: 0.75rem;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .quote-by {
    font-family: 'Fraunces', Georgia, serif;
    font-style: normal;
    font-weight: 500;
    font-size: 0.65rem;
    color: var(--dim);
    letter-spacing: 0.02em;
    white-space: nowrap;
    flex: 0 0 auto;
  }
</style>
