<script lang="ts">
  // Phone-friendly camera-slot binding page. Reachable by scanning the
  // QR code rendered in an unbound CameraGridCard cell. Lists every
  // HA camera.* entity (with snapshot thumb) and lets the user tap one
  // to bind it to this slot. Server hands the choice to HA via
  // input_text.mirror_camera_slot_N, and the kiosk swaps the cell from
  // QR to a live FrigateCameraTile within ~10s.
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  interface Camera {
    entity_id: string;
    friendly_name: string;
    snapshot_url: string | null;
  }

  let cameras = $state<Camera[]>([]);
  let loading = $state(true);
  let errMsg = $state<string | null>(null);
  let saving = $state(false);
  let savedAs = $state<string | null>(null);

  const slot = $derived(Number($page.params.slot ?? '0'));

  async function load() {
    try {
      const r = await fetch('/api/setup/cameras', { cache: 'no-store' });
      if (!r.ok) {
        errMsg = `HA fetch failed (${r.status})`;
        return;
      }
      const j = (await r.json()) as { cameras: Camera[] };
      cameras = j.cameras;
    } catch (e) {
      errMsg = String(e);
    } finally {
      loading = false;
    }
  }

  async function bind(entity_id: string) {
    saving = true;
    errMsg = null;
    try {
      const r = await fetch('/api/setup/camera-binding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slot, entity_id })
      });
      if (!r.ok) {
        errMsg = `bind failed (${r.status})`;
        return;
      }
      savedAs = entity_id;
    } catch (e) {
      errMsg = String(e);
    } finally {
      saving = false;
    }
  }

  async function clearSlot() {
    await bind('');
  }

  onMount(load);
</script>

<svelte:head>
  <title>Bind Camera Slot {slot}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<main>
  <header>
    <div class="kicker">— Mirror Setup —</div>
    <h1>Camera Slot <span>{slot}</span></h1>
    <p class="hint">Pick the HA camera entity to bind to this slot.</p>
  </header>

  {#if errMsg}
    <p class="err">{errMsg}</p>
  {/if}

  {#if savedAs !== null}
    <p class="ok">
      {#if savedAs === ''}
        Slot cleared. Mirror will revert to QR placeholder.
      {:else}
        Bound to <code>{savedAs}</code>. Mirror will swap to the live feed within ~10s.
      {/if}
    </p>
  {/if}

  {#if loading}
    <p class="loading">Loading camera list…</p>
  {:else if cameras.length === 0}
    <p class="empty">No camera.* entities found in HA.</p>
  {:else}
    <ul class="cams">
      {#each cameras as cam (cam.entity_id)}
        <li>
          <button onclick={() => bind(cam.entity_id)} disabled={saving}>
            {#if cam.snapshot_url}
              <img src={cam.snapshot_url} alt={cam.friendly_name} loading="lazy" />
            {:else}
              <div class="thumb-empty">no preview</div>
            {/if}
            <div class="meta">
              <div class="name">{cam.friendly_name}</div>
              <div class="id">{cam.entity_id}</div>
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="actions">
    <button class="clear" onclick={clearSlot} disabled={saving}>Clear slot</button>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #0a0a0a;
    color: #f4ece0;
    font-family: 'Fraunces', Georgia, serif;
  }
  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 1.5rem 1rem 3rem;
  }
  header { margin-bottom: 1.5rem; }
  .kicker {
    font-style: italic;
    font-size: 0.65rem;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: #8a8175;
    margin-bottom: 0.4rem;
  }
  h1 {
    font-style: italic;
    font-weight: 700;
    font-size: 2rem;
    margin: 0 0 0.4rem;
    line-height: 1.05;
  }
  h1 span { color: #d8b36b; }
  .hint { font-style: italic; color: #b5a99a; font-size: 0.95rem; margin: 0; }
  .err { color: #c95a4a; font-style: italic; }
  .ok {
    background: rgba(216, 179, 107, 0.12);
    border-left: 3px solid #d8b36b;
    padding: 0.7rem 0.9rem;
    font-style: italic;
  }
  .ok code {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-style: normal;
    font-size: 0.8rem;
    color: #d8b36b;
  }
  .loading, .empty { font-style: italic; color: #b5a99a; padding: 1rem 0; }
  .cams { list-style: none; padding: 0; margin: 1rem 0 0; display: flex; flex-direction: column; gap: 0.7rem; }
  .cams button {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 0.9rem;
    padding: 0.6rem;
    background: #15120e;
    border: 1px solid #2c2720;
    border-radius: 4px;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }
  .cams button:active { transform: scale(0.99); }
  .cams button[disabled] { opacity: 0.5; }
  .cams img, .thumb-empty {
    width: 5rem;
    height: 3rem;
    object-fit: cover;
    background: #050505;
    border-radius: 2px;
    flex: none;
  }
  .thumb-empty {
    display: flex; align-items: center; justify-content: center;
    font-size: 0.55rem;
    color: #6e6458;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .meta { min-width: 0; flex: 1; }
  .name { font-style: italic; font-size: 1rem; line-height: 1.15; }
  .id {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.72rem;
    color: #8a8175;
    margin-top: 0.2rem;
    word-break: break-all;
  }
  .actions { margin-top: 2rem; }
  .clear {
    width: 100%;
    padding: 0.7rem;
    background: transparent;
    color: #c95a4a;
    border: 1px solid #c95a4a;
    border-radius: 4px;
    font-style: italic;
    cursor: pointer;
  }
</style>
