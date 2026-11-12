import type { TimeBin } from '../lib/dates';
import { h } from '../lib/dom';
import type { ColorSwatch } from '../lib/types';

/* ------------------------------ Shared tooltip ---------------------------- */

let tooltip: HTMLElement | null = null;

const showTip = (target: Element, text: string): void => {
  if (!tooltip) {
    tooltip = h('div', { class: 'tooltip', role: 'tooltip' });
    document.body.append(tooltip);
  }
  tooltip.textContent = text;
  tooltip.hidden = false;
  const rect = target.getBoundingClientRect();
  const tip = tooltip.getBoundingClientRect();
  const left = Math.min(
    window.innerWidth - tip.width - 8,
    Math.max(8, rect.left + rect.width / 2 - tip.width / 2),
  );
  tooltip.style.left = `${left + window.scrollX}px`;
  tooltip.style.top = `${rect.top + window.scrollY - tip.height - 8}px`;
};

const hideTip = (): void => {
  if (tooltip) tooltip.hidden = true;
};

const withTip = (el: HTMLElement, text: string): void => {
  el.addEventListener('pointerenter', () => showTip(el, text));
  el.addEventListener('focus', () => showTip(el, text));
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener('blur', hideTip);
};

const plural = (count: number, noun: string): string =>
  `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;

/* -------------------------------- Histogram ------------------------------- */

export type HistogramOptions = {
  selected?: { start: number; end: number } | null;
  onSelect?: (bin: TimeBin) => void;
  noun?: string;
};

/**
 * Column chart of counts over time. One series, so no legend: the panel title
 * names it. Columns are buttons; hover or focus shows the exact count.
 */
export const histogram = (
  bins: TimeBin[],
  { selected, onSelect, noun = 'item' }: HistogramOptions = {},
): HTMLElement => {
  const max = Math.max(1, ...bins.map((bin) => bin.count));
  const columns = h('div', { class: 'histogram__columns', style: `--columns:${bins.length}` });
  for (const bin of bins) {
    const active = !!selected && selected.start === bin.start && selected.end === bin.end;
    const column = h(
      'button',
      {
        type: 'button',
        class: `histogram__column${active ? ' is-active' : ''}${bin.count === 0 ? ' is-empty' : ''}`,
        'aria-label': `${bin.label}: ${plural(bin.count, noun)}`,
        'aria-pressed': onSelect ? String(active) : undefined,
        disabled: bin.count === 0,
      },
      h('span', {
        class: 'histogram__bar',
        style: `height:${bin.count === 0 ? 0 : Math.max(4, (bin.count / max) * 100)}%`,
      }),
    );
    withTip(column, `${bin.label} · ${plural(bin.count, noun)}`);
    if (onSelect) column.addEventListener('click', () => onSelect(bin));
    columns.append(column);
  }
  const first = bins[0];
  const last = bins[bins.length - 1];
  return h(
    'div',
    { class: 'histogram' },
    h(
      'div',
      { class: 'histogram__plot' },
      h('span', { class: 'histogram__max' }, String(max)),
      columns,
    ),
    h(
      'div',
      { class: 'histogram__axis' },
      h('span', null, first?.label ?? ''),
      bins.length > 1 ? h('span', null, last?.label ?? '') : null,
    ),
  );
};

/* -------------------------------- Bar list -------------------------------- */

export type BarEntry = { label: string; count: number };

export type BarListOptions = {
  selected?: string | null;
  onSelect?: (label: string) => void;
  noun?: string;
};

/** Ranked horizontal bars with the value at the end of each row. */
export const barList = (
  entries: BarEntry[],
  { selected, onSelect, noun = 'item' }: BarListOptions = {},
): HTMLElement => {
  const max = Math.max(1, ...entries.map((entry) => entry.count));
  const list = h('ul', { class: 'barlist' });
  for (const entry of entries) {
    const active = selected === entry.label;
    const row = h(
      'button',
      {
        type: 'button',
        class: `barlist__row${active ? ' is-active' : ''}`,
        'aria-pressed': onSelect ? String(active) : undefined,
        title: `${entry.label} · ${plural(entry.count, noun)}`,
      },
      h('span', { class: 'barlist__label' }, entry.label),
      h('span', { class: 'barlist__value' }, entry.count.toLocaleString('en-US')),
      h(
        'span',
        { class: 'barlist__track' },
        h('span', { class: 'barlist__bar', style: `width:${(entry.count / max) * 100}%` }),
      ),
    );
    if (onSelect) row.addEventListener('click', () => onSelect(entry.label));
    list.append(h('li', null, row));
  }
  return list;
};

/** Count labels and return the most frequent. */
export const topCounts = (labels: Iterable<string>, limit = 8): BarEntry[] => {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return Array.from(counts, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
};

/* --------------------------------- Palette -------------------------------- */

/** Proportional strip of the colours measured in a work (or summed over many). */
export const paletteStrip = (
  colors: ColorSwatch[],
  hrefFor?: (color: ColorSwatch) => string,
): HTMLElement => {
  const total = colors.reduce((sum, color) => sum + color.percent, 0) || 1;
  const strip = h('div', {
    class: `palette${hrefFor ? ' palette--links' : ''}`,
    role: hrefFor ? 'group' : 'img',
    'aria-label': `Colour palette: ${colors.map((c) => c.hue ?? c.hex).join(', ')}`,
  });
  for (const color of colors) {
    const share = (color.percent / total) * 100;
    const style = `flex-grow:${Math.max(share, 1.5)};background:${color.hex}`;
    const name = `${color.hue ? `${color.hue} · ` : ''}${color.hex} · ${share.toFixed(0)}%`;
    const swatch = hrefFor
      ? h('a', {
          class: 'palette__swatch',
          style,
          href: hrefFor(color),
          'aria-label': `Find works using ${color.hue ?? color.hex}`,
        })
      : h('span', { class: 'palette__swatch', style, tabindex: '0' });
    withTip(swatch, hrefFor ? `${name} · find more` : name);
    strip.append(swatch);
  }
  return strip;
};

/** Merge palettes from many works into hue families, weighted by coverage. */
export const aggregatePalette = (palettes: ColorSwatch[][], limit = 10): ColorSwatch[] => {
  const hues = new Map<string, { weight: number; best: ColorSwatch }>();
  for (const palette of palettes) {
    for (const color of palette) {
      const key = color.hue ?? color.hex;
      const entry = hues.get(key);
      if (!entry) hues.set(key, { weight: color.percent, best: color });
      else {
        entry.weight += color.percent;
        if (color.percent > entry.best.percent) entry.best = color;
      }
    }
  }
  return Array.from(hues, ([hue, entry]) => ({ hex: entry.best.hex, percent: entry.weight, hue }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, limit);
};
