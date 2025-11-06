import { Facets, FacetConfig } from '../components/Facets';
import { ResultCardDataverse } from '../components/ResultCardDataverse';
import { searchDataverse } from '../lib/providers/dataverse';
import { DEFAULT_STATE, mergeState, onStateChange, readState, writeState } from '../lib/urlState';
import { DVFacets, DVSearchState, NormalRecord } from '../lib/types';

const FACET_CONFIG: FacetConfig[] = [
  { key: 'type', label: 'Result type', stateKey: 'type' },
  { key: 'subject', label: 'Subject', stateKey: 'subject', limit: 30 },
  { key: 'publicationDate', label: 'Publication year', type: 'range' },
  { key: 'fileTypeGroupFacet', label: 'File type', stateKey: 'fileType', limit: 20 },
  { key: 'dvName', label: 'Dataverse / Collection', stateKey: 'dataverse', limit: 20 },
];

const keyFromState = (state: DVSearchState): string => {
  const normalized = mergeState(DEFAULT_STATE, state);
  const entries = (Object.entries(normalized as Record<string, unknown>) as Array<[string, unknown]>)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return [key, [...value].sort()];
      }
      return [key, value];
    })
    .sort(([a], [b]) => String(a).localeCompare(String(b)));
  return JSON.stringify(entries);
};

type SearchPage = {
  items: NormalRecord[];
  total: number;
  facets: DVFacets;
  nextPage?: number;
};

const cache = new Map<string, SearchPage>();

const mergeFacetCounts = (existing: DVFacets, items: NormalRecord[]): DVFacets => {
  const result: DVFacets = {};
  Object.entries(existing).forEach(([key, value]) => {
    result[key] = { ...value };
  });
  const ensure = (key: string): Record<string, number> => {
    if (!result[key]) {
      result[key] = {};
    }
    return result[key];
  };

  const localType: Record<string, number> = {};
  const localSubject: Record<string, number> = {};
  const localDv: Record<string, number> = {};
  const localYear: Record<string, number> = {};
  const localFileType: Record<string, number> = {};

  items.forEach((item) => {
    localType[item.kind] = (localType[item.kind] ?? 0) + 1;
    if (item.subjects) {
      item.subjects.forEach((subject) => {
        localSubject[subject] = (localSubject[subject] ?? 0) + 1;
      });
    }
    if (item.dataverseName) {
      localDv[item.dataverseName] = (localDv[item.dataverseName] ?? 0) + 1;
    }
    if (item.kind === 'file') {
      const label = item.fileTypeGroup ?? 'File';
      localFileType[label] = (localFileType[label] ?? 0) + 1;
    }
    if (item.published) {
      const match = /(?<year>\d{4})/.exec(item.published);
      if (match?.groups?.year) {
        const year = match.groups.year;
        localYear[year] = (localYear[year] ?? 0) + 1;
      }
    }
  });

  const apply = (key: string, local: Record<string, number>) => {
    if (Object.keys(local).length === 0) return;
    const target = ensure(key);
    Object.entries(local).forEach(([value, count]) => {
      target[value] = Math.max(target[value] ?? 0, count);
    });
  };

  apply('type', localType);
  apply('subject', localSubject);
  apply('dvName', localDv);
  apply('publicationDate', localYear);
  apply('fileTypeGroupFacet', localFileType);

  return result;
};

const renderEmptyState = (container: HTMLElement): void => {
  const empty = document.createElement('div');
  empty.className = 'dv-empty';
  const title = document.createElement('h3');
  title.textContent = 'No matching records';
  const body = document.createElement('p');
  body.textContent = 'Try adjusting your filters or updating the search query.';
  empty.append(title, body);
  container.replaceChildren(empty);
};

const createErrorBanner = (): HTMLDivElement => {
  const banner = document.createElement('div');
  banner.className = 'dv-error';
  banner.hidden = true;

  const message = document.createElement('p');
  message.className = 'dv-error__message';

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'dv-error__retry';
  retry.textContent = 'Retry';

  banner.append(message, retry);

  return banner;
};

