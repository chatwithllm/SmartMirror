<script lang="ts">
  /**
   * Header bar with a tag pill on the left + a horizontally-scrolling
   * marquee on the right. Same pattern as CameraGridCard's notification
   * ticker — extracted for reuse across editorial cards.
   *
   * Items rendered twice and translated -50% so the loop is seamless.
   */
  interface Props {
    tag: string;
    items: string[];
    /** Animation duration in seconds. Slower = calmer. */
    durationSec?: number;
    /** Optional accent override (defaults to var(--accent)). */
    accent?: string;
    /** Optional font-family override for the running text. */
    fontFamily?: string;
  }
  let { tag, items, durationSec = 40, accent, fontFamily }: Props = $props();

  const safeItems = $derived(items.length > 0 ? items : ['—']);
  const styleVar = $derived(
    [
      `--ticker-duration: ${durationSec}s`,
      accent ? `--ticker-accent: ${accent}` : '',
      fontFamily ? `--ticker-font: ${fontFamily}` : ''
    ]
      .filter(Boolean)
      .join('; ') + ';'
  );
</script>

<header class="head" style={styleVar}>
  <div class="tag">{tag}</div>
  <div class="ticker">
    <div class="ticker-track">
      {#each [0, 1] as loop (loop)}
        <div class="ticker-loop" aria-hidden={loop === 1}>
          {#each safeItems as item, idx (idx)}
            <span class="t-item">{item}</span>
            <span class="t-sep" aria-hidden="true">◆</span>
          {/each}
        </div>
      {/each}
    </div>
  </div>
</header>

<style>
  .head {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: stretch;
    height: 1.4rem;
    margin-bottom: 0.5rem;
    overflow: hidden;
    border-bottom: 1px solid var(--line);
  }
  .tag {
    display: flex;
    align-items: center;
    padding: 0 1.2rem 0 0.9rem;
    background: var(--ticker-accent, var(--accent));
    color: #000;
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 700;
    font-size: 0.62rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    white-space: nowrap;
    clip-path: polygon(0 0, 100% 0, calc(100% - 0.55rem) 100%, 0 100%);
  }
  .ticker {
    overflow: hidden;
    position: relative;
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0,
      black 3%,
      black 97%,
      transparent 100%
    );
    mask-image: linear-gradient(
      to right,
      transparent 0,
      black 3%,
      black 97%,
      transparent 100%
    );
  }
  .ticker-track {
    display: inline-flex;
    align-items: center;
    height: 100%;
    white-space: nowrap;
    animation: ed-ticker-scroll var(--ticker-duration, 40s) linear infinite;
    will-change: transform;
  }
  .ticker-loop {
    display: inline-flex;
    align-items: center;
    padding-left: 1rem;
  }
  .t-item {
    font-family: var(--ticker-font, 'Fraunces', Georgia, serif);
    font-style: italic;
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    color: var(--fg);
  }
  .t-sep {
    margin: 0 1rem;
    color: var(--ticker-accent, var(--accent));
    font-size: 0.5rem;
    transform: translateY(-1px);
  }
  @keyframes ed-ticker-scroll {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
</style>
