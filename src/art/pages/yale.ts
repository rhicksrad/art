import type { IIIFCanvas, IIIFManifest } from '../lib/iiif';
import { loadManifest, canvasThumb } from '../lib/iiif';
import type { ViewerController, ViewerHooks } from '../components/IIIFViewer';
import { IIIFViewer } from '../components/IIIFViewer';
import type { ThumbStripController } from '../components/ThumbStrip';
import { ThumbStrip } from '../components/ThumbStrip';
import { MetaPanel } from '../components/MetaPanel';
import type { ViewerState } from '../lib/urlState';
import { readViewerState, writeViewerState } from '../lib/urlState';
import type { FacetOption, YaleCatalogItem, YaleCatalogSearchResponse } from '../lib/providers/yaleCatalog';
import { searchYaleCatalog } from '../lib/providers/yaleCatalog';

const DEFAULT_MANIFEST = 'https://iiif.harvardartmuseums.org/manifests/object/299843';
const DEFAULT_DISCOVERY_FORMAT = 'still image';
const MAX_FACET_DISPLAY = 12;
const MAX_SUBJECT_CHIPS = 4;
const numberFormatter = new Intl.NumberFormat();

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const editableTags = ['INPUT', 'TEXTAREA'];
  return editableTags.includes(target.tagName) || target.isContentEditable;
};

type StatePatch = Partial<ViewerState>;

type DiscoveryState = {
  q?: string;
  formats: string[];
  repositories: string[];
  page: number;
};

const normalizeDiscoveryState = (value: Partial<DiscoveryState>): DiscoveryState => {
  const q = value.q?.trim();
  const normalizeList = (entries: string[] | undefined): string[] => {
    if (!entries) return [];
    const set = new Set<string>();
    entries
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => set.add(entry));
    return Array.from(set);
  };
  const formats = normalizeList(value.formats);
  const repositories = normalizeList(value.repositories);
  const page = value.page && value.page > 0 ? Math.floor(value.page) : 1;
  return {
    q: q && q.length ? q : undefined,
    formats: formats.length ? formats : [DEFAULT_DISCOVERY_FORMAT],
    repositories,
    page,
  };
};

const discoveryStateKey = (state: DiscoveryState): string => {
  const formats = [...state.formats].sort((a, b) => a.localeCompare(b));
  const repositories = [...state.repositories].sort((a, b) => a.localeCompare(b));
  return JSON.stringify({ q: state.q ?? '', formats, repositories, page: state.page });
};

const collectParamValues = (params: URLSearchParams, key: string): string[] => {
  const values = params.getAll(key);
  const set = new Set<string>();
  values.forEach((entry) => {
    entry
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .forEach((segment) => set.add(segment));
  });
  return Array.from(set);
};

const readDiscoveryStateFromUrl = (): DiscoveryState => {
  if (typeof window === 'undefined') {
    return normalizeDiscoveryState({ formats: [DEFAULT_DISCOVERY_FORMAT], repositories: [], page: 1 });
  }
  const params = new URLSearchParams(window.location.search);
  const q = params.get('yq') ?? undefined;
  const formats = collectParamValues(params, 'yfmt');
  const repositories = collectParamValues(params, 'yrepo');
  const pageValue = Number.parseInt(params.get('ypage') ?? '', 10);
  return normalizeDiscoveryState({ q, formats, repositories, page: Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1 });
};

const writeDiscoveryStateToUrl = (state: DiscoveryState, replace: boolean): void => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const params = url.searchParams;
  params.delete('yq');
  params.delete('yfmt');
  params.delete('yrepo');
  params.delete('ypage');
  if (state.q) {
    params.set('yq', state.q);
  }
  state.formats.forEach((format) => {
    if (format) params.append('yfmt', format);
  });
  state.repositories.forEach((repository) => {
    if (repository) params.append('yrepo', repository);
  });
  if (state.page > 1) {
    params.set('ypage', String(state.page));
  }
  const next = `${url.pathname}${params.toString() ? `?${params.toString()}` : ''}${url.hash}`;
  if (replace) {
    window.history.replaceState(null, '', next);
  } else {
    window.history.pushState(null, '', next);
  }
};

