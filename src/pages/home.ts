import { createAlert } from '../components/Alert';
import { renderItemCard } from '../components/Card';
import { fetchJSON, fetchText, HttpError } from '../lib/http';
import type { ItemCard } from '../lib/types';
import { SOURCE_DEFINITIONS } from '../lib/unifiedSearch';
import type { UnifiedSource } from '../lib/unifiedSearch';
import { getUbcIndex, searchUbc } from '../lib/ubc';

const DEFAULT_YALE_MANIFEST = 'https://iiif.harvardartmuseums.org/manifests/object/299843';

const HERO_STATS = [
  { value: '250k+', label: 'Objects proxied', detail: 'Harvard Art Museums sample window with live caching.' },
  { value: '70ms', label: 'Median worker hop', detail: 'Cloudflare Worker latency between you and the APIs.' },
  { value: '7', label: 'APIs unified', detail: 'Harvard, Princeton, Yale, UBC, Dataverse, arXiv, and IIIF.' },
  { value: '0 keys', label: 'In-browser secrets', detail: 'Credentials stay on the Worker; the UI stays safe.' },
] as const;

const DATASET_PAGES = [
  {
    name: 'Harvard Art Museums',
    href: 'harvard.html',
    description: 'Search 250k+ objects, explore galleries, and analyse decades of acquisition history in seconds.',
    meta: 'Objects · Galleries · Color data',
  },
  {
    name: 'Princeton University Art Museum',
    href: 'princeton.html',
    description: 'Inspect rich Linked Art records and maker networks with filters designed for discovery.',
    meta: 'Linked Art · People · Relationships',
  },
  {
    name: 'Yale / IIIF manifests',
    href: 'yale.html',
    description: 'Load any IIIF manifest to preview media, metadata, and canvas structure right in the browser.',
    meta: 'IIIF · Image services · Canvas viewer',
  },
  {
    name: 'Harvard Dataverse',
    href: 'dataverse.html',
    description: 'Track research datasets, subjects, and temporal trends across Harvard’s Dataverse network.',
    meta: 'Datasets · Subjects · Facets',
  },
  {
    name: 'UBC Open Collections',
    href: 'ubc.html',
    description: 'Dive into UBC’s digitised collections with automatic index detection and IIIF previews.',
    meta: 'Collections · Search · IIIF',
  },
  {
    name: 'UBC OAI-PMH',
    href: 'ubc-oai.html',
    description: 'Harvest descriptive records for downstream cataloguing or enrichment workflows.',
    meta: 'OAI-PMH · Metadata harvesting',
  },
  {
    name: 'arXiv',
    href: 'arxiv.html',
    description: 'Track art-adjacent research output and category momentum via the arXiv Atom feed.',
    meta: 'Atom · Categories · Trends',
  },
] as const;

type DatasetCard = (typeof DATASET_PAGES)[number];

type FeatureCard = {
  title: string;
  description: string;
};

const FEATURE_CARDS: FeatureCard[] = [
  {
    title: 'Unified worker edge',
    description: 'One Cloudflare Worker adds keys, enforces headers, and ships cached payloads anywhere on the globe.',
  },
  {
    title: 'Observability-first',
    description: 'Instruments, probes, and diag snapshots are part of the UI so you catch upstream issues instantly.',
  },
  {
    title: 'Visualization playground',
    description: 'Each dataset page doubles as a chart lab with cards, histograms, thumbnails, and raw JSON toggles.',
  },
];

type WorkflowStep = {
  title: string;
  description: string;
};

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    title: 'Ping the Worker',
    description: 'Hit /diag for configuration, cache hints, and key health before you build anything downstream.',
  },
  {
    title: 'Warm a dataset',
    description: 'Use the per-page saved probes or your own fetches with ttl=86400 to prime caches and speed up workshops.',
  },
  {
    title: 'Fork the payloads',
    description: 'Pop open the JSON viewers to copy manifests into notebooks, IIIF viewers, or analytic scripts.',
  },
];

type PlaybookSnippet = {
  title: string;
  description: string;
  code: string;
};

