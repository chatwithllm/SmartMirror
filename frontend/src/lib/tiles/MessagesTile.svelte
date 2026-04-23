<script lang="ts">
  import BaseTile from './BaseTile.svelte';

  interface Msg {
    id: string;
    from: string;
    preview: string;
    when: string;
    unread?: boolean;
  }

  interface Props {
    id: string;
    props?: { demo?: Msg[] };
  }

  let { id, props = {} }: Props = $props();

  const msgs: Msg[] = $derived(
    props.demo ?? [
      { id: '1', from: 'Alex', preview: 'Can we push the standup to 10?', when: '3m', unread: true },
      { id: '2', from: 'Ops #on-call', preview: 'Backup job finished', when: '22m' },
      { id: '3', from: 'Partner', preview: 'Dinner at 7? 🍝', when: '1h' }
    ]
  );
  const unreadCount = $derived(msgs.filter((m) => m.unread).length);
</script>

<BaseTile {id} type="messages" label="Messages">
  <div class="ms" data-testid="messages">
    <h4 class="mono">Messages · {unreadCount}</h4>
    <ul>
      {#each msgs as m (m.id)}
        <li class:unread={m.unread}>
          <span class="from">{m.from}</span>
          <span class="p">{m.preview}</span>
          <span class="when mono">{m.when}</span>
        </li>
      {/each}
    </ul>
  </div>
</BaseTile>

<style>
  .ms {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    height: 100%;
  }
  h4 {
    color: var(--dim);
    font-size: 0.75rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  li {
    display: grid;
    grid-template-columns: 5.38rem 1fr 2.46rem;
    gap: 8px;
    align-items: baseline;
    padding: 3px 0;
    border-bottom: 1px solid var(--line);
    font-size: 0.85rem;
  }
  .from {
    color: var(--accent);
    font-size: 0.8rem;
  }
  .p {
    color: var(--dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .when {
    color: var(--dim);
    font-size: 0.8rem;
    text-align: right;
  }
  li.unread .p {
    color: var(--fg);
  }
  li.unread .from {
    color: var(--accent-2);
  }
</style>