const shortenText = (value: string | undefined, max = 180): string | undefined => {
  if (!value) return undefined;
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
};

type ManifestPreview = {
  thumb?: string;
  canvasCount: number;
  label?: string;
};

const manifestPreviewCache = new Map<string, Promise<ManifestPreview>>();

const getManifestPreview = (manifestUrl: string): Promise<ManifestPreview> => {
  if (!manifestPreviewCache.has(manifestUrl)) {
    const promise = loadManifest(manifestUrl)
      .then((manifest) => {
        const firstCanvas = manifest.canvases[0];
        const thumb = firstCanvas ? canvasThumb(firstCanvas) ?? firstCanvas.image?.best : undefined;
        return {
          thumb,
          canvasCount: manifest.canvases.length,
          label: manifest.label,
        } satisfies ManifestPreview;
      })
      .catch(() => ({ canvasCount: 0 } satisfies ManifestPreview));
    manifestPreviewCache.set(manifestUrl, promise);
  }
  return manifestPreviewCache.get(manifestUrl)!;
};

const formatFacetLabel = (option: FacetOption): string => {
  return `${option.label} (${numberFormatter.format(option.count)})`;
};

export default { mount };

function mount(root: HTMLElement): void {
  root.classList.add('yale-view');
  root.innerHTML = '';

  let state = readViewerState();
  if (!state.manifest) {
    state = { ...state, manifest: DEFAULT_MANIFEST };
  }

  let discoveryState = readDiscoveryStateFromUrl();
  const discoveryStateFromUrl = discoveryStateKey(discoveryState);
  discoveryState = normalizeDiscoveryState(discoveryState);

  const patchState = (patch: StatePatch, replace = false) => {
    const next: ViewerState = { ...state };
    (Object.entries(patch) as [keyof ViewerState, ViewerState[keyof ViewerState]][]).forEach(([key, value]) => {
      if (value === undefined) {
        delete (next as Record<string, unknown>)[key as string];
      } else {
        (next as Record<string, unknown>)[key as string] = value as never;
      }
    });
    state = next;
    writeViewerState(state, replace);
  };

  const header = document.createElement('header');
  header.className = 'yale-view__header';

  const title = document.createElement('h1');
  title.textContent = 'IIIF Viewer';

  const controls = document.createElement('form');
  controls.className = 'yale-view__form';
  controls.noValidate = true;

  const manifestInput = document.createElement('input');
  manifestInput.type = 'url';
  manifestInput.placeholder = 'https://…/manifest.json';
  manifestInput.value = state.manifest ?? DEFAULT_MANIFEST;
  manifestInput.id = 'manifestUrl';
  manifestInput.setAttribute('aria-label', 'Manifest URL');

  const loadButton = document.createElement('button');
  loadButton.type = 'submit';
  loadButton.id = 'loadManifest';
  loadButton.textContent = 'Load manifest';

  controls.append(manifestInput, loadButton);

  const statusEl = document.createElement('p');
  statusEl.className = 'yale-view__status';

  header.append(title, controls, statusEl);

  const content = document.createElement('div');
  content.className = 'yale-view__content';

  const layout = document.createElement('div');
  layout.className = 'yale-view__layout';

  const viewerEl = document.createElement('div');
  viewerEl.className = 'yale-view__viewer';
  viewerEl.id = 'viewer';

  const thumbsEl = document.createElement('div');
  thumbsEl.className = 'yale-view__thumbs';
  thumbsEl.id = 'thumbs';

  const metaEl = document.createElement('aside');
  metaEl.className = 'yale-view__meta';
  metaEl.id = 'meta';

  layout.append(viewerEl, thumbsEl, metaEl);

  const discoverySection = document.createElement('section');
  discoverySection.className = 'yale-discovery stack-lg';

  const discoveryIntro = document.createElement('div');
  discoveryIntro.className = 'yale-discovery__intro stack';
  const introHeading = document.createElement('h2');
  introHeading.textContent = 'Browse Yale digital collections';
  const introCopy = document.createElement('p');
  introCopy.textContent = 'Search across thousands of Yale Library manifests, filter by format or repository, and open any record directly in the IIIF viewer.';
  discoveryIntro.append(introHeading, introCopy);

  const discoveryStatus = document.createElement('p');
  discoveryStatus.className = 'yale-discovery__status';
  discoveryStatus.textContent = 'Use search or the quick filters below to discover manifests.';

  const searchForm = document.createElement('form');
  searchForm.className = 'yale-discovery__form';
  searchForm.noValidate = true;

  const searchField = document.createElement('label');
  searchField.className = 'yale-discovery__search';
  const searchLabel = document.createElement('span');
  searchLabel.textContent = 'Search';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Keywords, creators, call numbers…';
  searchInput.autocomplete = 'off';
  searchInput.value = discoveryState.q ?? '';
  searchField.append(searchLabel, searchInput);

  const searchSubmit = document.createElement('button');
  searchSubmit.type = 'submit';
  searchSubmit.textContent = 'Search';

  searchForm.append(searchField, searchSubmit);

  const filterRow = document.createElement('div');
  filterRow.className = 'yale-discovery__filters';

  const formatFacet = document.createElement('div');
  formatFacet.className = 'yale-discovery__facet';
  const formatLabel = document.createElement('span');
  formatLabel.className = 'yale-discovery__facet-label';
  formatLabel.textContent = 'Format';
  const formatChips = document.createElement('div');
  formatChips.className = 'yale-discovery__chips';
  formatFacet.append(formatLabel, formatChips);

  const repositoryFacet = document.createElement('div');
  repositoryFacet.className = 'yale-discovery__facet';
  const repositoryLabel = document.createElement('span');
  repositoryLabel.className = 'yale-discovery__facet-label';
  repositoryLabel.textContent = 'Repository';
  const repositorySelect = document.createElement('select');
  repositorySelect.className = 'yale-discovery__select';
  repositoryFacet.append(repositoryLabel, repositorySelect);

  const clearFilters = document.createElement('button');
  clearFilters.type = 'button';
  clearFilters.className = 'chip';
  clearFilters.textContent = 'Reset filters';

  filterRow.append(formatFacet, repositoryFacet, clearFilters);

  const resultsSection = document.createElement('section');
  resultsSection.className = 'yale-results stack-lg';

  const resultsHeader = document.createElement('div');
  resultsHeader.className = 'yale-results__header flex-between';
  const resultsSummary = document.createElement('p');
  resultsSummary.className = 'yale-results__summary';
  resultsSummary.textContent = 'Results will appear here.';
  const resultsActions = document.createElement('div');
  resultsActions.className = 'yale-results__actions';
  resultsHeader.append(resultsSummary, resultsActions);

  const resultsList = document.createElement('div');
  resultsList.className = 'yale-results__list stack';

  const pager = document.createElement('div');
  pager.className = 'yale-results__pager flex-between';
  const prevButton = document.createElement('button');
  prevButton.type = 'button';
  prevButton.textContent = 'Previous';
  const pagerInfo = document.createElement('span');
  pagerInfo.className = 'yale-results__page-info';
  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.textContent = 'Next';
  pager.append(prevButton, pagerInfo, nextButton);

  resultsSection.append(resultsHeader, resultsList, pager);

  discoverySection.append(discoveryIntro, searchForm, filterRow, discoveryStatus, resultsSection);

  content.append(discoverySection, layout);

  root.append(header, content);

  let controller: ViewerController | null = null;
  let thumbController: ThumbStripController | null = null;
  let currentManifest: IIIFManifest | null = null;
  let currentCanvas: IIIFCanvas | null = null;
  let abortController: AbortController | null = null;
  let initialLoad = true;
  let currentManifestUrl: string | null = state.manifest ?? null;
  const searchCache = new Map<string, YaleCatalogSearchResponse>();
  const resultCardRegistry = new Map<string, HTMLElement>();
  let searchAbort: AbortController | null = null;
  let searchTimeout: number | null = null;

  const setStatus = (text: string, isError = false) => {
    statusEl.textContent = text;
    statusEl.classList.toggle('is-error', isError);
  };

  const setDiscoveryStatus = (text: string, tone: 'default' | 'muted' | 'error' = 'default') => {
    discoveryStatus.textContent = text;
    discoveryStatus.classList.toggle('is-error', tone === 'error');
    discoveryStatus.classList.toggle('is-muted', tone === 'muted');
  };

  const updateMeta = () => {
    if (currentManifest && currentCanvas) {
      MetaPanel(metaEl, currentManifest, currentCanvas);
    } else {
      metaEl.innerHTML = '<p class="iiif-meta__empty">Load a manifest to view metadata.</p>';
    }
  };

  const highlightActiveResult = () => {
    resultCardRegistry.forEach((card, manifestUrl) => {
      card.classList.toggle('is-active', currentManifestUrl === manifestUrl);
    });
  };

  setStatus('Drop a manifest URL, select a discovery result, or paste a IIIF manifest to begin.');
  updateMeta();

  const viewerHooks: ViewerHooks = {
    onViewChange: (xywh: [number, number, number, number], zoom: number, rotation: 0 | 90 | 180 | 270) => {
      patchState({ xywh, zoom, rotation }, true);
    },
    onCanvasChange: (canvasId: string) => {
      if (!currentManifest) return;
      const next = currentManifest.canvases.find((canvas) => canvas.id === canvasId);
      if (!next) return;
      currentCanvas = next;
      thumbController?.setCurrent(canvasId);
      patchState({ canvas: canvasId, xywh: undefined, zoom: undefined }, false);
      setStatus(`${currentManifest.label} — ${next.label}`);
      updateMeta();
    },
  };

  const applyCanvas = (canvas: IIIFCanvas, preserveView = false) => {
    currentCanvas = canvas;
    const view = preserveView && state.canvas === canvas.id
      ? { xywh: state.xywh, zoom: state.zoom, rotation: state.rotation }
      : { rotation: state.rotation };
    const isInitial = !controller;
    if (!controller) {
      controller = IIIFViewer(viewerEl, canvas, viewerHooks, view);
    } else {
      controller.setCanvas(canvas, view);
    }
    thumbController?.setCurrent(canvas.id);
    if (isInitial) {
      patchState({ canvas: canvas.id, xywh: view.xywh, zoom: view.zoom, rotation: view.rotation }, initialLoad);
    }
    updateMeta();
    if (currentManifest) {
      setStatus(`${currentManifest.label} — ${canvas.label}`);
    }
  };

  const handleCanvasPick = (canvasId: string) => {
    if (!currentManifest) return;
    const next = currentManifest.canvases.find((canvas) => canvas.id === canvasId);
    if (!next || next === currentCanvas) return;
    applyCanvas(next, state.canvas === canvasId);
  };

  const renderRepositoryOptions = (facet: FacetOption[] | undefined) => {
    repositorySelect.replaceChildren();
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'All repositories';
    repositorySelect.appendChild(defaultOption);
    if (!facet || facet.length === 0) {
      repositorySelect.disabled = true;
      return;
    }
    repositorySelect.disabled = false;
    facet
      .slice()
      .sort((a, b) => b.count - a.count)
      .forEach((option) => {
        const opt = document.createElement('option');
        opt.value = option.value;
        opt.textContent = formatFacetLabel(option);
        repositorySelect.appendChild(opt);
      });
    repositorySelect.value = discoveryState.repositories[0] ?? '';
  };

  const renderFormatChips = (facet: FacetOption[] | undefined) => {
    formatChips.replaceChildren();
    if (!facet || facet.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'yale-discovery__empty';
      empty.textContent = 'No format data available for this search.';
      formatChips.appendChild(empty);
      return;
    }
    const selected = new Set(discoveryState.formats.map((value) => value.toLowerCase()));
    facet
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_FACET_DISPLAY)
      .forEach((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chip';
        button.textContent = formatFacetLabel(option);
        button.dataset.value = option.value;
        if (selected.has(option.value.toLowerCase())) {
          button.classList.add('is-active');
        }
        button.addEventListener('click', () => {
          const nextSet = new Set(discoveryState.formats);
          if (nextSet.has(option.value)) {
            nextSet.delete(option.value);
          } else {
            nextSet.add(option.value);
          }
          updateDiscoveryState({ formats: Array.from(nextSet) }, { immediate: true, resetPage: true });
        });
        formatChips.appendChild(button);
      });
  };

  const createResultCard = (item: YaleCatalogItem): HTMLElement => {
    const card = document.createElement('article');
    card.className = 'yale-result';

    const preview = document.createElement('figure');
    preview.className = 'yale-result__preview';
    const previewImg = document.createElement('img');
    previewImg.loading = 'lazy';
    previewImg.alt = item.title;
    previewImg.dataset.manifest = item.manifest;
    preview.appendChild(previewImg);

    const badgeRow = document.createElement('div');
    badgeRow.className = 'yale-result__badges';
    if (item.resourceTypes.length) {
      const typeBadge = document.createElement('span');
      typeBadge.className = 'yale-result__badge';
      typeBadge.textContent = item.resourceTypes[0];
      badgeRow.appendChild(typeBadge);
    }
    if (item.imageCount && item.imageCount > 0) {
      const imageBadge = document.createElement('span');
      imageBadge.className = 'yale-result__badge';
      imageBadge.textContent = `${numberFormatter.format(item.imageCount)} images`;
      badgeRow.appendChild(imageBadge);
    }

    const contentBody = document.createElement('div');
    contentBody.className = 'yale-result__content';

    if (item.repository) {
      const repo = document.createElement('p');
      repo.className = 'yale-result__repository';
      repo.textContent = item.repository;
      contentBody.appendChild(repo);
    }

    contentBody.appendChild(badgeRow);

    const heading = document.createElement('h3');
    heading.className = 'yale-result__title';
    const landingLink = document.createElement('a');
    landingLink.href = item.landingPage;
    landingLink.target = '_blank';
    landingLink.rel = 'noopener noreferrer';
    landingLink.textContent = item.title;
    heading.appendChild(landingLink);
    contentBody.appendChild(heading);

    const metaParts: string[] = [];
    if (item.creator) metaParts.push(item.creator);
    if (item.date) metaParts.push(item.date);
    if (item.callNumbers.length) metaParts.push(item.callNumbers[0]);
    if (metaParts.length) {
      const metaLine = document.createElement('p');
      metaLine.className = 'yale-result__meta';
      metaLine.textContent = metaParts.join(' · ');
      contentBody.appendChild(metaLine);
    }

    const description = shortenText(item.description) ?? shortenText(item.subjects.join(', '));
    if (description) {
      const descriptionEl = document.createElement('p');
      descriptionEl.className = 'yale-result__description';
      descriptionEl.textContent = description;
      contentBody.appendChild(descriptionEl);
    }

    if (item.subjects.length) {
      const tagList = document.createElement('ul');
      tagList.className = 'yale-result__tags';
      item.subjects.slice(0, MAX_SUBJECT_CHIPS).forEach((subject) => {
        const tag = document.createElement('li');
        tag.textContent = subject;
        tagList.appendChild(tag);
      });
      contentBody.appendChild(tagList);
    }

    const actions = document.createElement('div');
    actions.className = 'yale-result__controls';

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.textContent = 'Open in viewer';
    openButton.addEventListener('click', () => {
      manifestInput.value = item.manifest;
      load(item.manifest, false).catch((error) => {
        console.error(error);
      });
      viewerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'chip';
    copyButton.textContent = 'Copy manifest URL';
    copyButton.addEventListener('click', () => {
      const original = copyButton.textContent;
      const announceSuccess = () => {
        copyButton.textContent = 'Copied!';
        copyButton.classList.add('is-success');
        window.setTimeout(() => {
          copyButton.textContent = original;
          copyButton.classList.remove('is-success');
        }, 1600);
      };
      const copyFallback = () => {
        const promptValue = window.prompt('Copy manifest URL', item.manifest);
        if (promptValue !== null) {
          announceSuccess();
        }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(item.manifest).then(announceSuccess).catch(copyFallback);
      } else {
        copyFallback();
      }
    });

    const catalogLink = document.createElement('a');
    catalogLink.href = item.landingPage;
    catalogLink.target = '_blank';
    catalogLink.rel = 'noopener noreferrer';
    catalogLink.textContent = 'View catalog record';

    actions.append(openButton, copyButton, catalogLink);
    contentBody.appendChild(actions);

    card.append(preview, contentBody);
    resultCardRegistry.set(item.manifest, card);

    getManifestPreview(item.manifest)
      .then((previewData) => {
        if (previewImg.dataset.manifest !== item.manifest) return;
        if (previewData.thumb) {
          previewImg.src = previewData.thumb;
        } else {
          card.classList.add('yale-result--no-thumb');
        }
      })
      .catch(() => {
        card.classList.add('yale-result--no-thumb');
      });

    return card;
  };

  const renderResults = (payload: YaleCatalogSearchResponse) => {
    resultsList.replaceChildren();
    resultCardRegistry.clear();
    if (payload.items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'yale-results__empty';
      const heading = document.createElement('h3');
      heading.textContent = 'No manifests matched your filters';
      const message = document.createElement('p');
      message.textContent = 'Try different keywords, clear filters, or choose another category.';
      empty.append(heading, message);
      resultsList.appendChild(empty);
      resultsSummary.textContent = 'No results';
      pagerInfo.textContent = '';
      prevButton.disabled = true;
      nextButton.disabled = true;
      resultsActions.textContent = '';
      highlightActiveResult();
      return;
    }

    const startIndex = (payload.page - 1) * payload.perPage + 1;
    const endIndex = Math.min(payload.total, startIndex + payload.items.length - 1);
    resultsSummary.textContent = `Showing ${numberFormatter.format(startIndex)}–${numberFormatter.format(endIndex)} of ${numberFormatter.format(payload.total)} results`;
    pagerInfo.textContent = `Page ${numberFormatter.format(payload.page)} of ${numberFormatter.format(payload.totalPages)}`;
    prevButton.disabled = payload.page <= 1;
    nextButton.disabled = payload.page >= payload.totalPages;

    const filterSummary: string[] = [];
    if (discoveryState.q) filterSummary.push(`Keyword: “${discoveryState.q}”`);
    if (discoveryState.formats.length) filterSummary.push(`Format: ${discoveryState.formats.join(', ')}`);
    if (discoveryState.repositories.length) filterSummary.push(`Repository: ${discoveryState.repositories.join(', ')}`);
    resultsActions.textContent = filterSummary.length ? filterSummary.join(' · ') : 'Showing highlighted manifests across Yale Library collections.';

    payload.items.forEach((item) => {
      const card = createResultCard(item);
      resultsList.appendChild(card);
    });

    highlightActiveResult();
  };

  const syncDiscoveryControls = () => {
    searchInput.value = discoveryState.q ?? '';
    repositorySelect.value = discoveryState.repositories[0] ?? '';
    const hasCustomFormat =
      !(discoveryState.formats.length === 1 && discoveryState.formats[0].toLowerCase() === DEFAULT_DISCOVERY_FORMAT);
    clearFilters.disabled = !hasCustomFormat && discoveryState.repositories.length === 0 && !discoveryState.q;
  };

  const requestSearch = (immediate = false) => {
    if (searchTimeout !== null) {
      window.clearTimeout(searchTimeout);
      searchTimeout = null;
    }
    if (immediate) {
      void runSearch(discoveryState);
    } else {
      searchTimeout = window.setTimeout(() => {
        searchTimeout = null;
        void runSearch(discoveryState);
      }, 300);
    }
  };

  const runSearch = async (state: DiscoveryState) => {
    const key = discoveryStateKey(state);
    if (searchCache.has(key)) {
      const cached = searchCache.get(key)!;
      renderFormatChips(cached.facets.format);
      renderRepositoryOptions(cached.facets['repository_ssi']);
      renderResults(cached);
      highlightActiveResult();
      setDiscoveryStatus(
        cached.total ? `Showing ${numberFormatter.format(cached.total)} items` : 'No results found',
        cached.total ? 'default' : 'muted',
      );
      return;
    }

    searchAbort?.abort();
    const controller = new AbortController();
    searchAbort = controller;
    setDiscoveryStatus('Loading results…', 'muted');

    try {
      const response = await searchYaleCatalog(
        { q: state.q, formats: state.formats, repositories: state.repositories, page: state.page },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      searchCache.set(key, response);
      renderFormatChips(response.facets.format);
      renderRepositoryOptions(response.facets['repository_ssi']);
      renderResults(response);
      highlightActiveResult();
      setDiscoveryStatus(
        response.total ? `Showing ${numberFormatter.format(response.total)} items` : 'No results found',
        response.total ? 'default' : 'muted',
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      setDiscoveryStatus(message, 'error');
      resultsList.replaceChildren();
      resultsSummary.textContent = 'No results';
      resultsActions.textContent = '';
      pagerInfo.textContent = '';
      prevButton.disabled = true;
      nextButton.disabled = true;
    } finally {
      if (searchAbort === controller) {
        searchAbort = null;
      }
    }
  };

  const applyDiscoveryState = (
    nextState: Partial<DiscoveryState>,
    options: { immediate?: boolean; skipUrl?: boolean; replace?: boolean } = {},
  ) => {
    const normalized = normalizeDiscoveryState(nextState);
    const changed = discoveryStateKey(normalized) !== discoveryStateKey(discoveryState);
    discoveryState = normalized;
    syncDiscoveryControls();
    if (!options.skipUrl && changed) {
      writeDiscoveryStateToUrl(discoveryState, options.replace ?? false);
    }
    if (options.immediate || changed) {
      requestSearch(options.immediate ?? false);
    }
  };

  const updateDiscoveryState = (
    patch: Partial<DiscoveryState>,
    options: { immediate?: boolean; skipUrl?: boolean; replace?: boolean; resetPage?: boolean } = {},
  ) => {
    const next: Partial<DiscoveryState> = { ...discoveryState, ...patch };
    if (options.resetPage) {
      next.page = 1;
    }
    applyDiscoveryState(next, options);
  };

  const load = async (url: string, replaceHistory = false) => {
    const trimmed = url.trim();
    if (!trimmed) {
      setStatus('Enter a IIIF manifest URL to begin.', true);
      return;
    }
    abortController?.abort();
    abortController = new AbortController();
    setStatus('Loading manifest…');
    viewerEl.classList.add('is-loading');
    thumbsEl.innerHTML = '';
    metaEl.innerHTML = '';
    try {
      const manifest = await loadManifest(trimmed, abortController.signal);
      currentManifest = manifest;
      currentManifestUrl = trimmed;
      highlightActiveResult();
      const canvases = manifest.canvases;
      if (canvases.length === 0) {
        throw new Error('The manifest did not contain any canvases.');
      }
      const requestedCanvasId = state.canvas;
      const initialCanvas = requestedCanvasId
        ? canvases.find((canvas) => canvas.id === requestedCanvasId) ?? canvases[0]
        : canvases[0];
      thumbController = ThumbStrip(thumbsEl, canvases, initialCanvas.id, handleCanvasPick);
      patchState({ manifest: trimmed }, replaceHistory || initialLoad);
      applyCanvas(initialCanvas, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message, true);
      viewerEl.innerHTML = '<p class="iiif-viewer__message">Unable to load manifest.</p>';
      controller = null;
      thumbController = null;
      currentManifest = null;
      currentManifestUrl = null;
      highlightActiveResult();
      currentCanvas = null;
    } finally {
      viewerEl.classList.remove('is-loading');
      abortController = null;
      initialLoad = false;
    }
  };

  controls.addEventListener('submit', (event) => {
    event.preventDefault();
    const urlValue = manifestInput.value || DEFAULT_MANIFEST;
    load(urlValue, false).catch((error) => {
      console.error(error);
    });
  });

  repositorySelect.addEventListener('change', () => {
    const value = repositorySelect.value;
    updateDiscoveryState({ repositories: value ? [value] : [] }, { immediate: true, resetPage: true });
  });

  clearFilters.addEventListener('click', () => {
    updateDiscoveryState(
      { formats: [DEFAULT_DISCOVERY_FORMAT], repositories: [] },
      { immediate: true, resetPage: true },
    );
  });

  searchInput.addEventListener('input', () => {
    updateDiscoveryState({ q: searchInput.value.trim() || undefined }, { immediate: false, replace: true, resetPage: true });
  });

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    updateDiscoveryState({ q: searchInput.value.trim() || undefined }, { immediate: true, resetPage: true });
  });

  prevButton.addEventListener('click', () => {
    if (discoveryState.page <= 1) return;
    updateDiscoveryState({ page: discoveryState.page - 1 }, { immediate: true });
  });

  nextButton.addEventListener('click', () => {
    updateDiscoveryState({ page: discoveryState.page + 1 }, { immediate: true });
  });

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    root.classList.remove('is-drop-target');
    const data = event.dataTransfer;
    const url = data?.getData('text/uri-list') || data?.getData('text/plain');
    if (url) {
      manifestInput.value = url.trim();
      void load(manifestInput.value, false);
    }
  };

  root.addEventListener('dragover', (event) => {
    event.preventDefault();
    root.classList.add('is-drop-target');
  });
  root.addEventListener('dragleave', (event) => {
    if (event.target === root) {
      root.classList.remove('is-drop-target');
    }
  });
  root.addEventListener('drop', handleDrop);

  window.addEventListener('keydown', (event) => {
    if (!currentManifest || !currentCanvas) return;
    if (isEditableTarget(event.target)) return;
    const index = currentManifest.canvases.findIndex((canvas) => canvas.id === currentCanvas?.id);
    if (event.key === '[' || event.key === 'ArrowLeft') {
      if (index > 0) {
        event.preventDefault();
        handleCanvasPick(currentManifest.canvases[index - 1].id);
      }
    } else if (event.key === ']' || event.key === 'ArrowRight') {
      if (index < currentManifest.canvases.length - 1) {
        event.preventDefault();
        handleCanvasPick(currentManifest.canvases[index + 1].id);
      }
    } else if (event.key.toLowerCase() === 'h') {
      event.preventDefault();
      controller?.goHome();
    } else if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      const nextRotation = ((state.rotation ?? 0) + 90) % 360 as 0 | 90 | 180 | 270;
      controller?.setRotation(nextRotation);
    }
  });

  window.addEventListener('popstate', () => {
    const nextDiscovery = readDiscoveryStateFromUrl();
    applyDiscoveryState(nextDiscovery, { immediate: true, skipUrl: true });
  });

  syncDiscoveryControls();
  if (discoveryStateKey(discoveryState) !== discoveryStateFromUrl) {
    writeDiscoveryStateToUrl(discoveryState, true);
  }
  requestSearch(true);

  const initialManifest = state.manifest ?? DEFAULT_MANIFEST;
  manifestInput.value = initialManifest;
  void load(initialManifest, true);
}
