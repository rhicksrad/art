import { Facets } from '../components/Facets';
import type { PrincetonFacetDefinition } from '../components/Facets';
import { ResultCard } from '../components/ResultCard';
import { searchPrinceton } from '../lib/providers/princeton';
import { onStateChange, readState, writeState } from '../lib/urlState';
import { NormalArt, SearchState } from '../lib/types';

const FACET_DEFINITIONS: PrincetonFacetDefinition[] = [
  {
    key: 'classification',
    label: 'Classification',
    getValues: (state) => state.classification,
    setValues: (state, values) => ({ ...state, classification: values, page: 1 }),
  },
  {
    key: 'century',
    label: 'Century',
    getValues: (state) => state.century,
    setValues: (state, values) => ({ ...state, century: values, page: 1 }),
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

const stateKey = (state: SearchState): string => {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  for (const value of state.classification ?? []) params.append('classification', value);
  for (const value of state.century ?? []) params.append('century', value);
  if (state.sort) params.set('sort', state.sort);
  if (state.page) params.set('page', String(state.page));
  if (state.size) params.set('size', String(state.size));
  if (state.hasImage === false) params.set('hasImage', '0');
  if (state.hasImage === true) params.set('hasImage', '1');
  return params.toString();
};

const createToolbar = (
  state: SearchState,
  onSubmit: (next: SearchState) => void,
  onImmediateChange: (next: SearchState) => void,
) => {
  const form = document.createElement('form');
  form.className = 'art-toolbar';

  const searchField = document.createElement('label');
  searchField.className = 'art-toolbar__field';
  const searchSpan = document.createElement('span');
  searchSpan.textContent = 'Search';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.name = 'q';
  searchInput.value = state.q ?? '';
  searchInput.placeholder = 'Search artworks';
  searchInput.autocomplete = 'off';
  searchField.append(searchSpan, searchInput);

  const sortField = document.createElement('label');
  sortField.className = 'art-toolbar__field';
  const sortSpan = document.createElement('span');
  sortSpan.textContent = 'Sort by';
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
    if ((state.sort ?? 'relevance') === option.value) {
      opt.selected = true;
    }
    sortSelect.appendChild(opt);
  });
  sortSelect.addEventListener('change', () => {
    const next: SearchState = { ...state, sort: sortSelect.value as SearchState['sort'], page: 1 };
    onImmediateChange(next);
  });
  sortField.append(sortSpan, sortSelect);

  const sizeField = document.createElement('label');
  sizeField.className = 'art-toolbar__field';
  const sizeSpan = document.createElement('span');
  sizeSpan.textContent = 'Results per page';
  const sizeSelect = document.createElement('select');
  const sizeOptions = [15, 30, 45, 60];
  sizeOptions.forEach((value) => {
    const opt = document.createElement('option');
    opt.value = String(value);
    opt.textContent = String(value);
    if ((state.size ?? 30) === value) opt.selected = true;
    sizeSelect.appendChild(opt);
  });
  if (!sizeOptions.includes(state.size ?? 30)) {
    const opt = document.createElement('option');
    opt.value = String(state.size);
    opt.textContent = String(state.size);
    opt.selected = true;
    sizeSelect.appendChild(opt);
  }
  sizeSelect.addEventListener('change', () => {
    const next: SearchState = { ...state, size: Number(sizeSelect.value), page: 1 };
    onImmediateChange(next);
  });
  sizeField.append(sizeSpan, sizeSelect);

  const imageToggle = document.createElement('label');
  imageToggle.className = 'art-toolbar__field art-toolbar__toggle';
  const imageSpan = document.createElement('span');
  imageSpan.textContent = 'Only records with images';
  const imageCheckbox = document.createElement('input');
  imageCheckbox.type = 'checkbox';
  imageCheckbox.checked = state.hasImage !== false;
  imageCheckbox.addEventListener('change', () => {
    const next: SearchState = { ...state, hasImage: imageCheckbox.checked, page: 1 };
    onImmediateChange(next);
  });
  imageToggle.append(imageCheckbox, imageSpan);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = 'Search';

  form.append(searchField, sortField, sizeField, imageToggle, submitButton);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const next: SearchState = {
      ...state,
      q: searchInput.value.trim() || undefined,
      page: 1,
    };
    onSubmit(next);
  });

  return { form, fields: { searchInput, sortSelect, sizeSelect, imageCheckbox } };
};

