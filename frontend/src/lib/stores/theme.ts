import { writable } from 'svelte/store';
import type { ThemeName } from '$lib/layout/schema.js';

export const currentTheme = writable<ThemeName>('minimal-dark');
