import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// @testing-library/dom's jestFakeTimersAreEnabled() checks for a `jest` global.
// Vitest 3.x doesn't expose one, so waitFor falls back to setInterval-based
// polling — which breaks when fake timers are active. Alias jest → vi so the
// fake-timer detection path works correctly.
(globalThis as Record<string, unknown>).jest = vi;
