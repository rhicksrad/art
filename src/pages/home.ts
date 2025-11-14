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
  section.className = 'home-section home-section--search';

  const header = document.createElement('div');
  header.className = 'home-search__header';
  const heading = document.createElement('h2');
  heading.textContent = 'Search the art APIs';
  const intro = document.createElement('p');
  intro.textContent = 'One box, six sources. Type a keyword or paste a IIIF manifest and press enter.';
  header.append(heading, intro);
  section.appendChild(header);

  const form = document.createElement('form');
  form.className = 'home-search-form';

  const surface = document.createElement('div');
  surface.className = 'home-search__surface';

  const queryInput = document.createElement('input');
  queryInput.type = 'search';
  queryInput.className = 'home-search__input home-search__input--main';
  queryInput.placeholder = 'e.g. impressionism, textiles, https://iiif.example/manifest';
  queryInput.autocomplete = 'off';

  const searchButton = document.createElement('button');
  searchButton.type = 'submit';
  searchButton.className = 'home-search__submit';
  searchButton.textContent = 'Search';

  surface.append(queryInput, searchButton);

  const filters = document.createElement('details');
  filters.className = 'home-search__filters';
  const summary = document.createElement('summary');
  summary.className = 'home-search__filters-summary';
  summary.textContent = 'Filters & sources';
  const summaryHint = document.createElement('span');
  summaryHint.className = 'home-search__filters-hint';
  summaryHint.textContent = 'Adjust limits, layouts, images, and feeds.';
  summary.appendChild(summaryHint);
  filters.appendChild(summary);

  const filtersBody = document.createElement('div');
  filtersBody.className = 'home-search__filters-body';
  filters.appendChild(filtersBody);

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

  form.append(surface, filters);
  section.appendChild(form);

  const idleMessage = document.createElement('p');
  idleMessage.className = 'home-search__idle';
  idleMessage.textContent = 'Start typing to search every API at once.';
  section.appendChild(idleMessage);

  const resultsWrapper = document.createElement('div');
  resultsWrapper.className = 'home-source-grid';
  section.appendChild(resultsWrapper);

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

  const updateIdleState = (): void => {
    const hasQuery = state.q.trim().length > 0;
    idleMessage.hidden = hasQuery;
    resultsWrapper.hidden = !hasQuery;
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
    updateIdleState();
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

  resetButton.addEventListener('click', () => {
    queryInput.value = '';
    state.q = '';
    updateUrl();
    updateIdleState();
    SOURCE_DEFINITIONS.forEach((def) => {
      abortSource(def.key);
      resetSource(def.key);
    });
    updateAllViews();
    filters.open = false;
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

  updateIdleState();
  updateAllViews();
  if (state.q) {
    runUnifiedSearch();
  }

  return section;
};

const createMinimalHero = (): HTMLElement => {
  const section = document.createElement('section');
  section.className = 'home-hero home-hero--minimal';

  const title = document.createElement('h1');
  title.textContent = 'Art API Explorer';

  const intro = document.createElement('p');
  intro.textContent = 'A calm front door to Harvard, Princeton, Yale, UBC, Dataverse, and arXiv.';

  const hint = document.createElement('p');
  hint.className = 'home-hero__hint';
  hint.textContent = 'No fluff—just search when you are ready.';

  section.append(title, intro, hint);
  return section;
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = '';
  const hero = createMinimalHero();
  const search = createUnifiedSearchSection();
  el.append(hero, search);
};

export default { mount };
