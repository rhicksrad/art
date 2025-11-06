import { readState, writeState, onStateChange, type SearchState } from '../lib/urlState';
import { searchHarvard, type NormalArt } from '../lib/providers/harvard';
import { ResultCard } from '../components/ResultCard';
import { Facets, type FacetDef } from '../components/Facets';

const DEFAULT_SIZE = 30;
const DEFAULT_HAS_IMAGE = true;

type HarvardSearchResult = Awaited<ReturnType<typeof searchHarvard>>;

type MutableState = SearchState & {
  classification: string[];
  century: string[];
  sort: NonNullable<SearchState['sort']>;
  page: number;
  size: number;
  hasImage: boolean;
};

const FACET_DEFS: FacetDef[] = [
  { key: 'classification', label: 'Classification' },
  { key: 'century', label: 'Century' },
];

const observerMargin = '1200px';

function withDefaults(state: SearchState): { next: MutableState; changed: boolean } {
  const next: MutableState = {
    q: state.q,
    classification: [...(state.classification ?? [])],
    century: [...(state.century ?? [])],
    sort: state.sort ?? 'relevance',
    page: state.page && state.page > 0 ? state.page : 1,
    size: state.size && state.size > 0 ? state.size : DEFAULT_SIZE,
    hasImage: state.hasImage ?? DEFAULT_HAS_IMAGE,
  };
  let changed = false;
  if (state.sort !== next.sort) changed = true;
  if (state.page !== next.page) changed = true;
  if (state.size !== next.size) changed = true;
  if (state.hasImage !== next.hasImage) changed = true;
  if ((state.classification ?? []).join('\u0000') !== next.classification.join('\u0000')) changed = true;
  if ((state.century ?? []).join('\u0000') !== next.century.join('\u0000')) changed = true;
  return { next, changed };
}

const sortArray = (values: string[]): string[] => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

function normalizeState(state: MutableState): MutableState {
  return {
    ...state,
    classification: sortArray(state.classification ?? []),
    century: sortArray(state.century ?? []),
  };
}

function stateKey(state: MutableState): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  for (const value of state.classification) params.append('classification', value);
  for (const value of state.century) params.append('century', value);
  if (state.sort) params.set('sort', state.sort);
  params.set('page', String(state.page));
  params.set('size', String(state.size));
  params.set('hasImage', state.hasImage ? '1' : '0');
  return params.toString();
}

function formatStatus(total: number, shown: number, page: number): string {
  const totalLabel = total.toLocaleString();
  const shownLabel = shown.toLocaleString();
  return `${totalLabel} result${total === 1 ? '' : 's'} • showing ${shownLabel} item${shown === 1 ? '' : 's'} (page ${page})`;
}

function createEmptyState(onClear: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'empty-state';
  const heading = document.createElement('h2');
  heading.textContent = 'No results found';
  const message = document.createElement('p');
  message.textContent = 'Try broadening your search or removing filters.';
  const list = document.createElement('ul');
  list.className = 'empty-state__tips';
  const tips = [
    'Search for a single keyword such as “portrait”',
    'Remove century or classification filters',
    'Check spelling or try synonyms',
  ];
  for (const tip of tips) {
    const li = document.createElement('li');
    li.textContent = tip;
    list.appendChild(li);
  }
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'btn';
  reset.textContent = 'Clear filters';
  reset.addEventListener('click', onClear);
  wrap.append(heading, message, list, reset);
  return wrap;
}

function createErrorBanner(message: string): HTMLElement {
  const banner = document.createElement('div');
  banner.className = 'error-banner';
  banner.setAttribute('role', 'alert');
  const text = document.createElement('p');
  text.textContent = message;
  banner.appendChild(text);
  return banner;
}