const PLAYBOOK_SNIPPETS: PlaybookSnippet[] = [
  {
    title: 'Harvard highlight',
    description: 'Fetch a single object with caching disabled for fresh metadata.',
    code: "await fetch('https://art.hicksrch.workers.dev/harvard-art/object/299843?ttl=0').then((res) => res.json());",
  },
  {
    title: 'Princeton search',
    description: 'Drill into the Linked Art search surface via the Worker proxy.',
    code:
      "await fetch('https://art.hicksrch.workers.dev/princeton-art/search?q=monet&type=artobjects&size=3').then((res) => res.json());",
  },
  {
    title: 'UBC discovery',
    description: 'Reuse the Worker’s index detection and query UBC collections.',
    code:
      "const index = await (await fetch('https://art.hicksrch.workers.dev/ubc/collections')).json();\nawait fetch(`https://art.hicksrch.workers.dev/ubc/search/8.5?index=${index?.[0]?.slug ?? 'calendars'}&q=botany&size=2`).then((res) => res.json());",
  },
];

type LayoutMode = 'grid' | 'list';

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

const LAYOUT_OPTIONS: LayoutMode[] = ['grid', 'list'];
const LIMIT_OPTIONS = [3, 5, 10, 25];

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
  section.className = 'home-section home-unified-search';

  const header = createSectionHeader(
    'Unified search',
    'Query Harvard, Princeton, Yale, UBC, Dataverse, and arXiv in parallel with output filters.',
  );
  section.appendChild(header);

  const form = document.createElement('form');
  form.className = 'home-search-form';

  const queryField = document.createElement('label');
  queryField.className = 'home-search__field';
  const queryLabel = document.createElement('span');
  queryLabel.className = 'home-search__label';
  queryLabel.textContent = 'Keyword or manifest URL';
  const queryInput = document.createElement('input');
  queryInput.type = 'search';
  queryInput.className = 'home-search__input';
  queryInput.placeholder = 'e.g. impressionism, textiles, https://iiif.example/manifest';
  queryInput.autocomplete = 'off';
  queryField.append(queryLabel, queryInput);

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
  const imagesText = document.createElement('span');
  imagesText.textContent = 'Show images only';
  imagesField.append(imagesCheckbox, imagesText);

  const layoutGroup = document.createElement('div');
  layoutGroup.className = 'home-search__layout';
  const layoutLabel = document.createElement('span');
  layoutLabel.className = 'home-search__label';
  layoutLabel.textContent = 'Layout';
  layoutGroup.appendChild(layoutLabel);
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
  layoutGroup.appendChild(layoutOptions);

  controlsRow.append(limitField, imagesField, layoutGroup);

  const actionRow = document.createElement('div');
  actionRow.className = 'home-search__actions';
  const searchButton = document.createElement('button');
  searchButton.type = 'submit';
  searchButton.className = 'home-search__submit';
  searchButton.textContent = 'Search all sources';
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'home-search__reset';
  resetButton.textContent = 'Reset';
  actionRow.append(searchButton, resetButton);

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

  form.append(queryField, controlsRow, actionRow, sourcesGrid);
  section.appendChild(form);

  const idleMessage = document.createElement('p');
  idleMessage.className = 'home-search__idle';
  idleMessage.textContent = 'Enter a search term to run parallel queries across every API.';
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
      } else {
        updateSourceView(key);
      }
    });
  });

  SOURCE_DEFINITIONS.forEach((source) => {
    const block = document.createElement('section');
    block.className = 'home-source';
    block.dataset.source = source.key;
    block.hidden = true;

    const blockHeader = document.createElement('div');
    blockHeader.className = 'home-source__header';
    const heading = document.createElement('h3');
    heading.textContent = source.label;
    const meta = document.createElement('div');
    meta.className = 'home-source__meta';
    const typeChip = document.createElement('span');
    typeChip.className = 'chip chip--muted';
    typeChip.textContent = source.typeLabel;
    const countChip = document.createElement('span');
    countChip.className = 'chip';
    countChip.textContent = '0';
    meta.append(typeChip, countChip);
    blockHeader.append(heading, meta);

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

type Probe = {
  name: string;
  run: () => Promise<string>;
};

const createProbes = (): Probe[] => [
  {
    name: 'Harvard Art Museums',
    run: async () => {
      const data = await fetchJSON<{ records?: unknown[] }>('/harvard-art/object', { size: 1 });
      const count = Array.isArray(data.records) ? data.records.length : 0;
      return `${count} record${count === 1 ? '' : 's'} returned`;
    },
  },
  {
    name: 'Princeton Art Museum',
    run: async () => {
      const data = await fetchJSON<{ hits?: { hits?: unknown[] } }>('/princeton-art/search', {
        q: 'monet',
        type: 'artobjects',
        size: 1,
      });
      const hits = data.hits?.hits;
      const count = Array.isArray(hits) ? hits.length : 0;
      return `${count} hit${count === 1 ? '' : 's'} returned`;
    },
  },
  {
    name: 'Harvard Dataverse',
    run: async () => {
      const data = await fetchJSON<{ data?: { items?: unknown[] } }>('/dataverse/search', {
        q: 'data',
        type: 'dataset',
        per_page: 1,
      });
      const items = data.data?.items;
      const count = Array.isArray(items) ? items.length : 0;
      return `${count} item${count === 1 ? '' : 's'} returned`;
    },
  },
  {
    name: 'UBC Open Collections',
    run: async () => {
      const index = await getUbcIndex();
      await searchUbc('newspaper', { size: 1 });
      return `Index ${index} reachable`;
    },
  },
  {
    name: 'arXiv',
    run: async () => {
      await fetchText('/arxiv/search', {
        search_query: 'cat:cs.AI',
        max_results: 1,
      });
      return 'Atom feed reachable';
    },
  },
  {
    name: 'Yale IIIF',
    run: async () => {
      await fetchJSON('/yale-iiif', { url: DEFAULT_YALE_MANIFEST });
      return 'Sample manifest loaded';
    },
  },
];

const createSectionHeader = (title: string, description: string): HTMLElement => {
  const header = document.createElement('div');
  header.className = 'home-section__header';

  const heading = document.createElement('h2');
  heading.textContent = title;

  const intro = document.createElement('p');
  intro.className = 'home-section__intro';
  intro.textContent = description;

  header.append(heading, intro);
  return header;
};

const createHeroSection = (): HTMLElement => {
  const section = document.createElement('section');
  section.className = 'home-hero';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'home-hero__eyebrow';
  eyebrow.textContent = 'Explore open art data';

  const title = document.createElement('h1');
  title.className = 'home-hero__title';
  title.textContent = 'Art API Explorer';

  const intro = document.createElement('p');
  intro.className = 'home-hero__intro';
  intro.textContent =
    'A single, instrumented front door to Harvard, Princeton, Yale, UBC, Dataverse, and arXiv APIs—complete with charts, live health checks, and raw payload access.';

  const ctaGroup = document.createElement('div');
  ctaGroup.className = 'home-hero__cta';

  const primaryCta = document.createElement('a');
  primaryCta.className = 'home-hero__cta-primary';
  primaryCta.href = DATASET_PAGES[0]?.href ?? '#datasets';
  primaryCta.textContent = 'Start exploring';

  const secondaryCta = document.createElement('a');
  secondaryCta.className = 'home-hero__cta-secondary';
  secondaryCta.href = '#live-status';
  secondaryCta.textContent = 'View live checks';

  const highlights = document.createElement('ul');
  highlights.className = 'home-hero__highlights';
  const highlightCopy = [
    'Unified Worker proxy with caching and secret management',
    'Visual tooling for objects, manifests, and datasets',
    'Open diagnostics so you always know what is happening',
  ];
  highlightCopy.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    highlights.appendChild(li);
  });

  const stats = document.createElement('div');
  stats.className = 'home-hero__stats';
  HERO_STATS.forEach((stat) => {
    const card = document.createElement('article');
    card.className = 'home-hero__stat';

    const value = document.createElement('span');
    value.className = 'home-hero__stat-value';
    value.textContent = stat.value;

    const label = document.createElement('span');
    label.className = 'home-hero__stat-label';
    label.textContent = stat.label;

    const detail = document.createElement('p');
    detail.className = 'home-hero__stat-detail';
    detail.textContent = stat.detail;

    card.append(value, label, detail);
    stats.appendChild(card);
  });

  ctaGroup.append(primaryCta, secondaryCta);
  section.append(eyebrow, title, intro, ctaGroup, highlights, stats);
  return section;
};

