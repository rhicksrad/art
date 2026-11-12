import type { ColorSwatch } from './types';

type Hsl = { h: number; s: number; l: number };

export const hexToHsl = (hex: string): Hsl | null => {
  const match = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return null;
  const [r, g, b] = match.slice(1).map((part) => parseInt(part, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Pick the most characterful colour of a palette and turn it into a pair of
 * accents (for light and dark surfaces) with fixed lightness, so text contrast
 * holds whatever the artwork looks like. Returns null for monochrome works.
 */
export const accentFromPalette = (
  colors: ColorSwatch[],
): { light: string; dark: string } | null => {
  let best: { hsl: Hsl; score: number } | null = null;
  for (const color of colors) {
    const hsl = hexToHsl(color.hex);
    if (!hsl || hsl.s < 0.22 || hsl.l < 0.15 || hsl.l > 0.85) continue;
    const score = hsl.s * Math.pow(Math.max(color.percent, 0.01), 0.35);
    if (!best || score > best.score) best = { hsl, score };
  }
  if (!best) return null;
  const hue = Math.round(best.hsl.h);
  const saturation = Math.round(clamp(best.hsl.s, 0.45, 0.72) * 100);
  return {
    light: `hsl(${hue} ${saturation}% 34%)`,
    dark: `hsl(${hue} ${Math.min(saturation + 8, 80)}% 68%)`,
  };
};