const createPagination = (onSelect: (page: number) => void) => {
  const nav = document.createElement('nav');
  nav.className = 'art-pagination';

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.textContent = 'Previous';

  const indicator = document.createElement('span');
  indicator.className = 'art-pagination__indicator';

  const next = document.createElement('button');
  next.type = 'button';
  next.textContent = 'Next';

  nav.append(prev, indicator, next);

  return {
    element: nav,
    update(state: SearchState, payload: SearchPayload) {
      const page = state.page ?? 1;
      prev.disabled = page <= 1;
      next.disabled = !payload.nextPage;
      indicator.textContent = `Page ${page}`;
    },
    bind(state: SearchState) {
      prev.onclick = () => {
        const page = Math.max(1, (state.page ?? 1) - 1);
        if (page === state.page) return;
        onSelect(page);
      };
      next.onclick = () => {
        const page = (state.page ?? 1) + 1;
        onSelect(page);
      };
    },
  };
};

export const mount = (root: HTMLElement): void => {
  root.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'Princeton University Art Museum';

  const status = document.createElement('p');
  status.className = 'page__status';

  const layout = document.createElement('div');
  layout.className = 'art-layout';

  const facetsRoot = document.createElement('div');
  facetsRoot.className = 'art-layout__facets';

  const resultsRoot = document.createElement('div');
  resultsRoot.className = 'art-layout__results card-grid';

  const toolbarHost = document.createElement('div');
  toolbarHost.className = 'art-toolbar__host';

  const paginationHost = document.createElement('div');
  paginationHost.className = 'art-pagination__host';

  layout.append(facetsRoot, resultsRoot);
  root.append(heading, toolbarHost, status, layout, paginationHost);

  let currentState = readState();

  const pagination = createPagination((page) => {
    writeState({ ...currentState, page });
  });
  paginationHost.appendChild(pagination.element);

  const { form, fields } = createToolbar(
    currentState,
    (next) => writeState(next),
    (next) => writeState(next),
  );
  toolbarHost.appendChild(form);

  const renderResults = (payload: SearchPayload, state: SearchState) => {
    if (payload.items.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No matching objects.';
      resultsRoot.replaceChildren(empty);
    } else {
      const cards = payload.items.map((item) => ResultCard(item));
      resultsRoot.replaceChildren(...cards);
    }

    const facets = Facets(FACET_DEFINITIONS, payload.facets, state, (nextState) => {
      writeState(nextState);
    });
    facetsRoot.replaceChildren(facets);

    status.textContent = `${payload.total} result${payload.total === 1 ? '' : 's'}`;
    pagination.update(state, payload);
    pagination.bind(state);
  };

  const setLoading = () => {
    status.textContent = 'Loading…';
  };

  const showError = (error: unknown) => {
    resultsRoot.replaceChildren();
    const message = document.createElement('p');
    message.textContent = error instanceof Error ? error.message : String(error);
    resultsRoot.appendChild(message);
    status.textContent = 'Unable to load records.';
  };

  const prefetchNext = (state: SearchState, payload: SearchPayload) => {
    if (!payload.nextPage) return;
    const nextState = { ...state, page: payload.nextPage };
    const key = stateKey(nextState);
    if (cache.has(key)) return;
    const controller = new AbortController();
    searchPrinceton(nextState, controller.signal)
      .then((data) => {
        cache.set(key, data);
      })
      .catch(() => {
        controller.abort();
      });
  };

  const run = async (state: SearchState) => {
    currentState = state;
    fields.searchInput.value = state.q ?? '';
    fields.sortSelect.value = state.sort ?? 'relevance';
    fields.sizeSelect.value = String(state.size ?? 30);
    fields.imageCheckbox.checked = state.hasImage !== false;

    const key = stateKey(state);
    const cached = cache.get(key);
    if (cached) {
      renderResults(cached, state);
      prefetchNext(state, cached);
      return;
    }

    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;

    try {
      setLoading();
      const data = await searchPrinceton(state, controller.signal);
      cache.set(key, data);
      renderResults(data, state);
      prefetchNext(state, data);
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
      showError(error);
    }
  };

  onStateChange((state) => {
    void run(state);
  });
};

export default { mount };
