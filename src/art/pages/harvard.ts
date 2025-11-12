import { Facets } from '../components/Facets';
import { ResultCard } from '../components/ResultCard';
import { searchHarvard } from '../lib/providers/harvard';
import { onStateChange, readState, writeState } from '../lib/urlState';
import type { NormalArt, SearchState } from '../lib/types';

const DEFAULT_SIZE = 30;

const FACET_DEFINITIONS = [
  {
    key: 'classification' as const,
    label: 'Classification',
    setValues: (state: SearchState, values: string[] | undefined) => ({
      ...state,
      classification: values,
      page: 1,
    }),
  },
  {
    key: 'century' as const,
    label: 'Century',
    setValues: (state: SearchState, values: string[] | undefined) => ({
      ...state,
      century: values,
      page: 1,
    }),
  },
];

type SearchPayload = {
  items: NormalArt[];
  total: number;
  facets: NormalArt['facets'];
  nextPage?: number;
};

const cache = new Map<string, SearchPayload>();
let inFlight: AbortController | null = null;
let currentState: SearchState = {};
let currentPayload: SearchPayload | null = null;
let loadingMore = false;

const canonicalParams = (state: SearchState, includePage = true): URLSearchParams => {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  const classification = [...(state.classification ?? [])].sort((a, b) => a.localeCompare(b));
  classification.forEach((value) => params.append('classification', value));
  const centuries = [...(state.century ?? [])].sort((a, b) => a.localeCompare(b));
  centuries.forEach((value) => params.append('century', value));
  if (state.sort) params.set('sort', state.sort);
  if (includePage) params.set('page', String(state.page ?? 1));
  params.set('size', String(state.size ?? DEFAULT_SIZE));
  params.set('hasImage', state.hasImage === false ? '0' : '1');
  return params;
};

const stateKey = (state: SearchState): string => canonicalParams(state).toString();

const statesEqual = (a: SearchState, b: SearchState): boolean => {
  return canonicalParams(a).toString() === canonicalParams(b).toString();
};

const applyDefaults = (state: SearchState): SearchState => {
  const next: SearchState = { ...state };
  if (!next.size || next.size <= 0) next.size = DEFAULT_SIZE;
  if (!next.sort) next.sort = 'relevance';
  if (next.hasImage === undefined) next.hasImage = true;
  if (!next.page || next.page < 1) next.page = 1;
  if (next.q) {
    const trimmed = next.q.trim();
    next.q = trimmed.length ? trimmed : undefined;
  }
  return next;
};

