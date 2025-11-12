import { createAlert } from '../components/Alert';
import { ResultCardArxiv } from '../components/ResultCardArxiv';
import { ArxivEntry, ArxivSearchResult, searchArxiv } from '../lib/providers/arxiv';
import { ArxivSortBy, ArxivSortOrder, ArxivState } from '../lib/providers/types';
import { createUrlState } from '../lib/urlState';

const clampPageSize = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 12;
  const size = Math.floor(value);
  if (size < 5) return 5;
  if (size > 100) return 100;
  return size;
};

const normalizeStart = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.max(0, Math.floor(value));
};

const parseSortBy = (value: string | null): ArxivSortBy | undefined => {
  if (value === 'relevance' || value === 'lastUpdatedDate' || value === 'submittedDate') {
    return value;
  }
  return undefined;
};

const parseSortOrder = (value: string | null): ArxivSortOrder | undefined => {
  if (value === 'ascending' || value === 'descending') {
    return value;
  }
  return undefined;
};

const sortStrings = (values: string[]): string[] => {
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

const sortNumbers = (values: number[]): number[] => {
  return [...values].sort((a, b) => a - b);
};

type CanonicalArxivState = {
  search_query: string;
  start: number;
  max_results: number;
  sortBy: ArxivSortBy;
  sortOrder: ArxivSortOrder;
  primary_cat: string[];
  year: number[];
  author: string[];
};

const DEFAULT_STATE: CanonicalArxivState = {
  search_query: '',
  start: 0,
  max_results: 12,
  sortBy: 'relevance',
  sortOrder: 'descending',
  primary_cat: [],
  year: [],
  author: [],
};

const dedupeStrings = (values: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return sortStrings(out);
};

const dedupeNumbers = (values: number[]): number[] => {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    const normalized = Math.floor(value);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return sortNumbers(out);
};

const normalizeState = (input: ArxivState): CanonicalArxivState => {
  const search = (input.search_query ?? '').trim();
  const search_query = search;
  const start = normalizeStart(input.start);
  const max_results = clampPageSize(input.max_results);
  const sortBy = input.sortBy ?? DEFAULT_STATE.sortBy;
  const sortOrder = input.sortOrder ?? DEFAULT_STATE.sortOrder;
  const primary_cat = dedupeStrings(input.primary_cat ?? []);
  const year = dedupeNumbers(input.year ?? []);
  const author = dedupeStrings(input.author ?? []);
  return { search_query, start, max_results, sortBy, sortOrder, primary_cat, year, author };
};

const parseState = (params: URLSearchParams): CanonicalArxivState => {
  const state: ArxivState = {
    search_query: params.get('search_query') ?? undefined,
    start: params.get('start') ? Number.parseInt(params.get('start') || '', 10) : undefined,
    max_results: params.get('max_results') ? Number.parseInt(params.get('max_results') || '', 10) : undefined,
    sortBy: parseSortBy(params.get('sortBy')),
    sortOrder: parseSortOrder(params.get('sortOrder')),
    primary_cat: params.getAll('primary_cat'),
    year: params
      .getAll('year')
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isFinite(value)),
    author: params.getAll('author'),
  };
  return normalizeState(state);
};

const serializeState = (state: CanonicalArxivState): URLSearchParams => {
  const params = new URLSearchParams();
  const hasQuery = state.search_query.length > 0;
  if (hasQuery) {
    params.set('search_query', state.search_query);
  }
  if (hasQuery || state.start !== DEFAULT_STATE.start) {
    params.set('start', String(state.start));
  }
  if (hasQuery || state.max_results !== DEFAULT_STATE.max_results) {
    params.set('max_results', String(state.max_results));
  }
  if (hasQuery || state.sortBy !== DEFAULT_STATE.sortBy) {
    params.set('sortBy', state.sortBy);
  }
  if (hasQuery || state.sortOrder !== DEFAULT_STATE.sortOrder) {
    params.set('sortOrder', state.sortOrder);
  }
  state.primary_cat.forEach((value) => params.append('primary_cat', value));
  state.year.forEach((value) => params.append('year', String(value)));
  state.author.forEach((value) => params.append('author', value));
  return params;
};

const { readState, writeState, onStateChange } = createUrlState<CanonicalArxivState>({
  parse: parseState,
  serialize: serializeState,
});

const stateCacheKey = (state: CanonicalArxivState): string => {
  return serializeState(state).toString();
};

const hasSearchQuery = (state: CanonicalArxivState): boolean => {
  return state.search_query.length > 0;
};