const createFeatureSection = (): HTMLElement => {
  const section = document.createElement('section');
  section.className = 'home-section';
  section.appendChild(createSectionHeader('Why this explorer?', 'Every surface is tuned for experimentation, speed, and clarity.'));

  const grid = document.createElement('div');
  grid.className = 'home-feature-grid';

  FEATURE_CARDS.forEach((feature) => {
    const card = document.createElement('article');
    card.className = 'home-feature-card';

    const heading = document.createElement('h3');
    heading.textContent = feature.title;

    const copy = document.createElement('p');
    copy.textContent = feature.description;

    card.append(heading, copy);
    grid.appendChild(card);
  });

  section.appendChild(grid);
  return section;
};

const createDatasetCard = ({ name, href, description, meta }: DatasetCard): HTMLElement => {
  const card = document.createElement('article');
  card.className = 'home-dataset-card';

  const heading = document.createElement('h3');
  const link = document.createElement('a');
  link.href = href;
  link.textContent = name;
  heading.appendChild(link);

  const copy = document.createElement('p');
  copy.textContent = description;

  const metaEl = document.createElement('p');
  metaEl.className = 'home-dataset-card__meta';
  metaEl.textContent = meta;

  card.append(heading, copy, metaEl);
  return card;
};

const createDatasetSection = (): HTMLElement => {
  const section = document.createElement('section');
  section.className = 'home-section';
  section.id = 'datasets';
  section.appendChild(
    createSectionHeader(
      'Explore the catalogues',
      'Pick a collection to browse interactive charts, saved queries, and raw payloads.'
    )
  );

  const grid = document.createElement('div');
  grid.className = 'home-dataset-grid';
  DATASET_PAGES.forEach((page) => {
    grid.appendChild(createDatasetCard(page));
  });

  section.appendChild(grid);
  return section;
};

