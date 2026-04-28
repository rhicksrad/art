import { Facets, type FacetDefinition } from '../components/Facets';
import { ResultCardDataverse } from '../components/ResultCardDataverse';
import { searchDataverse } from '../lib/providers/dataverse';
import type { DVFacets, DVSearchState, NormalRecord } from '../lib/providers/types';
import { createUrlState } from '../lib/urlState';

type ResultType = NonNullable<DVSearchState['type']>[number];
type SortOption = NonNullable<DVSearchState['sort']>;
type OrderOption = NonNullable<DVSearchState['order']>;

const TYPE_VALUES: ResultType[] = ['dataset', 'file', 'dataverse'];

const parseMulti = (params: URLSearchParams, key: string, aliases: string[] = []): string[] | undefined => {
  const values: string[] = [];
  const keys = [key, ...aliases];
  for (const currentKey of keys) {
    const entries = params.getAll(currentKey);
    for (const entry of entries) {
      if (!entry) continue;
      const segments = entry.split(',');
      for (const segment of segments) {
        const normalized = segment.trim();
        if (normalized) values.push(normalized);
      }
    }
  }
  if (!values.length) return undefined;
  const unique = Array.from(new Set(values));
  return unique.length ? unique : undefined;
};

const parseNumber = (params: URLSearchParams, key: string): number | undefined => {
  const value = params.get(key);
  if (value === null) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const allowedTypes = new Set<ResultType>(TYPE_VALUES);
const allowedSorts = new Set<SortOption>(['name', 'date', 'citation', 'relevance']);
const allowedOrders = new Set<OrderOption>(['asc', 'desc']);

const parseState = (params: URLSearchParams): DVSearchState => {
  const q = params.get('q') ?? undefined;
  const typeValues = (parseMulti(params, 'type') ?? []).filter((value): value is ResultType =>
    allowedTypes.has(value as ResultType),
  );
  const subject = parseMulti(params, 'subject');
  const dataverse = parseMulti(params, 'dataverse', ['dv']);
  const fileType = parseMulti(params, 'fileType');
  const yearStart = parseNumber(params, 'yearStart');
  const yearEnd = parseNumber(params, 'yearEnd');
  const sort = params.get('sort') as DVSearchState['sort'] | null;
  const order = params.get('order') as DVSearchState['order'] | null;
  const page = parseNumber(params, 'page');
  const size = parseNumber(params, 'size');

  const state: DVSearchState = {
    q: q ?? undefined,
    type: typeValues.length ? typeValues : ['dataset'],
  };

  if (subject?.length) state.subject = subject;
  if (dataverse?.length) state.dataverse = dataverse;
  if (fileType?.length) state.fileType = fileType;
  if (yearStart !== undefined) state.yearStart = yearStart;
  if (yearEnd !== undefined) state.yearEnd = yearEnd;
  if (sort && allowedSorts.has(sort)) state.sort = sort;
  if (order && allowedOrders.has(order)) state.order = order;
  if (page && page > 0) state.page = page;
  if (size && size >= 10 && size <= 100) state.size = size;

  if (!state.page || state.page < 1) state.page = 1;
  if (!state.size) state.size = 30;
  if (!state.order) state.order = 'desc';
  if (!state.sort) state.sort = 'relevance';

  if (state.yearStart !== undefined && state.yearEnd !== undefined && state.yearEnd < state.yearStart) {
    const tmp = state.yearStart;
    state.yearStart = state.yearEnd;
    state.yearEnd = tmp;
  }

  return state;
};

const serializeState = (state: DVSearchState): URLSearchParams => {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);

  const types = state.type ?? ['dataset'];
  if (!(types.length === 1 && types[0] === 'dataset')) {
    for (const value of types) {
      params.append('type', value);
    }
  }

  for (const value of state.subject ?? []) params.append('subject', value);
  for (const value of state.dataverse ?? []) params.append('dataverse', value);
  for (const value of state.fileType ?? []) params.append('fileType', value);
  if (state.yearStart !== undefined) params.set('yearStart', String(state.yearStart));
  if (state.yearEnd !== undefined) params.set('yearEnd', String(state.yearEnd));
  if (state.sort && state.sort !== 'relevance') params.set('sort', state.sort);
  if (state.order && state.order !== 'desc') params.set('order', state.order);
  if (state.page && state.page > 1) params.set('page', String(state.page));
  if (state.size && state.size !== 30) params.set('size', String(state.size));
  return params;
};

