// Colours come from the CSS custom properties in styles.css, so light and dark mode live in one place.

import type { Palette, RGB } from './render/glRenderer';
import type { Theme } from './render/overlay';

let probe: CanvasRenderingContext2D | null = null;

/** Any CSS colour → [r, g, b] in 0..1, using the browser's own parser. */
function toRGB(css: string): RGB {
  probe ??= document.createElement('canvas').getContext('2d');
  if (!probe) return [0, 0, 0];
  probe.fillStyle = '#000';
  probe.fillStyle = css;
  const hex = String(probe.fillStyle);   // normalised to #rrggbb for opaque colours
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0, 0, 0];
}

export function readTheme(): { theme: Theme; palette: Palette } {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  const theme: Theme = { plate: v('--plate'), ink: v('--ink'), muted: v('--muted'), ident: v('--ident'), fontMath: v('--font-math') };
  const palette: Palette = {
    plate: toRGB(theme.plate),
    ink: toRGB(theme.ink),
    genA: toRGB(v('--gen-a')),
    genB: toRGB(v('--gen-b')),
    ident: toRGB(theme.ident),
  };
  return { theme, palette };
}

/** Call back when the colour scheme changes. */
export function onThemeChange(cb: () => void): void {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', cb);
  new MutationObserver(cb).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}
