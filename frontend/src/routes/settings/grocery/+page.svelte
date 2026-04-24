<script lang="ts">
  interface Props {
    data: { mode: 'key' | 'session' | 'none'; ok: boolean; cleared: boolean };
  }
  let { data }: Props = $props();
</script>

<svelte:head>
  <title>mirror · grocery key</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
</svelte:head>

<main>
  <h1>grocery key</h1>
  <p class="sub">paste the API key from your grocery app</p>

  <div class="status status-{data.mode}">
    current auth: <b>{data.mode}</b>
  </div>

  <form method="POST" action="?/save" autocomplete="off">
    <!-- svelte-ignore a11y_autofocus -->
    <input
      name="key"
      type="text"
      inputmode="text"
      placeholder="paste key"
      required
      autofocus
      autocapitalize="off"
      spellcheck="false"
    />
    <button type="submit">save</button>
  </form>

  <form method="POST" action="?/clear" class="clear-form">
    <button type="submit" class="clear">clear stored key</button>
  </form>

  {#if data.ok}
    <p class="ok">saved · auth mode should flip to key on next load</p>
  {/if}
  {#if data.cleared}
    <p class="ok">cleared · falling back to env / session</p>
  {/if}
</main>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    background: #0c0d10;
    color: #f2f3f5;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    min-height: 100vh;
  }
  main {
    max-width: 420px;
    margin: 0 auto;
    padding: 28px 20px 40px;
  }
  h1 {
    font-size: 1.4rem;
    font-weight: 600;
  }
  .sub {
    color: #8b8f99;
    margin: 4px 0 18px;
    font-size: 0.9rem;
  }
  .status {
    background: #15171c;
    border: 1px solid #2a2e38;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.85rem;
    color: #b0b4be;
    margin-bottom: 18px;
  }
  .status-key {
    border-color: #6ee7a7;
    color: #6ee7a7;
  }
  .status-session {
    border-color: #ffb454;
    color: #ffb454;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  input {
    border: 1px solid #2a2e38;
    background: #15171c;
    color: #f2f3f5;
    padding: 14px;
    border-radius: 8px;
    font-size: 1rem;
    outline: none;
  }
  input:focus {
    border-color: #5eadff;
  }
  button {
    background: #5eadff;
    color: #0c0d10;
    font-weight: 600;
    padding: 13px;
    border: 0;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
  }
  button:active {
    transform: scale(0.98);
  }
  .clear-form {
    margin-top: 14px;
  }
  .clear {
    background: transparent;
    color: #ff6b6b;
    border: 1px solid #3d2f33;
  }
  .ok {
    color: #6ee7a7;
    margin-top: 16px;
  }
</style>