const stateController = createUrlState<DVSearchState>(parseState, serializeState);
const { readState, writeState, onStateChange, toSearchParams } = stateController;

const FACET_DEFINITIONS: FacetDefinition<DVSearchState>[] = [
  {
    key: 'type',
    label: 'Result type',
    facetKey: 'type',
    getValues: (state) => state.type,
    setValues: (state, values) => {
      const next = { ...state, page: 1 };
      const selection = values?.filter((value): value is ResultType =>
        allowedTypes.has(value as ResultType),
      );
      next.type = selection && selection.length ? selection : ['dataset'];
      return next;
    },
    formatValue: (value) => {
      if (value === 'dataverse') return 'Collection';
      return value.charAt(0).toUpperCase() + value.slice(1);
    },
  },
  {
    key: 'subject',
    label: 'Subject',
    facetKey: 'subject',
    getValues: (state) => state.subject,
    setValues: (state, values) => ({ ...state, subject: values, page: 1 }),
    limit: 40,
  },
  {
    key: 'publicationDate',
    label: 'Publication year',
    facetKey: 'publicationDate',
    selection: 'single',
    getValues: (state) => {
      if (state.yearStart && state.yearEnd && state.yearStart === state.yearEnd) {
        return [String(state.yearStart)];
      }
      if (state.yearStart && !state.yearEnd) {
        return [String(state.yearStart)];
      }
      if (!state.yearStart && state.yearEnd) {
        return [String(state.yearEnd)];
      }
      return undefined;
    },
    setValues: (state, values) => {
      if (!values || !values.length) {
        return { ...state, yearStart: undefined, yearEnd: undefined, page: 1 };
      }
      const year = Number.parseInt(values[0], 10);
      if (!Number.isFinite(year)) {
        return { ...state, yearStart: undefined, yearEnd: undefined, page: 1 };
      }
      return { ...state, yearStart: year, yearEnd: year, page: 1 };
    },
  },
  {
    key: 'fileType',
    label: 'File type',
    facetKey: 'fileTypeGroupFacet',
    getValues: (state) => state.fileType,
    setValues: (state, values) => ({ ...state, fileType: values, page: 1 }),
    limit: 30,
  },
  {
    key: 'dataverse',
    label: 'Dataverse / Collection',
    facetKey: 'dataverse',
    getValues: (state) => state.dataverse,
    setValues: (state, values) => ({ ...state, dataverse: values, page: 1 }),
    limit: 30,
  },
];

type CacheEntry = {
  items: NormalRecord[];
  total: number;
  facets: DVFacets;
  nextPage?: number;
  page: number;
};

const cache = new Map<string, CacheEntry>();
let inFlight: AbortController | null = null;
let pendingKey: string | null = null;
let currentState: DVSearchState = parseState(new URLSearchParams());
let lastQuerySignature = '';

const cacheKey = (state: DVSearchState): string => toSearchParams(state).toString();
const baseSignature = (state: DVSearchState): string => {
  const base = { ...state, page: 1 };
  return toSearchParams(base).toString();
};

const collectAggregated = (state: DVSearchState): NormalRecord[] => {
  const items: NormalRecord[] = [];
  const pages = state.page ?? 1;
  for (let index = 1; index <= pages; index += 1) {
    const key = cacheKey({ ...state, page: index });
    const entry = cache.get(key);
    if (!entry) break;
    items.push(...entry.items);
  }
  return items;
};

