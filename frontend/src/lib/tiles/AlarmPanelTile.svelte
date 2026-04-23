<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  type ArmState = 'disarmed' | 'home' | 'away' | 'night';

  interface Props {
    id: string;
    props?: { entity_id?: string; demo?: ArmState };
  }

  let { id, props = {} }: Props = $props();

  let state = $state<ArmState>(props.demo ?? 'disarmed');

  function setArm(s: ArmState) {
    state = s;
    // Phase 13 will wire this to hass.callService. Dispatch a DOM event so
    // integration tests can observe the intent.
    try {
      window.dispatchEvent(
        new CustomEvent('mirror:alarm_arm', { detail: { id, to: s } })
      );
    } catch {
      /* ignore */
    }
  }

  const modes: ArmState[] = ['home', 'away', 'night', 'disarmed'];
  const label = $derived(
    state === 'disarmed' ? 'Disarmed' : `Armed · ${state.toUpperCase()}`
  );
</script>

<BaseTile {id} type="alarm_panel" label="Alarm">
  <div class="ap" data-testid="alarm-panel">
    <div class="state s-{state}" data-testid="alarm-state">{label}</div>
    <div class="modes">
      {#each modes as m (m)}
        <button
          class:active={state === m}
          onclick={() => setArm(m)}
          data-testid={`arm-${m}`}
        >{m}</button>
      {/each}
    </div>
  </div>
</BaseTile>

<style>
  .ap {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    height: 100%;
    justify-content: center;
  }
  .state {
    font-size: 1.5rem;
    font-weight: 500;
    letter-spacing: 0.02em;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--panel-2);
    text-align: center;
  }
  .s-disarmed {
    color: var(--ok);
    border: 1px solid var(--ok);
  }
  .s-home,
  .s-away,
  .s-night {
    color: var(--bad);
    border: 1px solid var(--bad);
    box-shadow: inset 0 0 18px rgba(255, 107, 107, 0.2);
  }
  .modes {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
  button {
    background: var(--panel-2);
    border: 1px solid var(--line);
    color: var(--fg);
    border-radius: var(--radius-sm);
    padding: 6px 0;
    font-family: var(--font-mono);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    cursor: pointer;
  }
  button.active {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
