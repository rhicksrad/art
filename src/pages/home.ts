import { paletteStrip } from '../components/charts';
import { openDetail } from '../components/detail';
import { describeError, errorPanel } from '../components/errors';
import { createResults } from '../components/results';
import { toItemCards as harvardCards } from '../adapters/harvard';
import { accentFromPalette } from '../lib/color';
import { clear, formatCount, h, icon } from '../lib/dom';
import { fetchJSON, isAbort } from '../lib/http';
import { applyAccent, clearRecentSearches, recentSearches, rememberSearch } from '../lib/prefs';
import { pageHref } from '../lib/routes';
import type { ItemCard, SourceKey } from '../lib/types';
import {
  SOURCE_GROUPS,
  SOURCES,
  sourceAccepts,
  sourceByKey,
  type SourceDefinition,
} from '../sources';

const KEYWORD_SOURCES = SOURCES.filter((source) => source.mode === 'keyword');
const IDENTIFIER_SOURCES = SOURCES.filter((source) => source.mode === 'identifier');
const PER_SOURCE_OPTIONS = [6, 12, 24];
const DEFAULT_PER_SOURCE = 12;
const SAMPLE_QUERIES = [
  'landscape',
  'Hokusai',
  'poster',
  'cultural heritage',
  'oclc:424023',
  'bb112zx3193',
];

type State = { q: string; enabled: Set<SourceKey>; perSource: number };

type Outcome =
  | { state: 'loading' }
  | { state: 'ok'; items: ItemCard[]; total?: number; ms: number }
  | { state: 'error'; error: unknown; ms: number };

const readState = (): State => {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('src')?.split(',').filter(Boolean);
  const enabled = new Set<SourceKey>(
    KEYWORD_SOURCES.filter((source) => !requested || requested.includes(source.slug)).map(
      (source) => source.key,
    ),
  );
  const n = Number(params.get('n'));
  return {
    q: params.get('q')?.trim() ?? '',
    enabled,
    perSource: PER_SOURCE_OPTIONS.includes(n) ? n : DEFAULT_PER_SOURCE,
  };
};

const writeState = (state: State): void => {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.enabled.size !== KEYWORD_SOURCES.length) {
    params.set(
      'src',
      KEYWORD_SOURCES.filter((s) => state.enabled.has(s.key))
        .map((s) => s.slug)
        .join(','),
    );
  }
  if (state.perSource !== DEFAULT_PER_SOURCE) params.set('n', String(state.perSource));
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
  if (url !== `${window.location.pathname}${window.location.search}`)
    window.history.pushState(null, '', url);
};

/** Round-robin across sources so no single collection dominates the first screen. */
const interleave = (lists: ItemCard[][]): ItemCard[] => {
  const merged: ItemCard[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest; i += 1) {
    for (const list of lists) {
      if (list[i]) merged.push(list[i]);
    }
  }
  return merged;
};

/* ------------------------------- Landing ---------------------------------- */

const todaySeed = (): string => new Date().toISOString().slice(0, 10).replace(/-/g, '');

let wallRequest: Promise<ItemCard[]> | null = null;

/** Twelve paintings from Harvard, reshuffled daily and cached by the Worker for the day. */
const loadWall = (): Promise<ItemCard[]> => {
  wallRequest ??= fetchJSON<unknown>('/harvard-art/object', {
    size: 14,
    hasimage: 1,
    classification: 'Paintings',
    q: 'imagepermissionlevel:0',
    sort: `random:${todaySeed()}`,
    ttl: 86400,
  }).then((response) => harvardCards(response).filter((item) => item.img));
  return wallRequest;
};

/** The featured work: the first of today's paintings that has a palette worth borrowing. */
const pickFeature = (items: ItemCard[]): ItemCard | undefined =>
  items.find(
    (item) =>
      item.colors &&
      accentFromPalette(item.colors) &&
      (item.aspect ?? 1) > 0.6 &&
      (item.aspect ?? 1) < 1.7,
  ) ?? items[0];

