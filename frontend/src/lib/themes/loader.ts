import type { ThemeName } from '$lib/layout/schema.js';

const themeCache = new Map<ThemeName, string>();

async function loadThemeCss(name: ThemeName): Promise<string> {
  if (themeCache.has(name)) return themeCache.get(name)!;
  let css: string;
  switch (name) {
    case 'minimal-dark': {
      const mod = await import('./minimal-dark.css?inline');
      css = mod.default;
      break;
    }
    case 'ops-cyberpunk': {
      const mod = await import('./ops-cyberpunk.css?inline');
      css = mod.default;
      break;
    }
    case 'editorial': {
      const mod = await import('./editorial.css?inline');
      css = mod.default;
      break;
    }
    case 'security': {
      const mod = await import('./security.css?inline');
      css = mod.default;
      break;
    }
  }
  themeCache.set(name, css);
  return css;
}

function styleTag(nextCss: string, id: string): HTMLStyleElement {
  const el = document.createElement('style');
  el.id = id;
  el.textContent = nextCss;
  return el;
}

export async function applyTheme(name: ThemeName): Promise<void> {
  if (typeof document === 'undefined') return;
  const nextCss = await loadThemeCss(name);
  const oldTag = document.getElementById('theme-style-active');
  const newId = `theme-style-${Date.now().toString(36)}`;
  const newTag = styleTag(nextCss, newId);
  newTag.style.transition = `opacity var(--motion-slow) ease`;
  newTag.style.opacity = '0';
  document.head.append(newTag);
  // Apply immediately — CSS vars swap the whole UI.
  document.documentElement.dataset.theme = name;
  requestAnimationFrame(() => {
    newTag.style.opacity = '1';
  });
  // Remove the previous tag after cross-fade.
  if (oldTag) {
    const motionSlow =
      getComputedStyle(document.documentElement).getPropertyValue('--motion-slow') || '400ms';
    const ms = parseFloat(motionSlow) || 400;
    setTimeout(() => oldTag.remove(), ms + 50);
  }
  newTag.id = 'theme-style-active';
}
