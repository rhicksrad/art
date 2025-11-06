import { Facets } from '../components/Facets';
import { ResultCard } from '../components/ResultCard';
import { searchHarvard } from '../lib/providers/harvard';
import { onStateChange, readState, writeState, type SearchState, _internalStateToSearchParams } from '../lib/urlState';

const DEFAULT_SIZE = 30;
const FACET_DEFS = [
  { key: 'classification', label: 'Classification' },
  { key: 'century', label: 'Century' },
] as const;

const formatNumber = (value: number): string => new Intl.NumberFormat().format(value);

type SearchPayload = Awaited<ReturnType<typeof searchHarvard>>;

type PageElements = {
  status: HTMLElement;
  error: HTMLElement;
  results: HTMLElement;
  facets: HTMLElement;
  form: HTMLFormElement;
  queryInput: HTMLInputElement;
  sortSelect: HTMLSelectElement;
  hasImageToggle: HTMLInputElement;
  nextBtn: HTMLButtonElement;
  prevBtn: HTMLButtonElement;
  pageIndicator: HTMLElement;
  pager: HTMLElement;
};

const normalizeState = (state: SearchState): SearchState => {
  const cleanText = state.q?.trim();
  const normalizeArray = (values?: string[]) => {
    if (!values) return undefined;
    const filtered = values
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (filtered.length === 0) return undefined;
    const unique = Array.from(new Set(filtered));
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
  };

  const normalized: SearchState = {};
  if (cleanText) normalized.q = cleanText;

  const classification = normalizeArray(state.classification);
  if (classification) normalized.classification = classification;
  const century = normalizeArray(state.century);
  if (century) normalized.century = century;

  const sort = state.sort ?? 'relevance';
  normalized.sort = sort;

  const size = state.size && state.size > 0 ? Math.min(Math.trunc(state.size), 100) : DEFAULT_SIZE;
  normalized.size = size;

  const page = state.page && state.page > 0 ? Math.trunc(state.page) : 1;
  normalized.page = page;

  const hasImage = state.hasImage ?? true;
  normalized.hasImage = hasImage;

  return normalized;
};

const stateKey = (state: SearchState): string => _internalStateToSearchParams(state).toString();

const buildPageElements = (): PageElements => {
  const status = document.createElement('p');
  status.className = 'page__status';
  status.setAttribute('aria-live', 'polite');

  const error = document.createElement('div');
  error.className = 'page__error';
  error.setAttribute('role', 'alert');

  const results = document.createElement('div');
  results.className = 'results-grid';
  results.setAttribute('role', 'list');

  const facets = document.createElement('aside');
  facets.className = 'page__facets';

  const form = document.createElement('form');
  form.className = 'harvard-toolbar';
  form.setAttribute('role', 'search');

  const queryLabel = document.createElement('label');
  queryLabel.className = 'harvard-toolbar__label';
  queryLabel.textContent = 'Keyword';
  const queryInput = document.createElement('input');
  queryInput.type = 'search';
  queryInput.name = 'q';
  queryInput.autocomplete = 'off';
  queryInput.placeholder = 'Search artworks';
  queryInput.className = 'harvard-toolbar__input';
  queryLabel.appendChild(queryInput);

  const sortLabel = document.createElement('label');
  sortLabel.className = 'harvard-toolbar__label';
  sortLabel.textContent = 'Sort by';
  const sortSelect = document.createElement('select');
  sortSelect.name = 'sort';
  sortSelect.className = 'harvard-toolbar__input';
  const options: Array<{ value: SearchState['sort']; text: string }> = [
    { value: 'relevance', text: 'Relevance' },
    { value: 'title', text: 'Title (A–Z)' },
    { value: 'date', text: 'Date' },
    { value: 'hasImage', text: 'Has image' },
  ];
  for (const option of options) {
    const opt = document.createElement('option');
    opt.value = option.value ?? 'relevance';
    opt.textContent = option.text;
    sortSelect.appendChild(opt);
  }
  sortLabel.appendChild(sortSelect);

  const hasImageWrapper = document.createElement('div');
  hasImageWrapper.className = 'harvard-toolbar__toggle';
  const hasImageToggle = document.createElement('input');
  hasImageToggle.type = 'checkbox';
  hasImageToggle.id = 'has-image-toggle';
  hasImageToggle.name = 'hasImage';
  const hasImageLabel = document.createElement('label');
  hasImageLabel.htmlFor = hasImageToggle.id;
  hasImageLabel.textContent = 'Only show records with images';
  hasImageWrapper.append(hasImageToggle, hasImageLabel);

  form.append(queryLabel, sortLabel, hasImageWrapper);

  const pager = document.createElement('nav');
  pager.className = 'harvard-pager';
  pager.setAttribute('aria-label', 'Results pagination');

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'harvard-pager__button';
  prevBtn.textContent = 'Previous';

  const pageIndicator = document.createElement('span');
  pageIndicator.className = 'harvard-pager__indicator';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'harvard-pager__button';
  nextBtn.textContent = 'Next';

  pager.append(prevBtn, pageIndicator, nextBtn);

  return {
    status,
    error,
    results,
    facets,
    form,
    queryInput,
    sortSelect,
    hasImageToggle,
    nextBtn,
    prevBtn,
    pageIndicator,
    pager,
  };
};

