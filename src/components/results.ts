import { binYears, formatYear, type TimeBin } from '../lib/dates';
import { emptyState } from '../lib/emblems';
import { clear, formatCount, h, icon } from '../lib/dom';
import type { ItemCard, SourceKey } from '../lib/types';
import { sourceByKey } from '../sources';
import { cardWeight, galleryCard, listRow, skeletonCards } from './card';
import { createMasonry } from './masonry';
import { timeline } from './timeline';
import { aggregatePalette, barList, histogram, paletteStrip, topCounts } from './charts';
import { openDetail } from './detail';

type Filters = {
  period: { start: number; end: number; label: string } | null;
  kind: string | null;
  person: string | null;
  tag: string | null;
  source: SourceKey | null;
  imagesOnly: boolean;
};

const emptyFilters = (): Filters => ({
  period: null,
  kind: null,
  person: null,
  tag: null,
  source: null,
  imagesOnly: false,
});

export type ResultsOptions = {
  layout: 'gallery' | 'list';
  /** Show which source each item came from (unified search). */
  showSource: boolean;
  noun?: string;
};

export type ResultsView = {
  element: HTMLElement;
  setItems: (items: ItemCard[]) => void;
  setLoading: (count: number) => void;
  /** Narrow to one source from outside (the unified search status rail). */
  setSource: (source: SourceKey | null) => void;
  onFilterChange: (listener: (filters: { source: SourceKey | null }) => void) => void;
};

const matches = (item: ItemCard, filters: Filters, skip?: keyof Filters): boolean => {
  if (skip !== 'period' && filters.period) {
    if (
      item.year === undefined ||
      item.year < filters.period.start ||
      item.year > filters.period.end
    )
      return false;
  }
  if (skip !== 'kind' && filters.kind && item.kind !== filters.kind) return false;
  if (skip !== 'person' && filters.person && !item.people?.includes(filters.person)) return false;
  if (skip !== 'tag' && filters.tag && !item.tags?.includes(filters.tag)) return false;
  if (skip !== 'source' && filters.source && item.source !== filters.source) return false;
  if (filters.imagesOnly && !item.img) return false;
  return true;
};

const panel = (title: string, note: string | null, body: HTMLElement): HTMLElement =>
  h(
    'section',
    { class: 'panel' },
    h(
      'header',
      { class: 'panel__head' },
      h('h3', null, title),
      note ? h('span', { class: 'muted' }, note) : null,
    ),
    body,
  );

/**
 * Results grid with chart facets computed from whatever is loaded. Every bar
 * is a filter; each facet is counted with the *other* filters applied, so the
 * charts always describe what clicking them would produce.
 */