const facetsForState = (state: DVSearchState, fallback: DVFacets): DVFacets => {
  const key = cacheKey({ ...state, page: 1 });
  return cache.get(key)?.facets ?? fallback;
};

const createToolbar = (
  state: DVSearchState,
  onChange: (next: DVSearchState) => void,
) => {
  let localState = state;
  const form = document.createElement('form');
  form.className = 'art-toolbar dataverse-toolbar form-row';

  const searchField = document.createElement('label');
  searchField.className = 'art-toolbar__field';
  const searchLabel = document.createElement('span');
  searchLabel.textContent = 'Search';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Find datasets, files, and dataverses';
  searchInput.value = state.q ?? '';
  searchInput.autocomplete = 'off';
  searchField.append(searchLabel, searchInput);

  const typeFieldset = document.createElement('fieldset');
  typeFieldset.className = 'dataverse-toolbar__fieldset';
  const legend = document.createElement('legend');
  legend.textContent = 'Result type';
  typeFieldset.appendChild(legend);

  const typeOptions: { value: ResultType; label: string }[] = [
    { value: 'dataset', label: 'Datasets' },
    { value: 'file', label: 'Files' },
    { value: 'dataverse', label: 'Collections' },
  ];

  const typeInputs: HTMLInputElement[] = [];
  typeOptions.forEach((option) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'dataverse-toolbar__checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = option.value;
    wrapper.append(input, document.createTextNode(option.label));
    typeInputs.push(input);
    typeFieldset.appendChild(wrapper);

    input.addEventListener('change', () => {
    const selected: ResultType[] = typeInputs
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.value as ResultType);
    const nextSelection: ResultType[] = selected.length ? selected : (['dataset'] as ResultType[]);
      nextSelection.forEach((value) => {
        const checkbox = typeInputs.find((entry) => entry.value === value);
        if (checkbox) checkbox.checked = true;
      });
      const nextState: DVSearchState = { ...localState, type: nextSelection, page: 1 };
      onChange(nextState);
    });
  });

  const sortField = document.createElement('label');
  sortField.className = 'art-toolbar__field';
  const sortLabel = document.createElement('span');
  sortLabel.textContent = 'Sort by';
  const sortSelect = document.createElement('select');
  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'relevance', label: 'Relevance' },
    { value: 'citation', label: 'Citation count' },
    { value: 'date', label: 'Publication date' },
    { value: 'name', label: 'Name' },
  ];
  sortOptions.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    sortSelect.appendChild(opt);
  });
  sortSelect.value = state.sort ?? 'relevance';
  sortSelect.addEventListener('change', () => {
    const next: DVSearchState = { ...localState, sort: sortSelect.value as SortOption, page: 1 };
    onChange(next);
  });
  sortField.append(sortLabel, sortSelect);

  const orderField = document.createElement('label');
  orderField.className = 'art-toolbar__field';
  const orderLabel = document.createElement('span');
  orderLabel.textContent = 'Order';
  const orderSelect = document.createElement('select');
  const orderOptions: { value: OrderOption; label: string }[] = [
    { value: 'desc', label: 'Descending' },
    { value: 'asc', label: 'Ascending' },
  ];
  orderOptions.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    orderSelect.appendChild(opt);
  });
  orderSelect.value = state.order ?? 'desc';
  orderSelect.addEventListener('change', () => {
    const next: DVSearchState = { ...localState, order: orderSelect.value as OrderOption, page: 1 };
    onChange(next);
  });
  orderField.append(orderLabel, orderSelect);

  const sizeField = document.createElement('label');
  sizeField.className = 'art-toolbar__field';
  const sizeLabel = document.createElement('span');
  sizeLabel.textContent = 'Page size';
  const sizeSelect = document.createElement('select');
  [10, 20, 30, 50, 100].forEach((value) => {
    const opt = document.createElement('option');
    opt.value = String(value);
    opt.textContent = String(value);
    sizeSelect.appendChild(opt);
  });
  sizeSelect.value = String(state.size ?? 30);
  sizeSelect.addEventListener('change', () => {
    const next: DVSearchState = { ...localState, size: Number(sizeSelect.value), page: 1 };
    onChange(next);
  });
  sizeField.append(sizeLabel, sizeSelect);

  const yearField = document.createElement('div');
  yearField.className = 'art-toolbar__field dataverse-toolbar__range';
  const yearLabel = document.createElement('span');
  yearLabel.textContent = 'Publication year';
  const yearStartInput = document.createElement('input');
  yearStartInput.type = 'number';
  yearStartInput.inputMode = 'numeric';
  yearStartInput.placeholder = 'From';
  yearStartInput.value = state.yearStart != null ? String(state.yearStart) : '';
  const yearEndInput = document.createElement('input');
  yearEndInput.type = 'number';
  yearEndInput.inputMode = 'numeric';
  yearEndInput.placeholder = 'To';
  yearEndInput.value = state.yearEnd != null ? String(state.yearEnd) : '';

  const updateYear = () => {
    const startValue = yearStartInput.value.trim();
    const endValue = yearEndInput.value.trim();
    const start = startValue ? Number.parseInt(startValue, 10) : undefined;
    const end = endValue ? Number.parseInt(endValue, 10) : undefined;
    const next: DVSearchState = { ...localState, page: 1 };
    next.yearStart = Number.isFinite(start as number) ? start : undefined;
    next.yearEnd = Number.isFinite(end as number) ? end : undefined;
    if (
      next.yearStart !== undefined &&
      next.yearEnd !== undefined &&
      next.yearEnd < next.yearStart
    ) {
      const temp = next.yearStart;
      next.yearStart = next.yearEnd;
      next.yearEnd = temp;
    }
    onChange(next);
  };

  yearStartInput.addEventListener('change', updateYear);
  yearEndInput.addEventListener('change', updateYear);

  yearField.append(yearLabel, yearStartInput, yearEndInput);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.textContent = 'Search';
  submitButton.className = 'dataverse-toolbar__submit';

  form.append(searchField, typeFieldset, sortField, orderField, sizeField, yearField, submitButton);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const next: DVSearchState = {
      ...localState,
      q: searchInput.value.trim() || undefined,
      page: 1,
    };
    onChange(next);
  });

  const update = (nextState: DVSearchState) => {
    localState = nextState;
    searchInput.value = nextState.q ?? '';
    const selectedTypes = new Set<ResultType>(nextState.type ?? ['dataset']);
    typeInputs.forEach((input) => {
      input.checked = selectedTypes.has(input.value as ResultType);
    });
    sortSelect.value = nextState.sort ?? 'relevance';
    orderSelect.value = nextState.order ?? 'desc';
    sizeSelect.value = String(nextState.size ?? 30);
    yearStartInput.value = nextState.yearStart != null ? String(nextState.yearStart) : '';
    yearEndInput.value = nextState.yearEnd != null ? String(nextState.yearEnd) : '';
  };

  return { form, update };
};