export function mount(el: HTMLElement): void {
  el.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'Harvard Art Museums';

  const elements = buildPageElements();

  const controls = document.createElement('div');
  controls.className = 'harvard-controls';
  controls.append(elements.form, elements.status, elements.error);

  const layout = document.createElement('div');
  layout.className = 'harvard-layout';

  const facetsColumn = document.createElement('aside');
  facetsColumn.className = 'harvard-facets';
  facetsColumn.append(elements.facets);

  const resultsSection = document.createElement('section');
  resultsSection.className = 'harvard-results';
  resultsSection.append(elements.results);

  layout.append(facetsColumn, resultsSection);

  el.append(heading, controls, layout, elements.pager);

  let currentState = normalizeState(readState());
  syncControls(elements, currentState);
  writeState(currentState, true);

  const setState = (next: SearchState, replace = false) => {
    currentState = normalizeState(next);
    syncControls(elements, currentState);
    writeState(currentState, replace);
    void runSearch(currentState, elements, setState);
  };

  const handlePop = (next: SearchState) => {
    currentState = normalizeState(next);
    syncControls(elements, currentState);
    void runSearch(currentState, elements, setState);
  };

  const removeListener = onStateChange(handlePop);

  elements.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(elements.form);
    const q = (formData.get('q') as string | null)?.trim() ?? '';
    setState({ ...currentState, q, page: 1 });
  });

  elements.sortSelect.addEventListener('change', () => {
    const sort = elements.sortSelect.value as SearchState['sort'];
    setState({ ...currentState, sort, page: 1 });
  });

  elements.hasImageToggle.addEventListener('change', () => {
    setState({ ...currentState, hasImage: elements.hasImageToggle.checked, page: 1 });
  });

  elements.prevBtn.addEventListener('click', () => {
    const currentPage = currentState.page ?? 1;
    if (currentPage <= 1) return;
    setState({ ...currentState, page: currentPage - 1 }, true);
  });

  elements.nextBtn.addEventListener('click', () => {
    const currentPage = currentState.page ?? 1;
    setState({ ...currentState, page: currentPage + 1 }, true);
  });

  void runSearch(currentState, elements, setState);

  (el as unknown as { __cleanup?: () => void }).__cleanup = () => {
    removeListener();
  };
}

const cache = new Map<string, SearchPayload>();
let inFlight: AbortController | null = null;