export function mountHarvardPage(el: HTMLElement): void {
  const page = document.createElement('div');
  page.className = 'harvard-page';

  const skip = document.createElement('a');
  skip.href = '#harvard-results';
  skip.className = 'skip-link';
  skip.textContent = 'Skip to results';
  page.appendChild(skip);

  const heading = document.createElement('h1');
  heading.textContent = 'Harvard Art Museums';
  page.appendChild(heading);

  const statusEl = document.createElement('p');
  statusEl.id = 'status';
  statusEl.className = 'harvard-status';
  statusEl.setAttribute('role', 'status');
  statusEl.textContent = 'Loading…';

  const errorWrap = document.createElement('div');
  errorWrap.className = 'harvard-errors';

  const toolbar = document.createElement('form');
  toolbar.className = 'harvard-toolbar';
  toolbar.setAttribute('role', 'search');

  const searchLabel = document.createElement('label');
  searchLabel.className = 'toolbar-field';
  const searchSpan = document.createElement('span');
  searchSpan.textContent = 'Keyword';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.name = 'q';
  searchInput.placeholder = 'Search objects';
  searchInput.autocomplete = 'off';
  searchInput.setAttribute('aria-label', 'Search Harvard objects');
  searchLabel.append(searchSpan, searchInput);

  const hasImageLabel = document.createElement('label');
  hasImageLabel.className = 'toolbar-field toolbar-field--checkbox';
  const hasImageInput = document.createElement('input');
  hasImageInput.type = 'checkbox';
  hasImageInput.name = 'hasImage';
  const hasImageSpan = document.createElement('span');
  hasImageSpan.textContent = 'Has image';
  hasImageLabel.append(hasImageInput, hasImageSpan);

  const sortLabel = document.createElement('label');
  sortLabel.className = 'toolbar-field';
  const sortSpan = document.createElement('span');
  sortSpan.textContent = 'Sort by';
  const sortSelect = document.createElement('select');
  sortSelect.name = 'sort';
  const sortOptions: Array<{ value: MutableState['sort']; label: string }> = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'title', label: 'Title' },
    { value: 'date', label: 'Date' },
    { value: 'hasImage', label: 'Has image' },
  ];
  for (const option of sortOptions) {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    sortSelect.appendChild(opt);
  }
  sortLabel.append(sortSpan, sortSelect);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'btn';
  submitButton.textContent = 'Search';

  toolbar.append(searchLabel, sortLabel, hasImageLabel, submitButton);

  const layout = document.createElement('div');
  layout.className = 'harvard-layout';

  const facetsRoot = document.createElement('aside');
  facetsRoot.id = 'facets';
  facetsRoot.className = 'harvard-facets';
  facetsRoot.setAttribute('aria-live', 'polite');

  const resultsSection = document.createElement('section');
  resultsSection.className = 'harvard-results';
  const resultsHeading = document.createElement('h2');
  resultsHeading.textContent = 'Results';
  resultsHeading.id = 'harvard-results';
  const resultsContainer = document.createElement('div');
  resultsContainer.id = 'results';
  resultsContainer.className = 'results-grid';
  resultsContainer.setAttribute('aria-live', 'polite');
  const sentinel = document.createElement('div');
  sentinel.className = 'scroll-sentinel';
  resultsSection.append(resultsHeading, resultsContainer, sentinel);

  layout.append(facetsRoot, resultsSection);

  page.append(statusEl, errorWrap, toolbar, layout);
  el.replaceChildren(page);

  const start = withDefaults(readState());
  let currentState = normalizeState(start.next);
  if (start.changed) {
    writeState(currentState, true);
  }

  const cache = new Map<string, HarvardSearchResult>();
  const prefetching = new Set<string>();
  let currentItems: NormalArt[] = [];
  let lastResult: HarvardSearchResult | null = null;
  let inFlight: AbortController | null = null;
  let loading = false;
  let loadingMore = false;

  const updateControls = (state: MutableState): void => {
    searchInput.value = state.q ?? '';
    hasImageInput.checked = state.hasImage;
    sortSelect.value = state.sort;
  };

  updateControls(currentState);

  const observer = new IntersectionObserver(async (entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    if (loading || loadingMore) return;
    if (!lastResult?.nextPage) return;
    await loadMore();
  }, { rootMargin: observerMargin });
  observer.observe(sentinel);

  function clearError(): void {
    errorWrap.replaceChildren();
  }

  function setError(message: string): void {
    errorWrap.replaceChildren(createErrorBanner(message));
  }

  function renderFacets(data: HarvardSearchResult, state: MutableState): void {
    const facetEl = Facets(
      FACET_DEFS,
      data.facets,
      { classification: state.classification, century: state.century },
      (next) => {
        const updated = normalizeState({
          ...state,
          classification: sortArray(next.classification ?? []),
          century: sortArray(next.century ?? []),
          page: 1,
        });
        currentState = updated;
        writeState(currentState);
        clearError();
        void runSearch(currentState);
      },
    );
    facetsRoot.replaceChildren(facetEl);
  }

  function renderItems(items: NormalArt[], reset = true): void {
    const cards = items.map((item) => ResultCard(item));
    if (reset) {
      resultsContainer.replaceChildren(...cards);
    } else {
      resultsContainer.append(...cards);
    }
  }

  const baseState = (): MutableState => ({
    classification: [],
    century: [],
    sort: 'relevance',
    page: 1,
    size: DEFAULT_SIZE,
    hasImage: DEFAULT_HAS_IMAGE,
  });

  function showEmpty(): void {
    resultsContainer.replaceChildren(createEmptyState(() => {
      currentState = normalizeState(baseState());
      writeState(currentState);
      clearError();
      void runSearch(currentState);
    }));
  }

  async function runSearch(state: MutableState): Promise<void> {
    const normalized = normalizeState(state);
    currentState = normalized;
    const key = stateKey(normalized);
    const cached = cache.get(key);

    clearError();
    loading = true;
    statusEl.textContent = 'Loading…';
    resultsContainer.classList.toggle('is-loading', true);
    resultsContainer.setAttribute('aria-busy', 'true');
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;

    try {
      const data = cached ?? await searchHarvard(normalized, controller.signal);
      cache.set(key, data);
      if (controller.signal.aborted) return;
      currentItems = [...data.items];
      lastResult = data;
      if (currentItems.length === 0) {
        showEmpty();
      } else {
        renderItems(currentItems, true);
      }
      renderFacets(data, normalized);
      statusEl.textContent = formatStatus(data.total, currentItems.length, normalized.page);
      prefetchNext(normalized, data.nextPage);
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return;
      const message = error instanceof TypeError
        ? 'Network error loading Harvard data. Please check your connection.'
        : error instanceof Error
          ? error.message
          : 'Unknown error loading Harvard data.';
      setError(message);
      statusEl.textContent = 'Unable to load results';
    } finally {
      if (inFlight === controller) {
        inFlight = null;
        loading = false;
        resultsContainer.classList.toggle('is-loading', false);
        resultsContainer.setAttribute('aria-busy', 'false');
      }
    }
  }

  async function loadMore(): Promise<void> {
    if (!lastResult?.nextPage) return;
    loadingMore = true;
    const nextPage = lastResult.nextPage;
    const nextState = normalizeState({ ...currentState, page: nextPage });
    const key = stateKey(nextState);
    let data = cache.get(key);
    resultsContainer.setAttribute('aria-busy', 'true');
    try {
      if (!data) {
        data = await searchHarvard(nextState);
        cache.set(key, data);
      }
      currentState = nextState;
      writeState(currentState, true);
      if (data.items.length > 0) {
        currentItems = [...currentItems, ...data.items];
        renderItems(data.items, false);
      }
      lastResult = data;
      statusEl.textContent = formatStatus(data.total, currentItems.length, currentState.page);
      prefetchNext(currentState, data.nextPage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load additional results';
      setError(message);
    } finally {
      resultsContainer.setAttribute('aria-busy', 'false');
      loadingMore = false;
    }
  }

  function prefetchNext(state: MutableState, nextPage?: number): void {
    if (!nextPage) return;
    const nextState = normalizeState({ ...state, page: nextPage });
    const key = stateKey(nextState);
    if (cache.has(key) || prefetching.has(key)) return;
    prefetching.add(key);
    void searchHarvard(nextState)
      .then((data) => {
        cache.set(key, data);
      })
      .catch(() => {
        // Ignore background errors
      })
      .finally(() => {
        prefetching.delete(key);
      });
  }

  toolbar.addEventListener('submit', (event) => {
    event.preventDefault();
    currentState = normalizeState({
      ...currentState,
      q: searchInput.value.trim() || undefined,
      page: 1,
    });
    writeState(currentState);
    void runSearch(currentState);
  });

  hasImageInput.addEventListener('change', () => {
    currentState = normalizeState({
      ...currentState,
      hasImage: hasImageInput.checked,
      page: 1,
    });
    writeState(currentState);
    void runSearch(currentState);
  });

  sortSelect.addEventListener('change', () => {
    const selectedSort = sortSelect.value as MutableState['sort'];
    currentState = normalizeState({
      ...currentState,
      sort: selectedSort,
      page: 1,
    });
    writeState(currentState);
    void runSearch(currentState);
  });

  onStateChange((incoming) => {
    const { next } = withDefaults(incoming);
    const normalized = normalizeState(next);
    if (stateKey(normalized) === stateKey(currentState)) {
      return;
    }
    currentState = normalized;
    updateControls(currentState);
    void runSearch(currentState);
  });

  void runSearch(currentState);
}

export default { mount: mountHarvardPage };
