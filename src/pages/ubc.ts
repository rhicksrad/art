import { createAlert } from '../components/Alert';
import { renderItemCard } from '../components/Card';
import { createPager } from '../components/Pager';
import { createSearchForm } from '../components/SearchForm';
import { HttpError, toQuery } from '../lib/http';
import { WORKER_BASE } from '../lib/config';
import { toItemCards, extractTotal, deriveIiifManifest, deriveIiifService } from '../adapters/ubc';
import { getUbcIndex, refreshUbcIndex, searchUbc, setUbcIndex } from '../lib/ubc';

const DEFAULT_PAGE_SIZE = 24;
const FALLBACK_INDEX = 'calendars';

type SearchState = {
  q: string;
  size: number;
  sort: string;
  page: number;
};

const parsePositiveInt = (value: string | null, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const parsePage = (value: string | null): number => {
  return parsePositiveInt(value, 1);
};

const buildRequestUrl = (
  params: Record<string, string | number | boolean | null | undefined>,
): string => {
  const url = new URL('/ubc/search/8.5', WORKER_BASE);
  const searchParams = toQuery(params);
  if (!searchParams.has('ttl')) {
    searchParams.set('ttl', '3600');
  }
  url.search = searchParams.toString();
  return url.toString();
};

const createSpinner = (label: string): HTMLElement => {
  const spinner = document.createElement('div');
  spinner.className = 'page__status';
  spinner.textContent = label;
  spinner.setAttribute('aria-busy', 'true');
  return spinner;
};

const toIiifImageUrl = (service: string, size = '!1200,1200'): string => {
  const trimmed = service.replace(/\/info\.json$/i, '').replace(/\/$/, '');
  if (/\/full\//.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/full/${size}/0/default.jpg`;
};

type DiagnosticDetails = {
  message?: string;
  upstream?: string;
  sample?: string;
};

const parseDiagnostic = (sample: string | undefined): DiagnosticDetails => {
  if (!sample) {
    return {};
  }
  try {
    const parsed = JSON.parse(sample) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      const message = typeof parsed.message === 'string' ? parsed.message : undefined;
      const upstream = typeof parsed.upstream === 'string' ? parsed.upstream : undefined;
      const nestedSample = typeof parsed.sample === 'string' ? parsed.sample : undefined;
      return { message, upstream, sample: nestedSample };
    }
  } catch {
    // fall through to raw sample handling
  }
  return { sample };
};

const attachDiagnostics = (alert: HTMLElement, error: HttpError): void => {
  const container = document.createElement('div');
  container.className = 'alert__details';

  const statusLine = document.createElement('p');
  statusLine.textContent = `Worker status: ${error.status}`;
  container.appendChild(statusLine);

  const diagnostics = parseDiagnostic(error.sample);
  if (diagnostics.message) {
    const messageLine = document.createElement('p');
    messageLine.textContent = diagnostics.message;
    container.appendChild(messageLine);
  }
  if (diagnostics.upstream) {
    const upstreamLine = document.createElement('p');
    upstreamLine.textContent = `Upstream: ${diagnostics.upstream}`;
    container.appendChild(upstreamLine);
  }
  if (diagnostics.sample && diagnostics.sample !== diagnostics.message) {
    const sampleBlock = document.createElement('pre');
    sampleBlock.textContent = diagnostics.sample;
    container.appendChild(sampleBlock);
  }

  alert.appendChild(container);
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'UBC Open Collections';

  const controlsRow = document.createElement('div');
  controlsRow.className = 'page__search';

  const indexControls = document.createElement('div');
  indexControls.className = 'index-controls';

  const indexStatus = document.createElement('p');
  indexStatus.className = 'page__status';
  const indexValueChip = document.createElement('span');
  indexValueChip.className = 'chip';

  const updateIndexDisplay = (value: string, note?: string): void => {
    indexValueChip.textContent = value;
    indexStatus.replaceChildren();
    indexStatus.append(document.createTextNode('Resolved index: '), indexValueChip);
    if (note) {
      const noteChip = document.createElement('span');
      noteChip.className = 'chip';
      noteChip.textContent = note;
      indexStatus.append(document.createTextNode(' '), noteChip);
    }
  };

  indexControls.appendChild(indexStatus);

  const refreshButton = document.createElement('button');
  refreshButton.type = 'button';
  refreshButton.className = 'chip';
  refreshButton.textContent = 'Refresh index';
  indexControls.appendChild(refreshButton);

  const overrideForm = document.createElement('form');
  overrideForm.className = 'index-override';
  const overrideField = document.createElement('div');
  overrideField.className = 'search-form__field';
  const overrideLabel = document.createElement('label');
  overrideLabel.className = 'search-form__label';
  overrideLabel.textContent = 'Manual index';
  const overrideInput = document.createElement('input');
  overrideInput.type = 'text';
  overrideInput.className = 'search-form__control';
  overrideInput.placeholder = 'Slug';
  overrideInput.setAttribute('aria-label', 'Override index slug');
  const overrideSubmit = document.createElement('button');
  overrideSubmit.type = 'submit';
  overrideSubmit.className = 'chip';
  overrideSubmit.textContent = 'Set index';
  overrideField.append(overrideLabel, overrideInput);
  overrideForm.append(overrideField, overrideSubmit);
  indexControls.appendChild(overrideForm);

  const indexAlertContainer = document.createElement('div');

  const status = document.createElement('p');
  status.className = 'page__status';

  const requestContainer = document.createElement('div');
  requestContainer.className = 'request-debug';
  const requestToggle = document.createElement('button');
  requestToggle.type = 'button';
  requestToggle.className = 'chip';
  requestToggle.textContent = 'Show request';
  requestToggle.disabled = true;
  const requestDetails = document.createElement('pre');
  requestDetails.className = 'request-debug__details';
  requestDetails.style.display = 'none';
  requestContainer.append(requestToggle, requestDetails);

  const alertContainer = document.createElement('div');

  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'page__results';
  const cardsList = document.createElement('div');
  cardsList.className = 'grid cards';

  const pagerContainer = document.createElement('div');
  pagerContainer.className = 'page__pager';

  const searchParams = new URLSearchParams(window.location.search);
  let state: SearchState = {
    q: searchParams.get('q') ?? '',
    size: parsePositiveInt(searchParams.get('size'), DEFAULT_PAGE_SIZE),
    sort: searchParams.get('sort') ?? '',
    page: parsePage(searchParams.get('page')),
  };

  let currentIndex = (searchParams.get('index') ?? '').trim();
  if (currentIndex) {
    currentIndex = setUbcIndex(currentIndex);
  }

  updateIndexDisplay(currentIndex || 'resolving…');
  overrideInput.value = currentIndex;

  const updateDocumentTitle = (): void => {
    const term = state.q.trim();
    document.title = term ? `UBC • ${term}` : 'UBC • Open Collections';
  };

  const updateLocation = (): void => {
    const params = new URLSearchParams();
    if (state.q.trim()) params.set('q', state.q.trim());
    if (state.size !== DEFAULT_PAGE_SIZE) params.set('size', String(state.size));
    if (state.sort.trim()) params.set('sort', state.sort.trim());
    if (state.page > 1) params.set('page', String(state.page));
    if (currentIndex) params.set('index', currentIndex);
    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState(null, '', url);
  };

  const updateRequestDisplay = (url?: string): void => {
    if (!url) {
      requestToggle.disabled = true;
      requestDetails.textContent = '';
      requestDetails.style.display = 'none';
      requestToggle.textContent = 'Show request';
      return;
    }
    requestToggle.disabled = false;
    requestDetails.textContent = url;
    requestDetails.style.display = 'none';
    requestToggle.textContent = 'Show request';
  };

  requestToggle.addEventListener('click', () => {
    if (requestToggle.disabled) {
      return;
    }
    const isHidden = requestDetails.style.display === 'none';
    requestDetails.style.display = isHidden ? 'block' : 'none';
    requestToggle.textContent = isHidden ? 'Hide request' : 'Show request';
  });

  const ensureIndex = async (): Promise<string> => {
    if (currentIndex) {
      return currentIndex;
    }
    try {
      const resolved = await getUbcIndex();
      currentIndex = setUbcIndex(resolved);
      updateIndexDisplay(currentIndex);
      overrideInput.value = currentIndex;
      updateLocation();
      return currentIndex;
    } catch (error) {
      currentIndex = setUbcIndex(FALLBACK_INDEX);
      updateIndexDisplay(currentIndex, 'fallback');
      overrideInput.value = currentIndex;
      indexAlertContainer.replaceChildren(
        createAlert(`Unable to resolve index automatically: ${error instanceof Error ? error.message : String(error)}`, 'error'),
      );
      updateLocation();
      return currentIndex;
    }
  };

  let abortController: AbortController | null = null;

  const renderCards = (items: ReturnType<typeof toItemCards>): void => {
    cardsList.innerHTML = '';
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'page__status';
      empty.textContent = 'No results found.';
      resultsContainer.replaceChildren(empty);
      return;
    }
    items.forEach((item) => {
      const card = renderItemCard(item);
      if (!item.img) {
        const placeholder = document.createElement('div');
        placeholder.className = 'img-ph';
        placeholder.textContent = 'Image unavailable';
        placeholder.setAttribute('aria-hidden', 'true');
        card.insertBefore(placeholder, card.firstChild);
      }
      const footer = card.querySelector('.card__footer');
      const manifest = deriveIiifManifest(item.raw);
      const service = deriveIiifService(item.raw);
      if (footer && (manifest || service)) {
        const iiifLink = document.createElement('a');
        iiifLink.className = 'chip';
        iiifLink.textContent = 'IIIF';
        iiifLink.target = '_blank';
        iiifLink.rel = 'noreferrer';
        if (manifest) {
          iiifLink.href = `/yale.html?manifest=${encodeURIComponent(manifest)}`;
        } else if (service) {
          iiifLink.href = toIiifImageUrl(service, '!1200,1200');
        }
        const rawLink = footer.querySelector('.card__raw-link');
        if (rawLink) {
          footer.insertBefore(iiifLink, rawLink);
        } else {
          footer.appendChild(iiifLink);
        }
      }
      cardsList.appendChild(card);
    });
    resultsContainer.replaceChildren(cardsList);
  };

  const updateStatus = (total: number | undefined, count: number, offset: number): void => {
    if (count === 0) {
      status.textContent = total === 0 ? 'No results found.' : 'No results on this page.';
      return;
    }
    const start = offset + 1;
    const end = offset + count;
    if (typeof total === 'number' && Number.isFinite(total)) {
      status.textContent = `Showing ${start}–${end} of ${total}`;
    } else {
      status.textContent = `Showing ${start}–${end}`;
    }
  };

  const pager = createPager({
    page: state.page,
    hasPrev: state.page > 1,
    hasNext: false,
    onPrev: () => {
      if (state.page <= 1) return;
      state = { ...state, page: state.page - 1 };
      updateLocation();
      updateDocumentTitle();
      void load();
    },
    onNext: () => {
      state = { ...state, page: state.page + 1 };
      updateLocation();
      updateDocumentTitle();
      void load();
    },
  });
  pagerContainer.appendChild(pager);

  const { element: form, setValues } = createSearchForm({
    fields: [
      { name: 'q', label: 'Keyword', type: 'text', placeholder: 'Search UBC collections', value: state.q },
      { name: 'size', label: 'Results per page', type: 'number', value: String(state.size) },
      { name: 'sort', label: 'Sort', type: 'text', placeholder: 'e.g. date:desc', value: state.sort },
    ],
    submitLabel: 'Search',
    onSubmit: (values) => {
      const nextQuery = values.q?.trim() ?? '';
      const nextSort = values.sort?.trim() ?? '';
      state = {
        q: nextQuery,
        size: parsePositiveInt(values.size ?? '', DEFAULT_PAGE_SIZE),
        sort: nextSort,
        page: 1,
      };
      updateDocumentTitle();
      updateLocation();
      void load();
    },
  });

  controlsRow.append(form, indexControls);

  const load = async (): Promise<void> => {
    if (abortController) {
      abortController.abort();
    }
    const controller = new AbortController();
    abortController = controller;
    const { signal } = controller;

    alertContainer.innerHTML = '';
    status.textContent = 'Searching…';
    resultsContainer.replaceChildren(createSpinner('Searching…'));

    try {
      const index = await ensureIndex();
      if (signal.aborted) {
        return;
      }

      const from = (state.page - 1) * state.size;
      const requestUrl = buildRequestUrl({
        index,
        q: state.q.trim() || null,
        size: state.size,
        from,
        sort: state.sort.trim() || null,
      });
      updateRequestDisplay(requestUrl);

      updateDocumentTitle();

      const response = await searchUbc(
        state.q,
        { size: state.size, from, sort: state.sort, index },
        { signal },
      );
      if (signal.aborted) {
        return;
      }

      const cards = toItemCards(response);
      const total = extractTotal(response);
      renderCards(cards);
      updateStatus(total, cards.length, from);
      const hasNext = typeof total === 'number' ? state.page * state.size < total : cards.length === state.size;
      pager.update({ page: state.page, hasPrev: state.page > 1, hasNext });
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      const failureNotice = document.createElement('p');
      failureNotice.className = 'page__status';
      failureNotice.textContent = 'Results unavailable.';
      resultsContainer.replaceChildren(failureNotice);
      const message = error instanceof Error ? error.message : String(error);
      status.textContent = 'Search failed.';
      const alert = createAlert(message, 'error');
      if (error instanceof HttpError) {
        attachDiagnostics(alert, error);
        updateRequestDisplay(error.url);
      }
      alertContainer.replaceChildren(alert);
    } finally {
      if (abortController === controller) {
        abortController = null;
      }
    }
  };

  refreshButton.addEventListener('click', async () => {
    refreshButton.disabled = true;
    const previousLabel = refreshButton.textContent;
    refreshButton.textContent = 'Refreshing…';
    indexAlertContainer.innerHTML = '';
    try {
      const refreshed = await refreshUbcIndex();
      currentIndex = refreshed;
      updateIndexDisplay(currentIndex);
      overrideInput.value = currentIndex;
      updateLocation();
      void load();
    } catch (error) {
      updateIndexDisplay(currentIndex || FALLBACK_INDEX, 'fallback');
      indexAlertContainer.replaceChildren(
        createAlert(`Index refresh failed: ${error instanceof Error ? error.message : String(error)}`, 'error'),
      );
    } finally {
      refreshButton.disabled = false;
      refreshButton.textContent = previousLabel;
    }
  });

  overrideForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const slug = overrideInput.value.trim();
    if (!slug) {
      indexAlertContainer.replaceChildren(createAlert('Index slug is required.', 'error'));
      overrideInput.focus();
      return;
    }
    currentIndex = setUbcIndex(slug);
    updateIndexDisplay(currentIndex);
    indexAlertContainer.innerHTML = '';
    state = { ...state, page: 1 };
    updateLocation();
    updateDocumentTitle();
    void load();
  });

  setValues({ q: state.q, size: String(state.size), sort: state.sort });
  updateDocumentTitle();
  updateLocation();

  el.append(heading, controlsRow, indexAlertContainer, status, requestContainer, alertContainer, resultsContainer, pagerContainer);

  void ensureIndex();
  void load();
};

export default { mount };
