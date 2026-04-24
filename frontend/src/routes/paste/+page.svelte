<script lang="ts">
  interface Props {
    data: { ok: boolean; err: string };
  }
  let { data }: Props = $props();
</script>

<svelte:head>
  <title>mirror · paste</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
</svelte:head>

<main>
  <h1>play on mirror</h1>
  <p class="sub">paste a youtube url or 11-char id</p>
  <form method="POST" autocomplete="off">
    <!-- svelte-ignore a11y_autofocus -->
    <input
      name="url"
      type="url"
      inputmode="url"
      placeholder="https://youtu.be/..."
      required
      autofocus
    />
    <button type="submit">load</button>
  </form>
  {#if data.ok}
    <p class="ok">loaded · check the mirror</p>
  {:else if data.err}
    <p class="err">error: {data.err}</p>
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
    margin-bottom: 4px;
  }
  .sub {
    color: #8b8f99;
    margin-bottom: 22px;
    font-size: 0.9rem;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  input {
    border: 1px solid #2a2e38;
    background: #15171c;
    color: #f2f3f5;
    padding: 14px 14px;
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
    padding: 14px;
    border: 0;
    border-radius: 8px;
    font-size: 1rem;
    cursor: pointer;
  }
  button:active {
    transform: scale(0.98);
  }
  .ok {
    color: #6ee7a7;
    margin-top: 18px;
  }
  .err {
    color: #ff6b6b;
    margin-top: 18px;
  }
</style>