const createToolbar = (
  initialState: SearchState,
  onSubmit: (next: SearchState) => void,
  onImmediateChange: (next: SearchState) => void,
) => {
  let current = { ...initialState };

  const form = document.createElement('form');
  form.className = 'art-toolbar form-row';
  form.setAttribute('aria-label', 'Search Harvard collection');

  const searchField = document.createElement('label');
  searchField.className = 'art-toolbar__field';
  const searchLabel = document.createElement('span');
  searchLabel.textContent = 'Search';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.name = 'q';
  searchInput.placeholder = 'Search artworks';
  searchInput.autocomplete = 'off';
  searchField.append(searchLabel, searchInput);

  const sortField = document.createElement('label');
  sortField.className = 'art-toolbar__field';
  const sortLabel = document.createElement('span');
  sortLabel.textContent = 'Sort by';
  const sortSelect = document.createElement('select');
  sortSelect.name = 'sort';
  const sortOptions: { value: NonNullable<SearchState['sort']>; label: string }[] = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'title', label: 'Title' },
    { value: 'date', label: 'Date' },
    { value: 'hasImage', label: 'Has image' },
  ];
  sortOptions.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    sortSelect.appendChild(opt);
  });
  sortSelect.addEventListener('change', () => {
    const next: SearchState = { ...current, sort: sortSelect.value as SearchState['sort'], page: 1 };
    onImmediateChange(next);
  });
  sortField.append(sortLabel, sortSelect);

  const sizeField = document.createElement('label');
  sizeField.className = 'art-toolbar__field';
  const sizeLabel = document.createElement('span');
  sizeLabel.textContent = 'Results per page';
  const sizeSelect = document.createElement('select');
  const sizeOptions = [15, 30, 45, 60, 90];
  sizeOptions.forEach((value) => {
    const opt = document.createElement('option');
    opt.value = String(value);
    opt.textContent = String(value);
    sizeSelect.appendChild(opt);
  });
  sizeSelect.addEventListener('change', () => {
    const next: SearchState = { ...current, size: Number(sizeSelect.value), page: 1 };
    onImmediateChange(next);
  });
  sizeField.append(sizeLabel, sizeSelect);

  const imageToggle = document.createElement('label');
  imageToggle.className = 'art-toolbar__field art-toolbar__toggle';
  const imageCheckbox = document.createElement('input');
  imageCheckbox.type = 'checkbox';
  const imageText = document.createElement('span');
  imageText.textContent = 'Only objects with images';
  imageCheckbox.addEventListener('change', () => {
    const next: SearchState = { ...current, hasImage: imageCheckbox.checked, page: 1 };
    onImmediateChange(next);
  });
  imageToggle.append(imageCheckbox, imageText);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Search';

  form.append(searchField, sortField, sizeField, imageToggle, submit);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const next: SearchState = {
      ...current,
      q: searchInput.value.trim() || undefined,
      page: 1,
    };
    onSubmit(next);
  });

  const update = (next: SearchState) => {
    current = { ...next };
    searchInput.value = next.q ?? '';
    sortSelect.value = next.sort ?? 'relevance';
    const sizeValue = String(next.size ?? DEFAULT_SIZE);
    if (!Array.from(sizeSelect.options).some((opt) => opt.value === sizeValue)) {
      const custom = document.createElement('option');
      custom.value = sizeValue;
      custom.textContent = sizeValue;
      sizeSelect.appendChild(custom);
    }
    sizeSelect.value = sizeValue;
    imageCheckbox.checked = next.hasImage !== false;
  };

  update(initialState);

  return { form, update };
};

const createEmptyState = (state: SearchState, onClear: () => void): HTMLElement => {
  const wrapper = document.createElement('div');
  wrapper.className = 'empty-state';

  const title = document.createElement('h2');
  title.textContent = 'No results';
  const message = document.createElement('p');
  message.textContent = 'Try different keywords or clear your filters.';

  const suggestions = document.createElement('ul');
  suggestions.className = 'empty-state__suggestions';
  const hints = ['Use singular words (e.g. "dog" instead of "dogs")', 'Try a different classification', 'Remove century filters'];
  hints.forEach((hint) => {
    const li = document.createElement('li');
    li.textContent = hint;
    suggestions.appendChild(li);
  });

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.textContent = 'Clear filters';
  clearButton.className = 'empty-state__action';
  clearButton.addEventListener('click', () => onClear());

  wrapper.append(title, message, suggestions, clearButton);
  return wrapper;
};

const createErrorBanner = (message: string, variant: 'network' | 'api'): HTMLElement => {
  const div = document.createElement('div');
  div.className = `alert ${variant === 'network' ? 'alert--error' : 'alert--info'}`;
  const span = document.createElement('span');
  span.className = 'alert__message';
  span.textContent = message;
  div.appendChild(span);
  return div;
};

const loadPages = async (state: SearchState, signal?: AbortSignal): Promise<SearchPayload> => {
  const target = state.page ?? 1;
  let aggregated: SearchPayload | null = null;

  for (let page = 1; page <= target; page += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const nextState = { ...state, page };
    const key = stateKey(nextState);
    let data = cache.get(key);
    if (!data) {
      data = await searchHarvard(nextState, signal);
      cache.set(key, data);
    }
    if (!aggregated) {
      aggregated = {
        items: [...data.items],
        total: data.total,
        facets: data.facets,
        nextPage: data.nextPage,
      };
    } else {
      aggregated.items.push(...data.items);
      aggregated.total = data.total;
      if (page === 1 && Object.keys(data.facets).length > 0) {
        aggregated.facets = data.facets;
      }
      aggregated.nextPage = data.nextPage;
    }
  }

  return (
    aggregated ?? {
      items: [],
      total: 0,
      facets: {},
      nextPage: undefined,
    }
  );
};