type FacetKey = 'primary_cat' | 'year' | 'author';

const FACET_LABELS: Record<FacetKey, string> = {
  primary_cat: 'Primary category',
  year: 'Year',
  author: 'Author',
};

type FacetCounts = {
  primary_cat: Map<string, number>;
  year: Map<number, number>;
  author: Map<string, number>;
};

const buildFacetCounts = (items: ArxivEntry[]): FacetCounts => {
  const primary = new Map<string, number>();
  const year = new Map<number, number>();
  const author = new Map<string, number>();

  for (const item of items) {
    if (item.primaryCategory) {
      primary.set(item.primaryCategory, (primary.get(item.primaryCategory) ?? 0) + 1);
    }

    const publishedDate = new Date(item.published);
    if (!Number.isNaN(publishedDate.getTime())) {
      const publishedYear = publishedDate.getUTCFullYear();
      year.set(publishedYear, (year.get(publishedYear) ?? 0) + 1);
    }

    for (const name of item.authors) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      author.set(trimmed, (author.get(trimmed) ?? 0) + 1);
    }
  }

  return { primary_cat: primary, year, author };
};

const facetEntries = <T extends string | number>(map: Map<T, number>): Array<[T, number]> => {
  return Array.from(map.entries());
};

const limitAuthors = (entries: Array<[string, number]>, selected: string[]): Array<[string, number]> => {
  const sorted = entries.sort((a, b) => {
    if (b[1] === a[1]) {
      return a[0].localeCompare(b[0], undefined, { sensitivity: 'base' });
    }
    return b[1] - a[1];
  });
  const top = sorted.slice(0, 20);
  const selectedSet = new Set(selected);
  for (const value of selected) {
    if (top.some(([name]) => name === value)) continue;
    const count = entries.find(([name]) => name === value)?.[1] ?? 0;
    top.push([value, count]);
  }
  return top;
};

const renderFacet = (
  key: FacetKey,
  counts: FacetCounts,
  state: CanonicalArxivState,
  onChange: (next: CanonicalArxivState) => void,
): HTMLElement => {
  const section = document.createElement('section');
  section.className = 'facet';

  const header = document.createElement('header');
  header.className = 'facet__header';

  const title = document.createElement('h3');
  title.textContent = FACET_LABELS[key];
  header.appendChild(title);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'facet__clear';
  clear.textContent = 'Clear';

  const selected = key === 'primary_cat' ? state.primary_cat : key === 'year' ? state.year.map(String) : state.author;
  clear.disabled = selected.length === 0;
  clear.addEventListener('click', () => {
    if (selected.length === 0) return;
    const next = normalizeState({ ...state, start: 0, [key]: [] } as ArxivState);
    onChange(next);
  });

  header.appendChild(clear);
  section.appendChild(header);

  const list = document.createElement('ul');
  list.className = 'facet__list';

  let entries: Array<[string, number]>;
  if (key === 'primary_cat') {
    entries = facetEntries(counts.primary_cat).map(([value, count]) => [value, count]);
    entries.sort((a, b) => {
      if (b[1] === a[1]) {
        return a[0].localeCompare(b[0], undefined, { sensitivity: 'base' });
      }
      return b[1] - a[1];
    });
  } else if (key === 'year') {
    entries = facetEntries(counts.year).map(([value, count]) => [String(value), count]);
    entries.sort((a, b) => Number(b[0]) - Number(a[0]));
  } else {
    entries = limitAuthors(facetEntries(counts.author), state.author);
  }

  const selectedSet = new Set(selected);
  for (const value of selected) {
    if (entries.some(([entry]) => entry === value)) continue;
    entries.push([value, 0]);
  }

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'facet__empty';
    empty.textContent = 'No facet data yet';
    section.appendChild(empty);
    return section;
  }

  entries.forEach(([value, count]) => {
    const item = document.createElement('li');
    const id = `${key}-${value}`.replace(/[^a-z0-9_-]/gi, '_');

    const label = document.createElement('label');
    label.className = 'facet-option';
    label.setAttribute('for', id);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.name = key;
    input.value = value;
    input.checked = selectedSet.has(value);

    input.addEventListener('change', () => {
      const nextValues = new Set(selected);
      if (input.checked) {
        nextValues.add(value);
      } else {
        nextValues.delete(value);
      }
      let nextState: CanonicalArxivState;
      if (key === 'year') {
        const numbers = Array.from(nextValues).map((entry) => Number.parseInt(entry, 10));
        nextState = normalizeState({ ...state, start: 0, year: numbers } as ArxivState);
      } else if (key === 'primary_cat') {
        nextState = normalizeState({ ...state, start: 0, primary_cat: Array.from(nextValues) } as ArxivState);
      } else {
        nextState = normalizeState({ ...state, start: 0, author: Array.from(nextValues) } as ArxivState);
      }
      onChange(nextState);
    });

    const text = document.createElement('span');
    text.className = 'facet-option__label';
    text.textContent = value;

    const badge = document.createElement('span');
    badge.className = 'facet-option__count';
    badge.textContent = String(count);

    label.append(input, text, badge);
    item.appendChild(label);
    list.appendChild(item);
  });

  section.appendChild(list);
  return section;
};