async function runSearch(state: SearchState, elements: PageElements, onUpdate: (next: SearchState, replace?: boolean) => void): Promise<void> {
  const normalized = normalizeState(state);
  const key = stateKey(normalized);

  elements.error.replaceChildren();
  elements.status.textContent = 'Loading…';
  elements.results.replaceChildren();

  inFlight?.abort();
  const ac = new AbortController();
  inFlight = ac;

  try {
    const payload = cache.get(key) ?? (await searchHarvard(normalized, ac.signal));
    cache.set(key, payload);
    renderResults(payload, normalized, elements, onUpdate);
    elements.status.textContent = `${formatNumber(payload.total)} result${payload.total === 1 ? '' : 's'}`;
    prefetchNext(normalized, payload.nextPage);
  } catch (error) {
    if ((error as DOMException).name === 'AbortError') {
      return;
    }
    showError(error, elements);
  }
}

const showError = (error: unknown, elements: PageElements): void => {
  const message = error instanceof Error ? error.message : String(error);
  elements.status.textContent = 'Unable to load results.';
  const banner = document.createElement('div');
  banner.className = 'error-banner';
  const heading = document.createElement('strong');
  heading.textContent = navigator.onLine === false ? 'Network error' : 'Harvard API error';
  const body = document.createElement('p');
  body.textContent = message;
  banner.append(heading, body);
  elements.error.replaceChildren(banner);
};

const renderResults = (
  payload: SearchPayload,
  state: SearchState,
  elements: PageElements,
  onUpdate: (next: SearchState, replace?: boolean) => void,
): void => {
  const { items, facets, nextPage } = payload;
  if (items.length === 0) {
    elements.results.replaceChildren(
      buildEmptyState(() =>
        onUpdate(
          {
            q: '',
            sort: 'relevance',
            page: 1,
            size: state.size,
            hasImage: true,
          },
          true,
        ),
      ),
    );
  } else {
    const cards = items.map((item) => ResultCard(item));
    cards.forEach((card) => card.setAttribute('role', 'listitem'));
    elements.results.replaceChildren(...cards);
  }

  const facetNode = Facets([...FACET_DEFS], facets, state, (next) => {
    onUpdate({ ...state, ...next, page: 1 });
  });
  elements.facets.replaceChildren(facetNode);

  const currentPage = state.page ?? 1;
  elements.prevBtn.disabled = currentPage <= 1;
  elements.nextBtn.disabled = !nextPage;
  elements.pageIndicator.textContent = `Page ${currentPage}`;
};

const buildEmptyState = (onClear: () => void): HTMLElement => {
  const empty = document.createElement('div');
  empty.className = 'results-empty';
  const title = document.createElement('h2');
  title.textContent = 'No records match your filters';
  const hint = document.createElement('p');
  hint.textContent = 'Try adjusting your filters or search keywords.';
  const list = document.createElement('ul');
  list.className = 'results-empty__tips';
  ['Use broader terms', 'Remove some facets', 'Check spelling of artist or title'].forEach((tip) => {
    const li = document.createElement('li');
    li.textContent = tip;
    list.appendChild(li);
  });
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'results-empty__clear';
  button.textContent = 'Clear filters';
  button.addEventListener('click', onClear);
  empty.append(title, hint, list, button);
  return empty;
};

const prefetchNext = (state: SearchState, nextPage?: number): void => {
  if (!nextPage) return;
  const nextState = normalizeState({ ...state, page: nextPage });
  const key = stateKey(nextState);
  if (cache.has(key)) return;
  void searchHarvard(nextState)
    .then((payload) => {
      cache.set(key, payload);
    })
    .catch(() => {
      /* ignore prefetch errors */
    });
};

const syncControls = (elements: PageElements, state: SearchState): void => {
  elements.queryInput.value = state.q ?? '';
  elements.sortSelect.value = state.sort ?? 'relevance';
  elements.hasImageToggle.checked = state.hasImage ?? true;
  elements.pageIndicator.textContent = `Page ${state.page ?? 1}`;
};