export const mount = (root: HTMLElement): void => {
  currentState = applyDefaults(readState());
  root.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'Harvard Art Museums';

  const toolbarHost = document.createElement('div');
  toolbarHost.className = 'art-toolbar__host';

  const status = document.createElement('p');
  status.className = 'page__status';
  status.setAttribute('aria-live', 'polite');

  const alertHost = document.createElement('div');

  const layout = document.createElement('div');
  layout.className = 'art-layout';

  const facetsRoot = document.createElement('div');
  facetsRoot.className = 'art-layout__facets';

  const resultsRoot = document.createElement('div');
  resultsRoot.className = 'art-layout__results grid cards';

  const sentinel = document.createElement('div');
  sentinel.className = 'art-scroll-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');

  layout.append(facetsRoot, resultsRoot);
  root.append(heading, toolbarHost, status, alertHost, layout);

  const toolbar = createToolbar(
    currentState,
    (next) => writeState(next),
    (next) => writeState(next),
  );
  toolbarHost.appendChild(toolbar.form);

  const renderResults = (payload: SearchPayload, state: SearchState) => {
    currentPayload = payload;
    resultsRoot.innerHTML = '';
    if (payload.items.length === 0) {
      const empty = createEmptyState(state, () => {
        writeState({ size: state.size ?? DEFAULT_SIZE, sort: 'relevance', hasImage: true, page: 1 });
      });
      resultsRoot.appendChild(empty);
    } else {
      const fragment = document.createDocumentFragment();
      payload.items.forEach((item) => fragment.appendChild(ResultCard(item)));
      resultsRoot.append(fragment, sentinel);
    }

    const facets = Facets(
      FACET_DEFINITIONS,
      payload.facets ?? {},
      state,
      (nextState) => writeState(nextState),
    );
    facetsRoot.replaceChildren(facets);

    const total = payload.total;
    status.textContent = `${total} result${total === 1 ? '' : 's'}`;
  };

  const renderIdleState = () => {
    currentPayload = null;
    resultsRoot.replaceChildren();
    const message = document.createElement('p');
    message.className = 'page__status';
    message.textContent = 'Enter a search term to explore the collection.';
    resultsRoot.appendChild(message);
    facetsRoot.replaceChildren();
    status.textContent = 'Enter a search term to begin.';
  };

  const setLoading = (state: SearchState) => {
    if ((state.page ?? 1) > 1) {
      status.textContent = 'Loading more…';
    } else {
      status.textContent = 'Loading…';
    }
  };

  const showError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    alertHost.replaceChildren(createErrorBanner(message, /network|failed to fetch/i.test(message) ? 'network' : 'api'));
    resultsRoot.innerHTML = '';
    status.textContent = 'Unable to load records.';
  };

  const clearError = () => {
    alertHost.innerHTML = '';
  };

  const prefetchNext = (state: SearchState, payload: SearchPayload) => {
    if (!payload.nextPage) return;
    const nextState = { ...state, page: payload.nextPage };
    const key = stateKey(nextState);
    if (cache.has(key)) return;
    const controller = new AbortController();
    searchHarvard(nextState, controller.signal)
      .then((data) => {
        cache.set(key, data);
      })
      .catch(() => controller.abort());
  };

  const run = async (incoming: SearchState) => {
    const state = applyDefaults(incoming);
    currentState = state;
    toolbar.update(state);

    clearError();

    if (!state.q) {
      inFlight?.abort();
      inFlight = null;
      loadingMore = false;
      renderIdleState();
      return;
    }

    setLoading(state);

    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;

    try {
      const payload = await loadPages(state, controller.signal);
      if (controller.signal.aborted) return;
      cache.set(stateKey(state), payload);
      renderResults(payload, state);
      prefetchNext(state, payload);
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
      showError(error);
    } finally {
      loadingMore = false;
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      if (loadingMore) return;
      const payload = currentPayload;
      if (!payload?.nextPage) return;
      loadingMore = true;
      const nextState = { ...currentState, page: payload.nextPage };
      writeState(nextState);
    },
    { rootMargin: '1200px' },
  );

  observer.observe(sentinel);

    onStateChange((state) => {
    const withDefaults = applyDefaults(state);
    if (!statesEqual(withDefaults, state)) {
      writeState(withDefaults, { replace: true });
      return;
    }
    void run(withDefaults);
  });
};

export default { mount };