type PulseSection = {
  section: HTMLElement;
  statusList: HTMLElement;
  renderDiagnostics: (data: unknown) => void;
  showDiagnosticsError: (message: string) => void;
};

const createPulseSection = (): PulseSection => {
  const section = document.createElement('section');
  section.className = 'home-section home-pulse';
  section.id = 'live-status';
  section.appendChild(
    createSectionHeader('Live API pulse', 'Real-time probes sit next to Worker diagnostics so you can troubleshoot at a glance.')
  );

  const layout = document.createElement('div');
  layout.className = 'home-pulse__layout';
  section.appendChild(layout);

  const probesColumn = document.createElement('div');
  probesColumn.className = 'home-pulse__col home-pulse__col--probes';
  const probesLabel = document.createElement('p');
  probesLabel.className = 'home-pulse__label';
  probesLabel.textContent = 'Active checks';
  probesColumn.appendChild(probesLabel);

  const statusList = document.createElement('div');
  statusList.className = 'home-status-grid';
  statusList.setAttribute('role', 'list');
  statusList.setAttribute('aria-live', 'polite');
  probesColumn.appendChild(statusList);
  layout.appendChild(probesColumn);

  const diagColumn = document.createElement('div');
  diagColumn.className = 'home-pulse__col home-pulse__col--diag';
  const diagLabel = document.createElement('p');
  diagLabel.className = 'home-pulse__label';
  diagLabel.textContent = 'Worker snapshot';
  diagColumn.appendChild(diagLabel);

  const diagCard = document.createElement('div');
  diagCard.className = 'home-diag-card';
  diagColumn.appendChild(diagCard);

  const diagStats = document.createElement('div');
  diagStats.className = 'home-diag__stats';
  diagCard.appendChild(diagStats);

  const diagTimeline = document.createElement('ul');
  diagTimeline.className = 'home-diag__timeline';
  diagCard.appendChild(diagTimeline);

  const renderDiagnostics = (data: unknown): void => {
    diagStats.innerHTML = '';
    diagTimeline.innerHTML = '';
    if (!data || typeof data !== 'object') {
      diagStats.appendChild(createAlert('Diagnostic payload malformed.', 'error'));
      return;
    }

    const record = data as Record<string, unknown>;
    const keysValue = record.keys;
    const keys = typeof keysValue === 'object' && keysValue !== null ? (keysValue as Record<string, unknown>) : {};
    const dataverseBase = typeof record.dataverseBase === 'string' ? record.dataverseBase : 'Unknown';
    const allowedOrigins = typeof record.allowedOrigins === 'string' ? record.allowedOrigins : 'Default (*)';
    const workerVersion = typeof record.version === 'string' ? record.version : 'Stable';

    const makeStat = (label: string, value: string): HTMLElement => {
      const stat = document.createElement('article');
      stat.className = 'home-diag__stat';
      const statLabel = document.createElement('span');
      statLabel.className = 'home-diag__stat-label';
      statLabel.textContent = label;
      const statValue = document.createElement('span');
      statValue.className = 'home-diag__stat-value';
      statValue.textContent = value;
      stat.append(statLabel, statValue);
      return stat;
    };

    const secretEntries = Object.entries(keys);
    const enabledSecrets = secretEntries.filter(([, value]) => value === true).length;
    diagStats.append(
      makeStat('Worker version', workerVersion),
      makeStat('Dataverse base', dataverseBase),
      makeStat('Allowed origins', allowedOrigins),
      makeStat('Secrets', secretEntries.length ? `${enabledSecrets}/${secretEntries.length} present` : 'Not reported')
    );

    const timelineTitle = document.createElement('li');
    timelineTitle.className = 'home-diag__timeline-title';
    timelineTitle.textContent = 'Secrets snapshot';
    diagTimeline.appendChild(timelineTitle);

    if (secretEntries.length === 0) {
      const item = document.createElement('li');
      item.textContent = 'No secret data surfaced.';
      diagTimeline.appendChild(item);
    } else {
      secretEntries
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([name, value]) => {
          const item = document.createElement('li');
          const enabled = value === true;
          item.textContent = `${name}: ${enabled ? 'present' : 'missing'}`;
          item.className = enabled ? 'home-diag__timeline-item home-diag__timeline-item--ok' : 'home-diag__timeline-item';
          diagTimeline.appendChild(item);
        });
    }

    const rawLink = document.createElement('a');
    rawLink.href = '/diag?debug=1';
    rawLink.className = 'home-diag__raw';
    rawLink.textContent = 'Open full diagnostics →';
    const rawItem = document.createElement('li');
    rawItem.appendChild(rawLink);
    diagTimeline.appendChild(rawItem);
  };

  const showDiagnosticsError = (message: string): void => {
    diagStats.innerHTML = '';
    diagTimeline.innerHTML = '';
    diagStats.appendChild(createAlert(message, 'error'));
  };

  layout.appendChild(diagColumn);

  return { section, statusList, renderDiagnostics, showDiagnosticsError };
};