export const createResults = ({
  layout,
  showSource,
  noun = 'result',
}: ResultsOptions): ResultsView => {
  let items: ItemCard[] = [];
  let filters = emptyFilters();
  const listeners: Array<(filters: { source: SourceKey | null }) => void> = [];

  const insights = h('aside', { class: 'insights', 'aria-label': 'Charts and filters' });
  const chips = h('div', { class: 'filters' });
  const masonry = layout === 'gallery' ? createMasonry() : null;
  const list = masonry
    ? h('div', { class: 'results__list' }, masonry.element)
    : h('div', { class: 'rows' });
  let view: 'gallery' | 'timeline' = 'gallery';
  let insightsOpen = false;
  const element = h(
    'div',
    { class: 'results' },
    insights,
    h('div', { class: 'results__main' }, chips, list),
  );

  const update = (patch: Partial<Filters>): void => {
    const sourceChanged = 'source' in patch && patch.source !== filters.source;
    filters = { ...filters, ...patch };
    render();
    if (sourceChanged) listeners.forEach((listener) => listener({ source: filters.source }));
  };

  const toggle = <K extends keyof Filters>(key: K, value: Filters[K], same: boolean): void =>
    update({ [key]: same ? (key === 'imagesOnly' ? false : null) : value } as Partial<Filters>);

  const renderChips = (shown: number): void => {
    clear(chips);
    const summary =
      shown === items.length
        ? `${formatCount(items.length)} ${noun}${items.length === 1 ? '' : 's'} loaded`
        : `${formatCount(shown)} of ${formatCount(items.length)} loaded ${noun}s match`;
    chips.append(h('span', { class: 'filters__summary' }, summary));

    // On a narrow screen the charts would push every result below the fold, so they wait
    // behind this button. Wide screens hide it and always show the charts alongside.
    if (!insights.hidden) {
      const toggleCharts = h(
        'button',
        {
          type: 'button',
          class: 'chip filters__toggle',
          'aria-expanded': String(insightsOpen),
        },
        insightsOpen ? 'Hide charts and filters' : 'Charts and filters',
      );
      toggleCharts.addEventListener('click', () => {
        insightsOpen = !insightsOpen;
        render();
      });
      chips.append(toggleCharts);
    }

    const chip = (label: string, patch: Partial<Filters>): void => {
      const button = h(
        'button',
        { type: 'button', class: 'chip chip--active', 'aria-label': `Remove filter ${label}` },
        label,
        icon('close', 13),
      );
      button.addEventListener('click', () => update(patch));
      chips.append(button);
    };
    if (filters.source) chip(sourceByKey(filters.source).short, { source: null });
    if (filters.period) chip(filters.period.label, { period: null });
    if (filters.kind) chip(filters.kind, { kind: null });
    if (filters.person) chip(filters.person, { person: null });
    if (filters.tag) chip(filters.tag, { tag: null });
    if (filters.imagesOnly) chip('With images', { imagesOnly: false });

    const active =
      [filters.source, filters.period, filters.kind, filters.person, filters.tag].filter(Boolean)
        .length + (filters.imagesOnly ? 1 : 0);
    if (active > 1) {
      const reset = h('button', { type: 'button', class: 'link-button' }, 'Clear all');
      reset.addEventListener('click', () => update(emptyFilters()));
      chips.append(reset);
    }

    // The timeline needs dates to stand on; offer it only when enough items have one.
    const datable = items.filter((item) => item.year !== undefined).length;
    if (masonry && datable >= 3) {
      const option = (value: 'gallery' | 'timeline', label: string): HTMLButtonElement => {
        const button = h(
          'button',
          { type: 'button', class: 'segmented__option', 'aria-pressed': String(view === value) },
          label,
        );
        button.addEventListener('click', () => {
          view = value;
          render();
        });
        return button;
      };
      chips.append(
        h(
          'div',
          { class: 'segmented', role: 'group', 'aria-label': 'View' },
          option('gallery', 'Gallery'),
          option('timeline', 'Timeline'),
        ),
      );
    } else {
      view = 'gallery';
    }
  };

  const renderInsights = (): void => {
    clear(insights);
    if (items.length < 2) {
      insights.hidden = true;
      return;
    }
    insights.hidden = false;

    const pool = (skip: keyof Filters): ItemCard[] =>
      items.filter((item) => matches(item, filters, skip));

    // When
    const dated = pool('period').filter((item) => item.year !== undefined);
    if (dated.length >= 2) {
      const bins = binYears(
        dated.map((item) => item.year as number),
        18,
      );
      const years = dated.map((item) => item.year as number);
      const range = `${formatYear(Math.min(...years))} – ${formatYear(Math.max(...years))}`;
      insights.append(
        panel(
          'When',
          range,
          h(
            'div',
            null,
            histogram(bins, {
              selected: filters.period,
              noun,
              onSelect: (bin: TimeBin) =>
                toggle(
                  'period',
                  { start: bin.start, end: bin.end, label: bin.label },
                  filters.period?.start === bin.start && filters.period?.end === bin.end,
                ),
            }),
            dated.length < pool('period').length
              ? h(
                  'p',
                  { class: 'panel__note' },
                  `${pool('period').length - dated.length} without a usable date are not charted.`,
                )
              : null,
          ),
        ),
      );
    }

    // Where from (unified search only)
    if (showSource) {
      const sources = topCounts(
        pool('source').map((item) => sourceByKey(item.source).short),
        12,
      );
      if (sources.length > 1) {
        insights.append(
          panel(
            'Source',
            null,
            barList(sources, {
              noun,
              selected: filters.source ? sourceByKey(filters.source).short : null,
              onSelect: (label) => {
                const key =
                  pool('source').find((item) => sourceByKey(item.source).short === label)?.source ??
                  null;
                toggle('source', key, filters.source === key);
              },
            }),
          ),
        );
      }
    }

    const facet = (
      title: string,
      key: 'kind' | 'person' | 'tag',
      values: (item: ItemCard) => string[],
      limit: number,
    ): void => {
      const entries = topCounts(pool(key).flatMap(values), limit);
      // A facet where every bar is 1 says nothing; skip it unless one is selected.
      if (entries.length < 2 || (entries[0].count < 2 && !filters[key])) return;
      insights.append(
        panel(
          title,
          null,
          barList(entries, {
            noun,
            selected: filters[key],
            onSelect: (label) => toggle(key, label, filters[key] === label),
          }),
        ),
      );
    };
    facet('Type', 'kind', (item) => (item.kind ? [item.kind] : []), 8);
    facet('Who', 'person', (item) => item.people ?? [], 8);
    facet(
      'Subjects & tags',
      'tag',
      (item) => (item.tags ?? []).filter((tag) => tag !== item.kind),
      10,
    );

    // Palette
    const palettes = items
      .filter((item) => matches(item, filters) && item.colors)
      .map((item) => item.colors ?? []);
    if (palettes.length >= 2) {
      insights.append(
        panel(
          'Palette',
          `${palettes.length} works`,
          h(
            'div',
            null,
            paletteStrip(aggregatePalette(palettes)),
            h(
              'p',
              { class: 'panel__note' },
              'Colour families measured across these works, weighted by coverage.',
            ),
          ),
        ),
      );
    }

    const withImages = items.filter((item) => item.img).length;
    if (withImages > 0 && withImages < items.length) {
      const checkbox = h('input', { type: 'checkbox', checked: filters.imagesOnly || undefined });
      checkbox.addEventListener('change', () => update({ imagesOnly: checkbox.checked }));
      insights.append(
        h('label', { class: 'check' }, checkbox, `Only items with images (${withImages})`),
      );
    }

    if (insights.childElementCount === 0) insights.hidden = true;
  };

  const render = (): void => {
    const shown = items.filter((item) => matches(item, filters));
    renderInsights();
    renderChips(shown.length);
    element.classList.toggle('results--solo', insights.hidden);
    element.classList.toggle('results--charts-open', insightsOpen);
    const onOpen = (target: ItemCard): void => openDetail(target, shown);
    if (shown.length === 0) {
      list.replaceChildren(
        emptyState(items.length === 0 ? `No ${noun}s.` : 'Nothing loaded matches these filters.'),
      );
      return;
    }
    if (masonry && view === 'timeline') {
      list.replaceChildren(timeline(shown, { onOpen, showSource }));
      return;
    }
    if (masonry) {
      // Works with an image hang on the wall. Papers, datasets and other records without one
      // read better as catalogue entries, so they get their own list underneath.
      const hung = shown.filter((item) => item.img);
      const unhung = shown.filter((item) => !item.img);
      masonry.setCards(
        hung.map((item) => ({
          element: galleryCard(item, { showSource, onOpen }),
          weight: cardWeight(item),
        })),
      );
      const entries =
        unhung.length > 0
          ? h(
              'section',
              { class: 'unhung' },
              hung.length > 0
                ? h(
                    'h2',
                    { class: 'unhung__head' },
                    `${formatCount(unhung.length)} without an image`,
                  )
                : null,
              h(
                'div',
                { class: 'rows' },
                ...unhung.map((item) => listRow(item, { showSource, onOpen })),
              ),
            )
          : null;
      list.replaceChildren(
        ...(hung.length > 0 ? [masonry.element] : []),
        ...(entries ? [entries] : []),
      );
      return;
    }
    list.replaceChildren(...shown.map((item) => listRow(item, { showSource, onOpen })));
  };

  return {
    element,
    setItems: (next) => {
      items = next;
      // Drop filters that no longer match anything (e.g. after a new search).
      if (!items.some((item) => matches(item, filters))) filters = emptyFilters();
      render();
    },
    setLoading: (count) => {
      items = [];
      filters = emptyFilters();
      insights.hidden = true;
      // Keep the charts column reserved while loading, so results do not jump sideways
      // when the charts arrive.
      element.classList.remove('results--solo');
      clear(chips);
      if (masonry) {
        masonry.setCards(
          skeletonCards(count, 'gallery').map((card, i) => ({
            element: card,
            weight: 1.2 + (i % 3) * 0.25,
          })),
        );
        list.replaceChildren(masonry.element);
      } else {
        list.replaceChildren(...skeletonCards(count, 'list'));
      }
    },
    setSource: (source) => update({ source }),
    onFilterChange: (listener) => listeners.push(listener),
  };
};
