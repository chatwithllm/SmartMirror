<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Scene {
    id: string;
    name: string;
    palette: [string, string];
  }

  interface Props {
    id: string;
    props?: { active?: string; demo?: Scene[] };
  }

  let { id, props = {} }: Props = $props();
  const scenes: Scene[] = $derived(
    props.demo ?? [
      { id: '1', name: 'Sunset', palette: ['#ffb454', '#ff6b6b'] },
      { id: '2', name: 'Forest', palette: ['#6ee7a7', '#58a4ff'] },
      { id: '3', name: 'Cinema', palette: ['#b887ff', '#151723'] },
      { id: '4', name: 'Focus', palette: ['#ffffff', '#58a4ff'] },
      { id: '5', name: 'Sleep', palette: ['#1a1a22', '#ff87c3'] }
    ]
  );

  let activeId = $state(props.active ?? '1');

  function setScene(s: Scene) {
    activeId = s.id;
    try {
      window.dispatchEvent(
        new CustomEvent('mirror:scene', { detail: { id, scene: s.id, name: s.name } })
      );
    } catch {
      /* ignore */
    }
  }
</script>

<BaseTile {id} type="ambient_scenes" label="Scenes">
  <div class="as" data-testid="scenes">
    <h4 class="mono">Scenes</h4>
    <div class="grid">
      {#each scenes as s (s.id)}
        <button
          class:active={activeId === s.id}
          onclick={() => setScene(s)}
          data-testid={`scene-${s.id}`}
        >
          <div
            class="swatch"
            style:background={`linear-gradient(135deg, ${s.palette[0]}, ${s.palette[1]})`}
          ></div>
          <span class="name mono">{s.name}</span>
        </button>
      {/each}
    </div>
  </div>
</BaseTile>

<style>
  .as {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    height: 100%;
  }
  h4 {
    color: var(--dim);
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: 6px;
  }
  button {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 6px;
    cursor: pointer;
    color: var(--fg);
  }
  button.active {
    border-color: var(--accent);
    box-shadow: 0 0 10px rgba(94, 173, 255, 0.2);
  }
  .swatch {
    width: 100%;
    aspect-ratio: 2 / 1;
    border-radius: var(--radius-sm);
  }
  .name {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
</style>