const createWorkflowSection = (): HTMLElement => {
  const section = document.createElement('section');
  section.className = 'home-section home-workflow';
  section.appendChild(
    createSectionHeader('Operational playbook', 'A lightweight workflow that keeps demos and sprints on track.')
  );

  const list = document.createElement('ol');
  list.className = 'home-workflow__list';
  WORKFLOW_STEPS.forEach((step) => {
    const item = document.createElement('li');
    item.className = 'home-workflow__step';

    const title = document.createElement('h3');
    title.textContent = step.title;
    const copy = document.createElement('p');
    copy.textContent = step.description;

    item.append(title, copy);
    list.appendChild(item);
  });

  section.appendChild(list);
  return section;
};

const createQuickStartSection = (): HTMLElement => {
  const section = document.createElement('section');
  section.className = 'home-section home-playbook';
  section.appendChild(
    createSectionHeader('Console-ready snippets', 'Drop these directly into devtools, RunKit, or a notebook cell.')
  );

  const grid = document.createElement('div');
  grid.className = 'home-playbook__grid';
  PLAYBOOK_SNIPPETS.forEach((snippet) => {
    const card = document.createElement('article');
    card.className = 'home-playbook__card';

    const title = document.createElement('h3');
    title.textContent = snippet.title;

    const copy = document.createElement('p');
    copy.textContent = snippet.description;

    const pre = document.createElement('pre');
    pre.className = 'home-playbook__snippet';
    pre.textContent = snippet.code;

    const hint = document.createElement('p');
    hint.className = 'home-playbook__hint';
    hint.textContent = 'Tip: append ?ttl=0 for uncached, ttl=86400 to prewarm.';

    card.append(title, copy, pre, hint);
    grid.appendChild(card);
  });

  section.appendChild(grid);
  return section;
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const hero = createHeroSection();
  const unified = createUnifiedSearchSection();
  const features = createFeatureSection();
  const datasets = createDatasetSection();
  const pulse = createPulseSection();
  const workflow = createWorkflowSection();
  const quickStart = createQuickStartSection();

  el.append(hero, unified, pulse.section, features, datasets, workflow, quickStart);

  void fetchJSON('/diag')
    .then((data) => {
      pulse.renderDiagnostics(data);
    })
    .catch((error) => {
      pulse.showDiagnosticsError(`Failed to load diagnostics: ${error instanceof Error ? error.message : String(error)}`);
    });

  const probes = createProbes();
  probes.forEach((probe) => {
    const card = document.createElement('article');
    card.className = 'home-status-card';
    card.setAttribute('role', 'listitem');

    const title = document.createElement('h3');
    title.textContent = probe.name;

    const message = document.createElement('p');
    message.className = 'home-status-card__message';
    message.textContent = 'Checking…';

    card.append(title, message);
    pulse.statusList.appendChild(card);

    probe
      .run()
      .then((result) => {
        message.textContent = result;
        card.classList.add('home-status-card--ok');
      })
      .catch((error) => {
        message.textContent = `Failed: ${error instanceof Error ? error.message : String(error)}`;
        card.classList.add('home-status-card--error');
      });
  });
};

export default { mount };