const renderFacets = (
  counts: FacetCounts,
  state: CanonicalArxivState,
  onChange: (next: CanonicalArxivState) => void,
): HTMLElement => {
  const container = document.createElement('aside');
  container.className = 'facets';
  (['primary_cat', 'year', 'author'] as FacetKey[]).forEach((key) => {
    container.appendChild(renderFacet(key, counts, state, onChange));
  });
  return container;
};

const formatRange = (start: number, count: number): string => {
  if (count === 0) return '0 results';
  const from = start + 1;
  const to = start + count;
  return `${from}–${to}`;
};

export const mount = (root: HTMLElement): void => {
  root.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'arXiv';

  const description = document.createElement('p');
  description.className = 'page__intro';
  description.textContent = 'Explore the arXiv Atom feed with filters, infinite scroll, and shareable URL state.';

  const status = document.createElement('p');
  status.className = 'page__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const alertHost = document.createElement('div');

  const toolbarHost = document.createElement('div');
  toolbarHost.className = 'art-toolbar__host';

  const layout = document.createElement('div');
  layout.className = 'art-layout';

  const facetsRoot = document.createElement('div');
  facetsRoot.className = 'art-layout__facets';

  const resultsRoot = document.createElement('div');
  resultsRoot.className = 'art-layout__results';

  const resultList = document.createElement('div');
  resultList.className = 'result-list grid cards';
  resultsRoot.appendChild(resultList);

  const loadMore = document.createElement('button');
  loadMore.type = 'button';
  loadMore.className = 'load-more';
  loadMore.textContent = 'Load more results';
  loadMore.hidden = true;

  resultsRoot.appendChild(loadMore);

  layout.append(facetsRoot, resultsRoot);
  root.append(heading, description, toolbarHost, status, alertHost, layout);

  const stateCache = new Map<string, ArxivSearchResult>();
  const prefetchControllers = new Set<AbortController>();
  const loadedKeys = new Set<string>();

  let currentState = readState();
  let inFlight: AbortController | null = null;
  let appendTarget: string | null = null;
  let aggregated: ArxivEntry[] = [];
  let baseStart = currentState.start;
  let total = 0;
  let pendingNext: CanonicalArxivState | null = null;
  let isLoadingNext = false;

  const observer = new IntersectionObserver((entries) => {
    if (!pendingNext || isLoadingNext) return;
    if (entries.some((entry) => entry.isIntersecting)) {
      isLoadingNext = true;
      loadMore.disabled = true;
      loadMore.textContent = 'Loading…';
      appendTarget = stateCacheKey(pendingNext);
      writeState(pendingNext);
    }
  }, { rootMargin: '200px' });

  const cancelPrefetch = () => {
    for (const controller of prefetchControllers) {
      controller.abort();
    }
    prefetchControllers.clear();
  };

  const prefetchNext = (state: CanonicalArxivState) => {
    const key = stateCacheKey(state);
    if (stateCache.has(key)) return;
    const controller = new AbortController();
    prefetchControllers.add(controller);
    searchArxiv(state, controller.signal)
      .then((payload) => {
        stateCache.set(key, payload);
      })
      .catch(() => {})
      .finally(() => {
        prefetchControllers.delete(controller);
      });
  };

  const showIdleState = (state: CanonicalArxivState) => {
    inFlight?.abort();
    inFlight = null;
    cancelPrefetch();
    appendTarget = null;
    pendingNext = null;
    isLoadingNext = false;
    loadedKeys.clear();
    aggregated = [];
    total = 0;
    baseStart = state.start;
    resultList.replaceChildren();
    const prompt = document.createElement('p');
    prompt.className = 'result-list__empty';
    prompt.textContent = 'Enter a search query to begin.';
    resultList.appendChild(prompt);
    loadMore.hidden = true;
    loadMore.disabled = true;
    loadMore.textContent = 'Load more results';
    observer.unobserve(loadMore);
    status.textContent = 'Enter a search query to begin.';
    alertHost.replaceChildren();
    facetsRoot.replaceChildren();
  };

  const updateStatus = () => {
    if (aggregated.length === 0) {
      if (hasSearchQuery(currentState)) {
        status.textContent = 'No results for this combination.';
      } else {
        status.textContent = 'Enter a search query to begin.';
      }
      return;
    }
    const range = formatRange(baseStart, aggregated.length);
    status.textContent = `${range} of ${total} result${total === 1 ? '' : 's'}`;
  };

  const updateFacetsView = () => {
    const counts = buildFacetCounts(aggregated);
    const facets = renderFacets(counts, currentState, (next) => {
      appendTarget = null;
      writeState(next);
    });
    facetsRoot.replaceChildren(facets);
  };

  const showEmpty = () => {
    resultList.replaceChildren();
    const empty = document.createElement('p');
    empty.className = 'result-list__empty';
    empty.textContent = 'No results for this page.';
    resultList.appendChild(empty);
    loadMore.hidden = true;
    loadMore.disabled = true;
  };

  const showError = (error: unknown, mode: 'replace' | 'append') => {
    const message = error instanceof Error ? error.message : String(error);
    alertHost.replaceChildren(createAlert(message, 'error'));
    if (mode === 'replace') {
      showEmpty();
      status.textContent = 'Unable to load results.';
    }
    if (mode === 'append') {
      loadMore.disabled = false;
      loadMore.textContent = 'Try again';
    }
  };

  const renderResults = (payload: ArxivSearchResult, state: CanonicalArxivState, mode: 'replace' | 'append') => {
    const key = stateCacheKey(state);
    if (loadedKeys.has(key)) {
      return;
    }

    if (mode === 'replace') {
      aggregated = [];
      resultList.replaceChildren();
    }

    if (payload.items.length === 0 && aggregated.length === 0) {
      showEmpty();
    } else if (payload.items.length > 0) {
      const cards = payload.items.map((item) => ResultCardArxiv(item));
      if (mode === 'append') {
        resultList.append(...cards);
      } else {
        resultList.replaceChildren(...cards);
      }
      aggregated = [...aggregated, ...payload.items];
    }

    loadedKeys.add(key);
    total = payload.total;
    updateStatus();
    updateFacetsView();

    if (payload.nextStart !== undefined) {
      pendingNext = { ...state, start: payload.nextStart };
      loadMore.hidden = false;
      loadMore.disabled = false;
      loadMore.textContent = 'Load more results';
      observer.observe(loadMore);
      prefetchNext(pendingNext);
    } else {
      pendingNext = null;
      loadMore.hidden = true;
      loadMore.disabled = true;
      loadMore.textContent = 'End of results';
      observer.unobserve(loadMore);
    }
  };

  const run = async (state: CanonicalArxivState, mode: 'replace' | 'append'): Promise<void> => {
    if (mode === 'replace') {
      inFlight?.abort();
      cancelPrefetch();
      alertHost.replaceChildren();
      loadedKeys.clear();
      baseStart = state.start;
      pendingNext = null;
      observer.unobserve(loadMore);
      loadMore.hidden = true;
      status.textContent = 'Loading…';
    } else {
      loadMore.disabled = true;
      loadMore.textContent = 'Loading…';
    }

    const key = stateCacheKey(state);
    const cached = stateCache.get(key);
    if (cached) {
      renderResults(cached, state, mode);
      if (mode === 'append') {
        isLoadingNext = false;
      }
      return;
    }

    const controller = new AbortController();
    inFlight?.abort();
    inFlight = controller;

    try {
      const payload = await searchArxiv(state, controller.signal);
      stateCache.set(key, payload);
      renderResults(payload, state, mode);
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
      showError(error, mode);
    } finally {
      if (inFlight === controller) {
        inFlight = null;
      }
      if (mode === 'append') {
        isLoadingNext = false;
      }
    }
  };

  const updateControls = (state: CanonicalArxivState) => {
    searchInput.value = state.search_query;
    sortBySelect.value = state.sortBy;
    sortOrderSelect.value = state.sortOrder;
    if (!Array.from(pageSizeSelect.options).some((option) => Number(option.value) === state.max_results)) {
      const opt = document.createElement('option');
      opt.value = String(state.max_results);
      opt.textContent = String(state.max_results);
      pageSizeSelect.appendChild(opt);
    }
    pageSizeSelect.value = String(state.max_results);
  };

  const handleStateChange = (next: CanonicalArxivState) => {
    const key = stateCacheKey(next);
    const mode: 'replace' | 'append' = appendTarget === key ? 'append' : 'replace';
    appendTarget = null;

    if (mode === 'replace') {
      cancelPrefetch();
      aggregated = [];
    }

    currentState = next;
    updateControls(next);

    if (!hasSearchQuery(next)) {
      showIdleState(next);
      return;
    }

    void run(next, mode);
  };

  onStateChange((state) => {
    handleStateChange(state);
  });

  loadMore.addEventListener('click', () => {
    if (!pendingNext || isLoadingNext) return;
    isLoadingNext = true;
    loadMore.disabled = true;
    loadMore.textContent = 'Loading…';
    appendTarget = stateCacheKey(pendingNext);
    writeState(pendingNext);
  });

  let searchInput!: HTMLInputElement;
  let sortBySelect!: HTMLSelectElement;
  let sortOrderSelect!: HTMLSelectElement;
  let pageSizeSelect!: HTMLSelectElement;

  const form = document.createElement('form');
  form.className = 'art-toolbar form-row';

  const searchField = document.createElement('label');
  searchField.className = 'art-toolbar__field';
  const searchLabel = document.createElement('span');
  searchLabel.textContent = 'Query';
  searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.name = 'search_query';
  searchInput.placeholder = 'e.g., cat:cs.AI or all:graph';
  searchField.append(searchLabel, searchInput);

  const sortByField = document.createElement('label');
  sortByField.className = 'art-toolbar__field';
  const sortByLabel = document.createElement('span');
  sortByLabel.textContent = 'Sort by';
  sortBySelect = document.createElement('select');
  sortBySelect.name = 'sortBy';
  const sortOptions: Array<{ value: ArxivSortBy; label: string }> = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'lastUpdatedDate', label: 'Last updated' },
    { value: 'submittedDate', label: 'Submitted date' },
  ];
  sortOptions.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    sortBySelect.appendChild(opt);
  });
  sortByField.append(sortByLabel, sortBySelect);

  const sortOrderField = document.createElement('label');
  sortOrderField.className = 'art-toolbar__field';
  const sortOrderLabel = document.createElement('span');
  sortOrderLabel.textContent = 'Order';
  sortOrderSelect = document.createElement('select');
  sortOrderSelect.name = 'sortOrder';
  const orderOptions: Array<{ value: ArxivSortOrder; label: string }> = [
    { value: 'descending', label: 'Descending' },
    { value: 'ascending', label: 'Ascending' },
  ];
  orderOptions.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    sortOrderSelect.appendChild(opt);
  });
  sortOrderField.append(sortOrderLabel, sortOrderSelect);

  const sizeField = document.createElement('label');
  sizeField.className = 'art-toolbar__field';
  const sizeLabel = document.createElement('span');
  sizeLabel.textContent = 'Results per page';
  pageSizeSelect = document.createElement('select');
  pageSizeSelect.name = 'max_results';
  [12, 24, 36, 48, 60, 100].forEach((value) => {
    const opt = document.createElement('option');
    opt.value = String(value);
    opt.textContent = String(value);
    pageSizeSelect.appendChild(opt);
  });
  sizeField.append(sizeLabel, pageSizeSelect);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = 'Search';

  form.append(searchField, sortByField, sortOrderField, sizeField, submitButton);
  toolbarHost.appendChild(form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = searchInput.value.trim();
    const next = normalizeState({
      ...currentState,
      search_query: query,
      start: 0,
    });
    appendTarget = null;
    writeState(next);
  });

  sortBySelect.addEventListener('change', () => {
    const next = normalizeState({ ...currentState, sortBy: sortBySelect.value as ArxivSortBy, start: 0 });
    appendTarget = null;
    writeState(next);
  });

  sortOrderSelect.addEventListener('change', () => {
    const next = normalizeState({ ...currentState, sortOrder: sortOrderSelect.value as ArxivSortOrder, start: 0 });
    appendTarget = null;
    writeState(next);
  });

  pageSizeSelect.addEventListener('change', () => {
    const next = normalizeState({ ...currentState, max_results: Number(pageSizeSelect.value), start: 0 });
    appendTarget = null;
    writeState(next);
  });

  updateControls(currentState);
  void run(currentState, 'replace');
};

export default { mount };