const featureFigure = (): HTMLElement => {
  const figure = h(
    'figure',
    { class: 'feature feature--loading' },
    h('div', { class: 'feature__frame' }),
  );
  loadWall()
    .then((items) => {
      const item = pickFeature(items);
      if (!item) throw new Error('No works returned');
      const accent = item.colors ? accentFromPalette(item.colors) : null;
      if (accent) applyAccent(accent, true);

      const img = h('img', {
        src: item.imgLarge ?? item.img,
        alt: item.title,
        referrerpolicy: 'no-referrer',
        style: item.aspect ? `aspect-ratio:${item.aspect.toFixed(4)}` : undefined,
      });
      img.addEventListener('error', () => {
        if (item.img && img.src !== item.img) img.src = item.img;
      });
      const frame = h(
        'button',
        { type: 'button', class: 'feature__frame', 'aria-label': `Open details for ${item.title}` },
        img,
      );
      frame.addEventListener('click', () => openDetail(item, items));

      figure.classList.remove('feature--loading');
      figure.replaceChildren(
        frame,
        h(
          'figcaption',
          { class: 'feature__caption' },
          h(
            'div',
            { class: 'label label--wall' },
            item.sub ? h('p', { class: 'label__maker' }, item.sub) : null,
            h('p', { class: 'label__title' }, item.title),
            item.date ? h('p', { class: 'label__date' }, item.date) : null,
            h('p', { class: 'label__held' }, 'Harvard Art Museums, today’s painting'),
          ),
          item.colors
            ? h(
                'div',
                { class: 'feature__palette' },
                paletteStrip(item.colors, (color) =>
                  pageHref('/harvard.html', { color: color.hex }),
                ),
                h(
                  'p',
                  { class: 'feature__note' },
                  accent
                    ? 'Harvard’s API returns the colours in each work. Today this site’s accent colour is taken from this one. Pick a swatch to find other works that use it.'
                    : 'Harvard’s API returns the colours in each work. Pick a swatch to find other works that use it.',
                ),
              )
            : null,
        ),
      );
    })
    .catch((error: unknown) => {
      figure.classList.remove('feature--loading');
      figure.classList.add('feature--failed');
      figure.replaceChildren(
        h(
          'p',
          { class: 'muted' },
          `Today’s painting could not be loaded (${describeError(error)}). `,
          h('a', { href: pageHref('/debug.html') }, 'Check the Worker status'),
          '.',
        ),
      );
    });
  return figure;
};

/** A filmstrip of the rest of today's paintings. Real records, never placeholders. */
const todaysWall = (): HTMLElement => {
  const strip = h('div', { class: 'filmstrip', tabindex: '0' });
  const section = h(
    'section',
    { class: 'wall' },
    h(
      'header',
      { class: 'section-head' },
      h('h2', null, 'More of today’s paintings'),
      h('a', { href: pageHref('/harvard.html'), class: 'more-link' }, 'Search Harvard Art Museums'),
    ),
    strip,
  );
  strip.append(
    ...Array.from({ length: 7 }, (_, i) =>
      h('div', {
        class: 'filmstrip__item filmstrip__item--skeleton',
        style: `aspect-ratio:${[0.8, 1.3, 0.7, 1, 1.4, 0.75, 1.2][i]}`,
      }),
    ),
  );
  loadWall()
    .then((items) => {
      const feature = pickFeature(items);
      const rest = items.filter((item) => item !== feature);
      if (rest.length === 0) {
        section.remove();
        return;
      }
      strip.replaceChildren(
        ...rest.map((item) => {
          const img = h('img', {
            src: item.img,
            alt: '',
            loading: 'lazy',
            referrerpolicy: 'no-referrer',
            style: item.aspect ? `aspect-ratio:${item.aspect.toFixed(4)}` : undefined,
          });
          const button = h(
            'button',
            {
              type: 'button',
              class: 'filmstrip__item',
              'aria-label': `Open details for ${item.title}`,
            },
            img,
            h(
              'span',
              { class: 'label' },
              item.sub ? h('span', { class: 'label__maker' }, item.sub) : null,
              h('span', { class: 'label__title' }, item.title),
              item.date ? h('span', { class: 'label__date' }, item.date) : null,
            ),
          );
          img.addEventListener('error', () => button.remove());
          button.addEventListener('click', () => openDetail(item, items));
          return button;
        }),
      );
    })
    // The featured figure already reports the failure; no need to say it twice.
    .catch(() => section.remove());
  return section;
};

