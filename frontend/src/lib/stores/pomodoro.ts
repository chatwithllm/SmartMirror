import { writable } from 'svelte/store';

export type PomodoroState =
  | { kind: 'idle' }
  | { kind: 'running'; startedAt: number; durationMs: number }
  | { kind: 'paused'; elapsedMs: number; durationMs: number }
  | { kind: 'done'; finishedAt: number };

function createPomodoro() {
  const { subscribe, update, set } = writable<PomodoroState>({ kind: 'idle' });
  return {
    subscribe,
    start(durationMinutes = 25) {
      set({
        kind: 'running',
        startedAt: Date.now(),
        durationMs: durationMinutes * 60 * 1000
      });
    },
    pause() {
      update((s) => {
        if (s.kind !== 'running') return s;
        return {
          kind: 'paused',
          elapsedMs: Date.now() - s.startedAt,
          durationMs: s.durationMs
        };
      });
    },
    resume() {
      update((s) => {
        if (s.kind !== 'paused') return s;
        return {
          kind: 'running',
          startedAt: Date.now() - s.elapsedMs,
          durationMs: s.durationMs
        };
      });
    },
    reset() {
      set({ kind: 'idle' });
    },
    complete() {
      set({ kind: 'done', finishedAt: Date.now() });
    }
  };
}

export const pomodoro = createPomodoro();
