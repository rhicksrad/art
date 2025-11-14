import { createAlert } from '../components/Alert';
import { renderItemCard } from '../components/Card';
import { HttpError } from '../lib/http';
import type { ItemCard } from '../lib/types';
import { SOURCE_DEFINITIONS } from '../lib/unifiedSearch';
import type { UnifiedSource } from '../lib/unifiedSearch';

type LayoutMode = 'grid' | 'list';

const LAYOUT_OPTIONS: LayoutMode[] = ['grid', 'list'];
const LIMIT_OPTIONS = [3, 5, 10, 25];

type UnifiedSearchState = {
  q: string;
  perSourceLimit: number;
  showImagesOnly: boolean;
  layout: LayoutMode;
  enabledSources: Record<UnifiedSource, boolean>;
};

type SourceEntry = {
  cards: ItemCard[];
  loading: boolean;
  error?: string;
};

type SourceView = {
  section: HTMLElement;
  status: HTMLParagraphElement;
  list: HTMLElement;
  error: HTMLElement;
  count: HTMLElement;
};

const formatError = (error: unknown): string => {
  if (error instanceof HttpError) {
    return `${error.status}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const createEnabledSourceMap = (): Record<UnifiedSource, boolean> => {
  const map = {} as Record<UnifiedSource, boolean>;
  SOURCE_DEFINITIONS.forEach((def) => {
    map[def.key] = def.defaultEnabled ?? true;
  });
  return map;
};

const createSourceStateMap = (): Record<UnifiedSource, SourceEntry> => {
  const map = {} as Record<UnifiedSource, SourceEntry>;
  SOURCE_DEFINITIONS.forEach((def) => {
    map[def.key] = { cards: [], loading: false };
  });
  return map;
};

const getLayoutClass = (mode: LayoutMode): string => {
  return mode === 'list' ? 'cards cards--list' : 'grid cards';
};

const applyImageFilter = (items: ItemCard[], showImagesOnly: boolean): ItemCard[] => {
  if (!showImagesOnly) {
    return items;
  }
  return items.filter((item) => typeof item.img === 'string' && item.img.trim().length > 0);
};

const createUnifiedSearchSection = (): HTMLElement => {
  const section = document.createElement('section');
  section.className = 'home-search home-search--landing';

  const hero = document.createElement('div');
  hero.className = 'home-search__hero';

  const form = document.createElement('form');
  form.className = 'home-search-form home-search-form--hero';

  const srLabel = document.createElement('label');
  srLabel.className = 'sr-only';
  srLabel.textContent = 'Search across every art API';

  const surface = document.createElement('div');
  surface.className = 'home-search__surface';

  const queryInput = document.createElement('input');
  queryInput.type = 'search';
  queryInput.id = 'home-search-input';
  srLabel.setAttribute('for', queryInput.id);
  queryInput.className = 'home-search__input home-search__input--main';
  queryInput.placeholder = 'Search art objects, manifests, or datasets…';
  queryInput.autocomplete = 'off';

  const searchButton = document.createElement('button');
  searchButton.type = 'submit';
  searchButton.className = 'home-search__submit';
  searchButton.textContent = 'Search';

  surface.append(queryInput, searchButton);
  form.append(srLabel, surface);
  hero.appendChild(form);
  section.appendChild(hero);

  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'home-results';
  resultsContainer.hidden = true;

  const resultsHeader = document.createElement('div');
  resultsHeader.className = 'home-results__header';
  const resultsTitle = document.createElement('p');
  resultsTitle.className = 'home-results__title';
  resultsTitle.textContent = 'Unified results';

  const filtersToggle = document.createElement('button');
  filtersToggle.type = 'button';
  filtersToggle.className = 'home-filter-toggle';
  filtersToggle.setAttribute('aria-expanded', 'false');
  const hamburger = document.createElement('span');
  hamburger.className = 'home-filter-toggle__icon';
  hamburger.setAttribute('aria-hidden', 'true');
  hamburger.textContent = '☰';
  const toggleLabel = document.createElement('span');
  toggleLabel.className = 'sr-only';
  toggleLabel.textContent = 'Open filters';
  filtersToggle.append(hamburger, toggleLabel);
  filtersToggle.hidden = true;
  filtersToggle.disabled = true;

  resultsHeader.append(resultsTitle, filtersToggle);

  const resultsWrapper = document.createElement('div');
  resultsWrapper.className = 'home-source-grid';
  resultsContainer.append(resultsHeader, resultsWrapper);
  section.appendChild(resultsContainer);

  const filtersOverlay = document.createElement('div');
  filtersOverlay.className = 'home-filter-panel__overlay';
  filtersOverlay.hidden = true;

  const filtersPanel = document.createElement('aside');
  filtersPanel.className = 'home-filter-panel';
  filtersPanel.setAttribute('role', 'dialog');
  filtersPanel.setAttribute('aria-modal', 'true');
  filtersPanel.setAttribute('aria-label', 'Search filters');
  filtersPanel.setAttribute('aria-hidden', 'true');
  filtersPanel.dataset.open = 'false';
  filtersPanel.tabIndex = -1;

  const filtersHeader = document.createElement('header');
  filtersHeader.className = 'home-filter-panel__header';
  const filtersHeading = document.createElement('h2');
  filtersHeading.textContent = 'Filters';
  const filtersClose = document.createElement('button');
  filtersClose.type = 'button';
  filtersClose.className = 'home-filter-panel__close';
  const closeIcon = document.createElement('span');
  closeIcon.setAttribute('aria-hidden', 'true');
  closeIcon.textContent = '×';
  const closeLabel = document.createElement('span');
  closeLabel.className = 'sr-only';
  closeLabel.textContent = 'Close filters';
  filtersClose.append(closeIcon, closeLabel);
  filtersHeader.append(filtersHeading, filtersClose);

  const filtersBody = document.createElement('div');
  filtersBody.className = 'home-search__filters-body';
  const filtersBodyWrapper = document.createElement('div');
  filtersBodyWrapper.className = 'home-filter-panel__body';

  const controlsRow = document.createElement('div');
  controlsRow.className = 'home-search__controls';

  const limitField = document.createElement('label');
  limitField.className = 'home-search__field';
  const limitLabel = document.createElement('span');
  limitLabel.className = 'home-search__label';
  limitLabel.textContent = 'Max results per source';
  const limitSelect = document.createElement('select');
  limitSelect.className = 'home-search__input';
  LIMIT_OPTIONS.forEach((option) => {
    const entry = document.createElement('option');
    entry.value = String(option);
    entry.textContent = String(option);
    limitSelect.appendChild(entry);
  });
  limitField.append(limitLabel, limitSelect);

  const imagesField = document.createElement('label');
  imagesField.className = 'home-search__checkbox';
  const imagesCheckbox = document.createElement('input');
  imagesCheckbox.type = 'checkbox';
  const imagesCopy = document.createElement('span');
  imagesCopy.textContent = 'Only show items with images';
  imagesField.append(imagesCheckbox, imagesCopy);

  const layoutGroup = document.createElement('div');
  layoutGroup.className = 'home-search__layout';
  const layoutLabel = document.createElement('span');
  layoutLabel.className = 'home-search__label';
  layoutLabel.textContent = 'Layout';
  const layoutOptions = document.createElement('div');
  layoutOptions.className = 'home-search__layout-options';
  const layoutInputs = new Map<LayoutMode, HTMLInputElement>();
  LAYOUT_OPTIONS.forEach((mode) => {
    const option = document.createElement('label');
    option.className = 'home-search__layout-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'layout';
    radio.value = mode;
    const copy = document.createElement('span');
    copy.textContent = mode === 'grid' ? 'Grid' : 'List';
    option.append(radio, copy);
    layoutOptions.appendChild(option);
    layoutInputs.set(mode, radio);
  });
  layoutGroup.append(layoutLabel, layoutOptions);

  controlsRow.append(limitField, layoutGroup, imagesField);

  const sourcesSubtitle = document.createElement('p');
  sourcesSubtitle.className = 'home-search__filters-subtitle';
  sourcesSubtitle.textContent = 'Choose the feeds you want to query';

  const sourcesGrid = document.createElement('div');
  sourcesGrid.className = 'home-search__sources';
  const sourceCheckboxes = new Map<UnifiedSource, HTMLInputElement>();
  SOURCE_DEFINITIONS.forEach((source) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'home-search__source';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = source.key;
    const name = document.createElement('span');
    name.className = 'home-search__source-name';
    name.textContent = source.label;
    const meta = document.createElement('span');
    meta.className = 'home-search__source-meta';
    meta.textContent = source.typeLabel;
    const copy = document.createElement('span');
    copy.className = 'home-search__source-description';
    copy.textContent = source.description;
    wrapper.append(checkbox, name, meta, copy);
    sourcesGrid.appendChild(wrapper);
    sourceCheckboxes.set(source.key, checkbox);
  });

  const actionRow = document.createElement('div');
  actionRow.className = 'home-search__actions home-search__actions--filters';
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'home-search__reset';
  resetButton.textContent = 'Reset search';
  actionRow.appendChild(resetButton);

  filtersBody.append(controlsRow, sourcesSubtitle, sourcesGrid, actionRow);
  filtersBodyWrapper.appendChild(filtersBody);
  filtersPanel.append(filtersHeader, filtersBodyWrapper);
  section.append(filtersOverlay, filtersPanel);

  const state: UnifiedSearchState = {
    q: new URLSearchParams(window.location.search).get('q')?.trim() ?? '',
    perSourceLimit: LIMIT_OPTIONS[1],
    showImagesOnly: false,
    layout: 'grid',
    enabledSources: createEnabledSourceMap(),
  };

  const perSource = createSourceStateMap();
  const views = new Map<UnifiedSource, SourceView>();
  const controllers: Partial<Record<UnifiedSource, AbortController>> = {};

  queryInput.value = state.q;
  limitSelect.value = String(state.perSourceLimit);
  imagesCheckbox.checked = state.showImagesOnly;
  const initialLayout = layoutInputs.get(state.layout);
  if (initialLayout) {
    initialLayout.checked = true;
  }
  sourceCheckboxes.forEach((checkbox, key) => {
    checkbox.checked = state.enabledSources[key];
  });

  const updateUrl = (): void => {
    const url = new URL(window.location.href);
    if (state.q) {
      url.searchParams.set('q', state.q);
    } else {
      url.searchParams.delete('q');
    }
    window.history.replaceState({}, '', url);
  };

  const abortSource = (key: UnifiedSource): void => {
    const controller = controllers[key];
    if (controller) {
      controller.abort();
      controllers[key] = undefined;
    }
  };

  const resetSource = (key: UnifiedSource): void => {
    const entry = perSource[key];
    entry.cards = [];
    entry.loading = false;
    entry.error = undefined;
  };

  const setFiltersOpen = (open: boolean): void => {
    filtersPanel.dataset.open = open ? 'true' : 'false';
    filtersPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    filtersOverlay.hidden = !open;
    filtersToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      filtersPanel.focus();
    }
  };

  const closeFilters = (): void => setFiltersOpen(false);

  const updateResultsVisibility = (): void => {
    const hasQuery = state.q.trim().length > 0;
    resultsContainer.hidden = !hasQuery;
    filtersToggle.hidden = !hasQuery;
    filtersToggle.disabled = !hasQuery;
    resultsTitle.textContent = hasQuery ? `Results for “${state.q}”` : 'Unified results';
    if (!hasQuery) {
      closeFilters();
    }
  };

  const updateSourceView = (key: UnifiedSource): void => {
    const view = views.get(key);
    if (!view) {
      return;
    }
    const entry = perSource[key];
    const enabled = state.enabledSources[key];
    const hasQuery = state.q.trim().length > 0;
    view.list.className = getLayoutClass(state.layout);
    view.error.innerHTML = '';

    if (!hasQuery || !enabled) {
      view.section.hidden = true;
      view.status.textContent = hasQuery ? 'Source disabled via filters.' : 'Awaiting query…';
      view.count.textContent = '0';
      view.list.replaceChildren();
      return;
    }

    view.section.hidden = false;
    if (entry.loading) {
      view.status.textContent = 'Searching…';
    } else if (entry.error) {
      view.status.textContent = 'Error';
      view.error.appendChild(createAlert(entry.error, 'error'));
      view.list.replaceChildren();
    } else {
      const filtered = applyImageFilter(entry.cards, state.showImagesOnly);
      view.status.textContent = filtered.length > 0 ? `${filtered.length} result${filtered.length === 1 ? '' : 's'}` : 'No results';
      view.list.replaceChildren(...filtered.map((card) => renderItemCard(card)));
    }
    view.count.textContent = String(entry.cards.length);
  };

  const updateAllViews = (): void => {
    SOURCE_DEFINITIONS.forEach((def) => updateSourceView(def.key));
  };

  const runSource = (key: UnifiedSource): void => {
    const def = SOURCE_DEFINITIONS.find((source) => source.key === key);
    if (!def) {
      return;
    }
    const query = state.q.trim();
    if (!query || !state.enabledSources[key]) {
      abortSource(key);
      resetSource(key);
      updateSourceView(key);
      return;
    }
    abortSource(key);
    const controller = new AbortController();
    controllers[key] = controller;
    const entry = perSource[key];
    entry.loading = true;
    entry.error = undefined;
    updateSourceView(key);
    def
      .search(query, state.perSourceLimit, controller.signal)
      .then((cards) => {
        if (controller.signal.aborted) {
          return;
        }
        entry.cards = cards;
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        entry.error = formatError(error);
      })
      .finally(() => {
        if (controller.signal.aborted) {
          return;
        }
        entry.loading = false;
        updateSourceView(key);
        controllers[key] = undefined;
      });
  };

  const runUnifiedSearch = (): void => {
    state.q = queryInput.value.trim();
    updateUrl();
    updateResultsVisibility();
    const query = state.q.trim();
    if (!query) {
      SOURCE_DEFINITIONS.forEach((def) => {
        abortSource(def.key);
        resetSource(def.key);
      });
      updateAllViews();
      return;
    }
    SOURCE_DEFINITIONS.forEach((def) => runSource(def.key));
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runUnifiedSearch();
  });

  filtersToggle.addEventListener('click', () => {
    const isOpen = filtersPanel.dataset.open === 'true';
    setFiltersOpen(!isOpen);
  });

  filtersClose.addEventListener('click', () => {
    closeFilters();
  });

  filtersOverlay.addEventListener('click', () => {
    closeFilters();
  });

  section.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && filtersPanel.dataset.open === 'true') {
      closeFilters();
    }
  });

  resetButton.addEventListener('click', () => {
    queryInput.value = '';
    state.q = '';
    updateUrl();
    updateResultsVisibility();
    SOURCE_DEFINITIONS.forEach((def) => {
      abortSource(def.key);
      resetSource(def.key);
    });
    updateAllViews();
    closeFilters();
  });

  limitSelect.addEventListener('change', () => {
    const next = Number(limitSelect.value);
    state.perSourceLimit = Number.isFinite(next) ? next : state.perSourceLimit;
    if (state.q.trim()) {
      SOURCE_DEFINITIONS.forEach((def) => runSource(def.key));
    }
  });

  imagesCheckbox.addEventListener('change', () => {
    state.showImagesOnly = imagesCheckbox.checked;
    updateAllViews();
  });

  layoutInputs.forEach((input, mode) => {
    input.addEventListener('change', () => {
      if (input.checked) {
        state.layout = mode;
        updateAllViews();
      }
    });
    if (mode === state.layout) {
      input.checked = true;
    }
  });

  sourceCheckboxes.forEach((checkbox, key) => {
    checkbox.addEventListener('change', () => {
      state.enabledSources[key] = checkbox.checked;
      if (!checkbox.checked) {
        abortSource(key);
        resetSource(key);
        updateSourceView(key);
      } else if (state.q.trim()) {
        runSource(key);
      }
    });
  });

  SOURCE_DEFINITIONS.forEach((source) => {
    const block = document.createElement('article');
    block.className = 'home-source';
    block.hidden = true;

    const blockHeader = document.createElement('header');
    blockHeader.className = 'home-source__header';

    const heading = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = source.label;
    heading.appendChild(title);

    const countChip = document.createElement('span');
    countChip.className = 'home-source__count';
    countChip.textContent = '0';

    blockHeader.append(heading, countChip);

    const description = document.createElement('p');
    description.className = 'home-source__description';
    description.textContent = source.description;

    const status = document.createElement('p');
    status.className = 'home-source__status';
    status.textContent = 'Awaiting query…';

    const errorContainer = document.createElement('div');
    errorContainer.className = 'home-source__error';

    const list = document.createElement('div');
    list.className = getLayoutClass(state.layout);
    list.setAttribute('aria-live', 'polite');

    block.append(blockHeader, description, status, errorContainer, list);
    resultsWrapper.appendChild(block);

    views.set(source.key, { section: block, status, list, error: errorContainer, count: countChip });
  });

  updateResultsVisibility();
  updateAllViews();
  if (state.q) {
    runUnifiedSearch();
  }

  return section;
};

const mount = (el: HTMLElement): void => {
  document.body.classList.add('home-minimal');
  el.innerHTML = '';
  const search = createUnifiedSearchSection();
  el.append(search);
};

export default { mount };