export const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'Harvard Dataverse';

  const intro = document.createElement('p');
  intro.className = 'dv-intro';
  intro.textContent = 'Search datasets, files, and collections from Harvard Dataverse.';

  const form = document.createElement('form');
  form.className = 'dv-search';
  form.setAttribute('role', 'search');

  const queryField = document.createElement('label');
  queryField.className = 'dv-search__field';
  const querySpan = document.createElement('span');
  querySpan.textContent = 'Keywords';
  const queryInput = document.createElement('input');
  queryInput.type = 'search';
  queryInput.name = 'q';
  queryInput.placeholder = 'Replication, climate, migration…';
  queryInput.autocomplete = 'off';
  queryInput.className = 'dv-search__input';
  queryInput.setAttribute('aria-label', 'Search Dataverse');
  queryField.append(querySpan, queryInput);

  const typeGroup = document.createElement('fieldset');
  typeGroup.className = 'dv-search__group';
  const typeLegend = document.createElement('legend');
  typeLegend.textContent = 'Result types';
  typeGroup.appendChild(typeLegend);

  const typeOptions: Array<['dataset' | 'file' | 'dataverse', string]> = [
    ['dataset', 'Datasets'],
    ['file', 'Files'],
    ['dataverse', 'Collections'],
  ];
  const typeInputs = new Map<'dataset' | 'file' | 'dataverse', HTMLInputElement>();
  typeOptions.forEach(([value, label]) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'dv-search__option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = value;
    input.name = 'type';
    input.className = 'dv-search__checkbox';
    const span = document.createElement('span');
    span.textContent = label;
    wrapper.append(input, span);
    typeGroup.appendChild(wrapper);
    typeInputs.set(value, input);
  });

  const sortField = document.createElement('label');
  sortField.className = 'dv-search__field';
  const sortSpan = document.createElement('span');
  sortSpan.textContent = 'Sort by';
  const sortSelect = document.createElement('select');
  sortSelect.name = 'sort';
  sortSelect.className = 'dv-search__input';
  ['relevance', 'citation', 'date', 'name'].forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value.charAt(0).toUpperCase() + value.slice(1);
    sortSelect.appendChild(option);
  });
  sortField.append(sortSpan, sortSelect);

  const orderField = document.createElement('label');
  orderField.className = 'dv-search__field';
  const orderSpan = document.createElement('span');
  orderSpan.textContent = 'Order';
  const orderSelect = document.createElement('select');
  orderSelect.name = 'order';
  orderSelect.className = 'dv-search__input';
  ['desc', 'asc'].forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value === 'asc' ? 'Ascending' : 'Descending';
    orderSelect.appendChild(option);
  });
  orderField.append(orderSpan, orderSelect);

  const yearField = document.createElement('div');
  yearField.className = 'dv-search__field dv-search__field--split';
  const yearLabel = document.createElement('span');
  yearLabel.textContent = 'Publication year';
  const yearStartInput = document.createElement('input');
  yearStartInput.type = 'number';
  yearStartInput.placeholder = 'From';
  yearStartInput.min = '0';
  yearStartInput.className = 'dv-search__input';
  const yearEndInput = document.createElement('input');
  yearEndInput.type = 'number';
  yearEndInput.placeholder = 'To';
  yearEndInput.min = '0';
  yearEndInput.className = 'dv-search__input';
  yearField.append(yearLabel, yearStartInput, yearEndInput);

  const sizeField = document.createElement('label');
  sizeField.className = 'dv-search__field';
  const sizeSpan = document.createElement('span');
  sizeSpan.textContent = 'Results per page';
  const sizeSelect = document.createElement('select');
  sizeSelect.className = 'dv-search__input';
  sizeSelect.name = 'size';
  [20, 30, 40, 50, 75, 100].forEach((value) => {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = String(value);
    sizeSelect.appendChild(option);
  });
  sizeField.append(sizeSpan, sizeSelect);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'dv-search__submit';
  submit.textContent = 'Search';

  form.append(queryField, typeGroup, sortField, orderField, yearField, sizeField, submit);

  const status = document.createElement('p');
  status.className = 'dv-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const layout = document.createElement('div');
  layout.className = 'dv-layout';

  const facetsContainer = document.createElement('div');
  facetsContainer.className = 'dv-layout__facets';

  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'dv-layout__results';

  const resultsList = document.createElement('div');
  resultsList.className = 'dv-results';

  const sentinel = document.createElement('div');
  sentinel.id = 'dv-sentinel';
  sentinel.className = 'dv-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');

  const errorBanner = createErrorBanner();

  resultsContainer.append(resultsList, sentinel);
  layout.append(facetsContainer, resultsContainer);
  el.append(heading, intro, form, status, errorBanner, layout);

  let currentState = mergeState(DEFAULT_STATE, readState());
  let currentNextPage: number | undefined;
  let loadingNext = false;
  let inFlight: AbortController | null = null;

  const applyStateToControls = (state: DVSearchState): void => {
    queryInput.value = state.q ?? '';
    const types = state.type ?? DEFAULT_STATE.type ?? ['dataset'];
    typeInputs.forEach((input, value) => {
      input.checked = types.includes(value);
    });
    sortSelect.value = state.sort ?? 'relevance';
    orderSelect.value = state.order ?? 'desc';
    yearStartInput.value = state.yearStart ? String(state.yearStart) : '';
    yearEndInput.value = state.yearEnd ? String(state.yearEnd) : '';
    sizeSelect.value = String(state.size ?? DEFAULT_STATE.size ?? 20);
  };

  applyStateToControls(currentState);

  const handleSubmit = (event: Event): void => {
    event.preventDefault();
    const next = mergeState(currentState, {
      q: queryInput.value.trim() || undefined,
      page: 1,
    });
    writeState(next, { replace: false });
    void run(next);
  };

  const handleTypeChange = (): void => {
    const selected = Array.from(typeInputs.entries())
      .filter(([, input]) => input.checked)
      .map(([value]) => value);
    const next = mergeState(currentState, {
      type: (selected.length > 0 ? selected : ['dataset']) as DVSearchState['type'],
      page: 1,
    });
    writeState(next, { replace: false });
    void run(next);
  };

  const handleSelectChange = (): void => {
    const sortValue = sortSelect.value as DVSearchState['sort'];
    const orderValue = orderSelect.value as DVSearchState['order'];
    const sizeValue = Number.parseInt(sizeSelect.value, 10);
    const next = mergeState(currentState, {
      sort: sortValue,
      order: orderValue,
      size: Number.isNaN(sizeValue) ? currentState.size : sizeValue,
      page: 1,
    });
    writeState(next, { replace: false });
    void run(next);
  };

  const handleYearChange = (): void => {
    const start = Number.parseInt(yearStartInput.value, 10);
    const end = Number.parseInt(yearEndInput.value, 10);
    const next = mergeState(currentState, {
      yearStart: Number.isNaN(start) ? undefined : start,
      yearEnd: Number.isNaN(end) ? undefined : end,
      page: 1,
    });
    writeState(next, { replace: false });
    void run(next);
  };

  form.addEventListener('submit', handleSubmit);
  typeInputs.forEach((input) => input.addEventListener('change', handleTypeChange));
  sortSelect.addEventListener('change', handleSelectChange);
  orderSelect.addEventListener('change', handleSelectChange);
  sizeSelect.addEventListener('change', handleSelectChange);
  yearStartInput.addEventListener('change', handleYearChange);
  yearEndInput.addEventListener('change', handleYearChange);

  errorBanner.querySelector('button')?.addEventListener('click', () => {
    errorBanner.hidden = true;
    void run(currentState);
  });

  const fetchPage = async (state: DVSearchState, signal: AbortSignal): Promise<SearchPage> => {
    const key = keyFromState(state);
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    const data = await searchDataverse(state, signal);
    cache.set(key, data);
    return data;
  };

  const render = (items: NormalRecord[], facets: DVFacets, total: number, nextPage?: number): void => {
    currentNextPage = nextPage;
    if (items.length === 0) {
      renderEmptyState(resultsList);
    } else {
      resultsList.replaceChildren(...items.map((item) => ResultCardDataverse(item)));
    }

    const mergedFacets = mergeFacetCounts(facets, items);
    const facetElement = Facets(FACET_CONFIG, mergedFacets, currentState, (next) => {
      writeState(next, { replace: false });
      void run(next);
    });
    facetsContainer.replaceChildren(facetElement);

    if (total === 0) {
      status.textContent = 'No results found.';
    } else {
      const visible = items.length;
      status.textContent = `Showing ${visible.toLocaleString()} of ${total.toLocaleString()} results`;
    }
  };

  const run = async (state: DVSearchState): Promise<void> => {
    const nextState = mergeState(DEFAULT_STATE, state);
    currentState = nextState;
    applyStateToControls(nextState);

    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;

    status.textContent = 'Loading…';
    errorBanner.hidden = true;

    const targetPage = Math.max(1, nextState.page ?? 1);
    const pages: SearchPage[] = [];

    try {
      for (let page = 1; page <= targetPage; page += 1) {
        const pageState = mergeState(nextState, { page });
        const data = await fetchPage(pageState, controller.signal);
        pages[page - 1] = data;
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      resultsList.replaceChildren();
      renderEmptyState(resultsList);
      status.textContent = 'Unable to load results.';
      const message = error instanceof Error ? error.message : String(error);
      errorBanner.querySelector('.dv-error__message')!.textContent = message;
      errorBanner.hidden = false;
      return;
    } finally {
      if (inFlight === controller) {
        inFlight = null;
      }
    }

    const items = pages.flatMap((page) => page.items);
    const lastPage = pages.length > 0 ? pages[pages.length - 1] : undefined;
    const total = lastPage?.total ?? items.length;
    const facets = pages[0]?.facets ?? {};
    const nextPage = lastPage?.nextPage;

    render(items, facets, total, nextPage);

    if (nextPage) {
      void prefetch({ ...nextState, page: nextPage });
    }
  };

  const prefetch = async (state: DVSearchState): Promise<void> => {
    const key = keyFromState(state);
    if (cache.has(key)) return;
    try {
      const controller = new AbortController();
      const data = await searchDataverse(state, controller.signal);
      cache.set(key, data);
    } catch {
      // Prefetch failures are non-fatal.
    }
  };

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    if (!currentNextPage || loadingNext) return;
    loadingNext = true;
    const next = mergeState(currentState, { page: currentNextPage });
    writeState(next);
    void run(next).finally(() => {
      loadingNext = false;
    });
  }, { rootMargin: '1200px 0px' });

  observer.observe(sentinel);

  onStateChange((state) => {
    void run(state);
  });

  void run(currentState);
};

export default { mount };
