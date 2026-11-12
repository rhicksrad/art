import { errorPanel } from '../components/errors';
import { createResults } from '../components/results';
import { clear, formatCount, h, icon } from '../lib/dom';
import { isAbort } from '../lib/http';
import type { ItemCard } from '../lib/types';
import type { SourceDefinition } from '../sources';

const pageSize = (source: SourceDefinition): number => (source.layout === 'gallery' ? 24 : 20);

type State = { q: string; opts: Record<string, string> };

const readState = (source: SourceDefinition): State => {
  const params = new URLSearchParams(window.location.search);
  const opts: Record<string, string> = {};
  for (const control of source.controls ?? []) {
    opts[control.name] = params.get(control.name) ?? control.default;
  }
  return { q: params.get('q')?.trim() ?? '', opts };
};

const writeState = (source: SourceDefinition, state: State, push: boolean): void => {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  for (const control of source.controls ?? []) {
    const value = state.opts[control.name];
    if (value !== undefined && value !== control.default) params.set(control.name, value);
  }
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
  if (url === `${window.location.pathname}${window.location.search}`) return;
  if (push) window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
};

/** One explorer serves every source: search box, source-specific controls, charts, paging. */
export const mountExplorer = (el: HTMLElement, source: SourceDefinition): void => {
  document.title = `${source.label} | Art API Explorer`;
  let state = readState(source);
  let items: ItemCard[] = [];
  let page = 1;
  let controller: AbortController | null = null;
  let sampled = false;

  const input = h('input', {
    type: 'search',
    name: 'q',
    class: 'searchbar__input',
    placeholder: source.placeholder,
    'aria-label': `Search ${source.label}`,
    autocomplete: 'off',
    value: state.q,
  });

  const controls = h('div', { class: 'searchbar__controls' });
  const controlEls = new Map<string, HTMLSelectElement | HTMLInputElement>();
  for (const control of source.controls ?? []) {
    if (control.type === 'select') {
      const select = h('select', { name: control.name, 'aria-label': control.label });
      const fill = (options: { value: string; label: string }[]): void => {
        const current = state.opts[control.name];
        select.replaceChildren(
          ...options.map((o) =>
            h('option', { value: o.value, selected: o.value === current || undefined }, o.label),
          ),
        );
        if (!options.some((o) => o.value === current))
          select.prepend(h('option', { value: current, selected: true }, current));
      };
      fill(control.options ?? []);
      // Remote option lists (UBC collections) upgrade the select in place; failure keeps the default.
      control
        .loadOptions?.()
        .then(fill)
        .catch(() => undefined);
      controls.append(h('label', { class: 'field' }, h('span', null, control.label), select));
      controlEls.set(control.name, select);
    } else if (control.type === 'color') {
      // Set from a palette swatch; rendered below as a removable chip.
      continue;
    } else {
      const checkbox = h('input', {
        type: 'checkbox',
        name: control.name,
        checked: state.opts[control.name] !== '0' || undefined,
      });
      controls.append(h('label', { class: 'check' }, checkbox, control.label));
      controlEls.set(control.name, checkbox);
    }
  }

  const form = h(
    'form',
    { class: 'searchbar', role: 'search' },
    h(
      'div',
      { class: 'searchbar__main' },
      icon('search', 20),
      input,
      h(
        'button',
        { type: 'submit', class: 'button button--primary' },
        source.mode === 'keyword' ? 'Search' : 'Look up',
      ),
    ),
    controls.childElementCount > 0 ? controls : null,
  );

  const colorControl = source.controls?.find((control) => control.type === 'color');
  const colorChip = h('div', { class: 'samples' });
  const paintColorChip = (): void => {
    clear(colorChip);
    const value = colorControl ? state.opts[colorControl.name] : '';
    colorChip.hidden = !value;
    if (!colorControl || !/^#[0-9a-f]{6}$/i.test(value)) return;
    const remove = h(
      'button',
      { type: 'button', class: 'chip chip--active', 'aria-label': `Remove colour filter ${value}` },
      h('span', { class: 'swatch', style: `background:${value}` }),
      `Works using ${value}`,
      icon('close', 13),
    );
    remove.addEventListener('click', () => {
      state.opts[colorControl.name] = '';
      submit();
    });
    colorChip.append(remove);
  };

  const samples = h('div', { class: 'samples' });
  if (source.samples.length > 0) {
    samples.append(h('span', { class: 'muted' }, 'Try'));
    for (const sample of source.samples) {
      const chip = h('button', { type: 'button', class: 'chip' }, sample);
      chip.addEventListener('click', () => {
        input.value = sample;
        submit();
      });
      samples.append(chip);
    }
  }

  const status = h('p', { class: 'status-line', 'aria-live': 'polite' });
  const alerts = h('div');
  const results = createResults({ layout: source.layout, showSource: false });
  const more = h(
    'button',
    { type: 'button', class: 'button button--wide', hidden: true },
    'Load more',
  );
  const requestLog = h('details', { class: 'disclosure request-log', hidden: true });

  el.replaceChildren(
    h(
      'div',
      { class: 'page' },
      h(
        'header',
        { class: 'page-head' },
        h('h1', null, source.label),
        h('p', { class: 'lede' }, source.blurb),
        h(
          'p',
          { class: 'endpoint' },
          h('code', null, `GET ${source.endpoint}`),
          h('span', { class: 'muted' }, `proxied to ${source.upstream}`),
        ),
      ),
      form,
      samples,
      colorChip,
      status,
      alerts,
      results.element,
      h('div', { class: 'more' }, more),
      requestLog,
    ),
  );
  results.element.hidden = true;

  const requests: string[] = [];
  const renderRequests = (): void => {
    requestLog.hidden = requests.length === 0;
    requestLog.replaceChildren(
      h(
        'summary',
        null,
        icon('code', 15),
        ` Worker request${requests.length === 1 ? '' : 's'} behind this page (${requests.length})`,
      ),
      h(
        'ul',
        { class: 'request-log__list' },
        ...requests.map((url) =>
          h('li', null, h('a', { href: url, target: '_blank', rel: 'noreferrer' }, url)),
        ),
      ),
    );
  };

  const load = async (append: boolean): Promise<void> => {
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    clear(alerts);
    more.hidden = true;
    paintColorChip();

    const hint = source.accepts?.(state.q) ?? null;
    if (!state.q && source.mode === 'identifier') {
      results.element.hidden = true;
      status.textContent = hint ?? '';
      return;
    }
    if (hint) {
      results.element.hidden = true;
      status.textContent = hint;
      return;
    }

    if (!append) {
      page = 1;
      items = [];
      requests.length = 0;
      renderRequests();
      results.element.hidden = false;
      results.setLoading(source.mode === 'identifier' ? 2 : 8);
    }
    status.textContent = append ? 'Loading more…' : `Asking ${source.upstream}…`;
    more.disabled = true;

    try {
      const result = await source.search({
        q: state.q,
        page,
        size: pageSize(source),
        signal,
        opts: state.opts,
      });
      if (signal.aborted) return;
      items = append ? [...items, ...result.items] : result.items;
      requests.push(...result.requests);
      renderRequests();
      results.setItems(items);

      const label = state.q
        ? `“${state.q}”`
        : colorControl && state.opts[colorControl.name]
          ? `colour ${state.opts[colorControl.name]}`
          : 'everything';
      if (items.length === 0) {
        results.element.hidden = true;
        status.textContent = `No results for ${label}.`;
      } else if (result.total !== undefined && result.total > items.length) {
        status.textContent = `${sampled ? 'Sample search: ' : ''}${formatCount(result.total)} results for ${label}, ${formatCount(items.length)} loaded`;
      } else {
        status.textContent = `${sampled ? 'Sample search: ' : ''}${formatCount(items.length)} result${items.length === 1 ? '' : 's'} for ${label}`;
      }
      more.hidden = !result.hasMore;
      more.disabled = false;
    } catch (error) {
      if (isAbort(error)) return;
      if (!append) results.element.hidden = true;
      status.textContent = '';
      alerts.replaceChildren(errorPanel(error, `${source.label} did not return results`));
      more.hidden = !append;
      more.disabled = false;
    }
  };

  function submit(): void {
    sampled = false;
    const opts: Record<string, string> = {};
    for (const control of source.controls ?? []) {
      const control_el = controlEls.get(control.name);
      if (!control_el) {
        opts[control.name] = state.opts[control.name] ?? control.default;
        continue;
      }
      opts[control.name] =
        control_el instanceof HTMLInputElement
          ? control_el.checked
            ? '1'
            : '0'
          : control_el.value;
    }
    state = { q: input.value.trim(), opts };
    writeState(source, state, true);
    void load(false);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });
  controlEls.forEach((control) => control.addEventListener('change', submit));
  more.addEventListener('click', () => {
    page += 1;
    void load(true);
  });
  window.addEventListener('popstate', () => {
    state = readState(source);
    input.value = state.q;
    void load(false);
  });

  // With no query, show the source working rather than an empty page.
  const hasColor = !!colorControl && !!state.opts[colorControl.name];
  if (!state.q && !hasColor && source.autoSample && source.samples.length > 0) {
    state = { ...state, q: source.samples[0] };
    input.value = state.q;
    sampled = true;
  }
  void load(false);
};