const createEmptyState = (message: string): HTMLElement => {
  const wrapper = document.createElement('div');
  wrapper.className = 'dataverse-empty';
  const text = document.createElement('p');
  text.textContent = message;
  wrapper.appendChild(text);
  return wrapper;
};

const formatTotal = (value: number): string => {
  return new Intl.NumberFormat().format(value);
};

export const mount = (root: HTMLElement): void => {
  root.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'Harvard Dataverse';

  const intro = document.createElement('p');
  intro.className = 'dataverse-intro';
  intro.textContent = 'Search across datasets, files, and collections from Harvard Dataverse and partners.';

  const status = document.createElement('p');
  status.className = 'page__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const alert = document.createElement('div');
  alert.className = 'alert alert--error';
  alert.hidden = true;

  const layout = document.createElement('div');
  layout.className = 'art-layout dataverse-layout';

  const facetsRoot = document.createElement('div');
  facetsRoot.className = 'art-layout__facets';

  const resultsRoot = document.createElement('div');
  resultsRoot.className = 'art-layout__results grid cards';

  const sentinel = document.createElement('div');
  sentinel.className = 'infinite-scroll-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');

  layout.append(facetsRoot, resultsRoot);
  root.append(heading, intro, alert, status, layout, sentinel);

  currentState = readState();
  lastQuerySignature = baseSignature(currentState);

  const toolbar = createToolbar(currentState, (next) => {
    writeState({ ...next });
  });
  root.insertBefore(toolbar.form, alert);

  const showError = (error: unknown) => {
    alert.hidden = false;
    alert.textContent = error instanceof Error ? error.message : String(error);
    status.textContent = 'Unable to load results.';
  };

  const clearError = () => {
    alert.hidden = true;
    alert.textContent = '';
  };

  const render = (state: DVSearchState, entry: CacheEntry) => {
    clearError();
    toolbar.update(state);

    const items = collectAggregated(state);
    if (items.length === 0) {
      resultsRoot.replaceChildren(createEmptyState('No results found. Adjust filters and try again.'));
    } else {
      const cards = items.map((item) => ResultCardDataverse(item));
      resultsRoot.replaceChildren(...cards);
    }

    const facetsData = facetsForState(state, entry.facets);
    const facets = Facets(FACET_DEFINITIONS, facetsData, state, (nextState) => {
      writeState(nextState);
    });
    facetsRoot.replaceChildren(facets);

    status.textContent = `${formatTotal(entry.total)} result${entry.total === 1 ? '' : 's'}`;
  };

  const prefetchNext = (state: DVSearchState, entry: CacheEntry) => {
    if (!entry.nextPage) return;
    const nextState = { ...state, page: entry.nextPage };
    const key = cacheKey(nextState);
    if (cache.has(key)) return;
    void searchDataverse(nextState)
      .then((data) => {
        cache.set(key, { ...data, page: nextState.page ?? 1 });
      })
      .catch(() => {
        /* ignore prefetch errors */
      });
  };

  const setLoading = () => {
    status.textContent = 'Loading…';
  };

  const showIdleState = (state: DVSearchState) => {
    clearError();
    const message = createEmptyState('Enter a keyword to start searching.');
    resultsRoot.replaceChildren(message);
    facetsRoot.replaceChildren();
    status.textContent = 'Enter a search term to begin.';
    lastQuerySignature = baseSignature(state);
    pendingKey = null;
  };

  const run = async (state: DVSearchState) => {
    currentState = state;
    toolbar.update(state);

    const signature = baseSignature(state);
    const hasQuery = Boolean(state.q && state.q.trim().length > 0);

    if (!hasQuery) {
      inFlight?.abort();
      inFlight = null;
      showIdleState(state);
      return;
    }

    if (signature !== lastQuerySignature && state.page !== 1) {
      writeState({ ...state, page: 1 }, { replace: true });
      return;
    }
    lastQuerySignature = signature;

    const key = cacheKey(state);
    const cached = cache.get(key);
    if (cached) {
      render(state, cached);
      prefetchNext(state, cached);
      return;
    }

    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    pendingKey = key;
    setLoading();

    try {
      const data = await searchDataverse(state, controller.signal);
      if (pendingKey !== key) return;
      const entry: CacheEntry = { ...data, page: state.page ?? 1 };
      cache.set(key, entry);
      render(state, entry);
      prefetchNext(state, entry);
    } catch (error) {
      if (controller.signal.aborted) return;
      showError(error);
    } finally {
      if (pendingKey === key) pendingKey = null;
      if (inFlight === controller) inFlight = null;
    }
  };

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    const key = cacheKey(currentState);
    const entry = cache.get(key);
    if (!entry?.nextPage) return;
    writeState({ ...currentState, page: entry.nextPage });
  }, { rootMargin: '1200px' });

  observer.observe(sentinel);

  onStateChange((state) => {
    void run(state);
  });

  void run(currentState);
};

export default { mount };