/** The floor directory: every source, what it holds, how big it is right now, and its route. */
const sourceDirectory = (): HTMLElement => {
  const body = h('tbody');
  for (const group of SOURCE_GROUPS) {
    body.append(
      h('tr', { class: 'directory__group' }, h('th', { colspan: '4', scope: 'colgroup' }, group)),
    );
    for (const source of SOURCES.filter((entry) => entry.group === group)) {
      const live = h('td', { class: 'directory__size' });
      // Live collection size, straight from the API. Stays blank if the source is down.
      source
        .count?.()
        .then((total) => {
          if (total) live.textContent = `${formatCount(total)} ${source.countNoun ?? 'records'}`;
        })
        .catch(() => undefined);
      body.append(
        h(
          'tr',
          null,
          h('th', { scope: 'row' }, h('a', { href: pageHref(source.page) }, source.label)),
          h('td', { class: 'directory__blurb' }, source.blurb),
          live,
          h('td', { class: 'directory__endpoint' }, h('code', null, source.endpoint)),
        ),
      );
    }
  }
  return h(
    'section',
    { class: 'directory' },
    h(
      'header',
      { class: 'section-head' },
      h('h2', null, 'The collections'),
      h('a', { href: pageHref('/debug.html'), class: 'more-link' }, 'Check which are up right now'),
    ),
    h(
      'table',
      { class: 'directory__table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', { scope: 'col' }, 'Source'),
          h('th', { scope: 'col' }, 'What you can search'),
          h('th', { scope: 'col' }, 'Size today'),
          h('th', { scope: 'col' }, 'Worker route'),
        ),
      ),
      body,
    ),
  );
};

/* --------------------------------- Page ----------------------------------- */

const mount = (el: HTMLElement): void => {
  let state = readState();
  let controller: AbortController | null = null;

  const input = h('input', {
    type: 'search',
    name: 'q',
    class: 'searchbar__input',
    placeholder: 'Subject, maker, medium, or an identifier',
    'aria-label': 'Search every source',
    autocomplete: 'off',
    value: state.q,
  });

  const sourceChips = h('div', {
    class: 'source-picker',
    role: 'group',
    'aria-label': 'Sources to search',
  });
  const paintSourceChips = (): void => {
    clear(sourceChips);
    for (const source of KEYWORD_SOURCES) {
      const on = state.enabled.has(source.key);
      const chip = h(
        'button',
        {
          type: 'button',
          class: `chip${on ? ' chip--on' : ''}`,
          'aria-pressed': String(on),
          title: source.label,
        },
        on ? icon('check', 13) : null,
        source.short,
      );
      chip.addEventListener('click', () => {
        if (on) state.enabled.delete(source.key);
        else state.enabled.add(source.key);
        paintSourceChips();
        if (state.q) run();
      });
      sourceChips.append(chip);
    }
  };
  paintSourceChips();

  const perSource = h(
    'select',
    { 'aria-label': 'Results per source' },
    ...PER_SOURCE_OPTIONS.map((n) =>
      h('option', { value: n, selected: n === state.perSource || undefined }, `${n} per source`),
    ),
  );
  perSource.addEventListener('change', () => {
    state.perSource = Number(perSource.value);
    if (state.q) run();
  });

  const form = h(
    'form',
    { class: 'searchbar searchbar--hero', role: 'search' },
    h(
      'div',
      { class: 'searchbar__main' },
      icon('search', 22),
      input,
      h('button', { type: 'submit', class: 'button button--primary' }, 'Search'),
    ),
    h('div', { class: 'searchbar__controls' }, sourceChips, perSource),
  );

  const feature = h('div', { class: 'hero__feature' });
  const hero = h(
    'section',
    { class: 'hero' },
    h(
      'div',
      { class: 'hero__copy' },
      h('h1', null, `Search ${SOURCES.length} open collections`),
      h(
        'p',
        { class: 'lede' },
        'University museums, libraries and research archives publish their catalogues through free public APIs. This site queries them live, side by side.',
      ),
      form,
      h(
        'p',
        { class: 'hero__note muted' },
        'Paste a Stanford PURL, an OCLC or ISBN number, a HathiTrust volume id or an IIIF path and that source answers instead.',
      ),
    ),
    feature,
  );

  const body = h('div', { class: 'home-body' });
  el.replaceChildren(h('div', { class: 'page page--home' }, hero, body));

  /* ------------------------------ Landing view ----------------------------- */

  const renderLanding = (): void => {
    document.title = 'Art API Explorer';
    hero.classList.remove('hero--compact');
    if (feature.childElementCount === 0) feature.append(featureFigure());
    const quick = h('div', { class: 'samples' });
    const addChips = (label: string, queries: string[]): void => {
      if (queries.length === 0) return;
      quick.append(h('span', { class: 'muted' }, label));
      for (const query of queries) {
        const chip = h('button', { type: 'button', class: 'chip' }, query);
        chip.addEventListener('click', () => {
          input.value = query;
          run();
        });
        quick.append(chip);
      }
    };
    const recent = recentSearches();
    addChips('Recent', recent.slice(0, 5));
    if (recent.length > 0) {
      const forget = h('button', { type: 'button', class: 'link-button' }, 'Clear');
      forget.addEventListener('click', () => {
        clearRecentSearches();
        renderLanding();
      });
      quick.append(forget, h('span', { class: 'samples__break' }));
    }
    addChips(
      'Try',
      SAMPLE_QUERIES.filter((query) => !recent.includes(query)),
    );
    body.replaceChildren(quick, todaysWall(), sourceDirectory());
  };

  /* ------------------------------ Results view ----------------------------- */

  const runSearch = (): void => {
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    const q = state.q;
    document.title = `${q} | Art API Explorer`;
    hero.classList.add('hero--compact');
    rememberSearch(q);

    const participants: SourceDefinition[] = [
      ...KEYWORD_SOURCES.filter((source) => state.enabled.has(source.key)),
      ...IDENTIFIER_SOURCES.filter((source) => sourceAccepts(source, q)),
    ];
    // An identifier is not a useful keyword: when one is recognised, only those sources run.
    const identifierHit = IDENTIFIER_SOURCES.some((source) => sourceAccepts(source, q));
    const running = identifierHit
      ? participants.filter((source) => source.mode === 'identifier')
      : participants;

    const outcomes = new Map<SourceKey, Outcome>(
      running.map((source) => [source.key, { state: 'loading' }]),
    );
    const rail = h('div', { class: 'rail', 'aria-label': 'Sources searched' });
    const summary = h('p', { class: 'status-line', 'aria-live': 'polite' });
    const failures = h('div', { class: 'failures' });
    const banner = h('div', { class: 'source-banner', hidden: true });
    const results = createResults({ layout: 'gallery', showSource: true });
    let activeSource: SourceKey | null = null;

    const paint = (): void => {
      clear(rail);
      let done = 0;
      let totalLoaded = 0;
      const failed: Array<[SourceDefinition, unknown]> = [];
      for (const source of running) {
        const outcome = outcomes.get(source.key) as Outcome;
        let detail: string;
        let cls = 'rail__item';
        if (outcome.state === 'loading') {
          detail = 'searching…';
          cls += ' is-loading';
        } else if (outcome.state === 'error') {
          done += 1;
          detail = describeError(outcome.error);
          cls += ' is-error';
          failed.push([source, outcome.error]);
        } else {
          done += 1;
          totalLoaded += outcome.items.length;
          detail =
            outcome.total !== undefined && outcome.total > outcome.items.length
              ? `${outcome.items.length} of ${formatCount(outcome.total)}`
              : `${outcome.items.length}`;
          if (outcome.items.length === 0) cls += ' is-empty';
        }
        const clickable = outcome.state === 'ok' && outcome.items.length > 0;
        const item = h(
          'button',
          {
            type: 'button',
            class: `${cls}${activeSource === source.key ? ' is-active' : ''}`,
            disabled: !clickable || undefined,
            'aria-pressed': clickable ? String(activeSource === source.key) : undefined,
            title:
              outcome.state === 'loading'
                ? source.label
                : `${source.label}${'ms' in outcome ? `, answered in ${outcome.ms} ms` : ''}`,
          },
          h('span', { class: 'rail__dot', 'aria-hidden': 'true' }),
          h('span', { class: 'rail__name' }, source.short),
          h('span', { class: 'rail__detail' }, detail),
        );
        if (clickable)
          item.addEventListener('click', () =>
            results.setSource(activeSource === source.key ? null : source.key),
          );
        rail.append(item);
      }

      summary.textContent =
        done < running.length
          ? `Searching ${running.length} sources for “${q}”. ${done} answered so far.`
          : `${formatCount(totalLoaded)} results for “${q}” from ${running.length - failed.length} of ${running.length} sources`;

      clear(failures);
      if (failed.length > 0) {
        failures.append(
          h(
            'details',
            { class: 'disclosure disclosure--alert' },
            h(
              'summary',
              null,
              icon('alert', 15),
              ` ${failed.length} source${failed.length === 1 ? '' : 's'} failed: ${failed.map(([s]) => s.short).join(', ')}`,
            ),
            ...failed.map(([source, error]) => errorPanel(error, source.label)),
          ),
        );
      }

      banner.hidden = !activeSource;
      if (activeSource) {
        const source = sourceByKey(activeSource);
        const outcome = outcomes.get(activeSource);
        const total =
          outcome?.state === 'ok' && outcome.total !== undefined
            ? ` of ${formatCount(outcome.total)}`
            : '';
        banner.replaceChildren(
          h(
            'span',
            null,
            `Showing the first ${outcome?.state === 'ok' ? outcome.items.length : ''}${total} from ${source.label}.`,
          ),
          h(
            'a',
            { href: pageHref(source.page, { q }), class: 'more-link' },
            `Search only ${source.label}`,
          ),
        );
      }
    };

    const publish = (): void => {
      const lists = running
        .map((source) => outcomes.get(source.key))
        .filter((outcome): outcome is Extract<Outcome, { state: 'ok' }> => outcome?.state === 'ok')
        .map((outcome) => outcome.items);
      const merged = interleave(lists);
      const pending = running.some((source) => outcomes.get(source.key)?.state === 'loading');
      if (merged.length > 0) results.setItems(merged);
      else if (!pending) {
        results.element.replaceChildren(
          h('p', { class: 'empty' }, `Nothing matched “${q}” in the sources that answered.`),
        );
      }
    };

    results.onFilterChange(({ source }) => {
      activeSource = source;
      paint();
    });

    body.replaceChildren(summary, rail, failures, banner, results.element);
    if (running.length === 0) {
      summary.textContent = 'Turn on at least one source to search.';
      return;
    }
    results.setLoading(8);
    paint();

    for (const source of running) {
      const started = performance.now();
      source
        .search({ q, page: 1, size: state.perSource, signal })
        .then((page) => {
          outcomes.set(source.key, {
            state: 'ok',
            items: page.items,
            total: page.total,
            ms: Math.round(performance.now() - started),
          });
        })
        .catch((error: unknown) => {
          if (isAbort(error)) return;
          outcomes.set(source.key, {
            state: 'error',
            error,
            ms: Math.round(performance.now() - started),
          });
        })
        .finally(() => {
          if (signal.aborted) return;
          paint();
          publish();
        });
    }
  };

  function run(): void {
    state.q = input.value.trim();
    writeState(state);
    if (state.q) runSearch();
    else {
      controller?.abort();
      renderLanding();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    run();
  });
  window.addEventListener('popstate', () => {
    state = readState();
    input.value = state.q;
    perSource.value = String(state.perSource);
    paintSourceChips();
    if (state.q) runSearch();
    else renderLanding();
  });

  if (state.q) runSearch();
  else renderLanding();
};

export default { mount };
