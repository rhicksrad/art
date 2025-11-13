import { createAlert } from '../components/Alert';
import { fetchJSON, fetchText } from '../lib/http';
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
  const features = createFeatureSection();
  const datasets = createDatasetSection();
  const pulse = createPulseSection();
  const workflow = createWorkflowSection();
  const quickStart = createQuickStartSection();

  el.append(hero, pulse.section, features, datasets, workflow, quickStart);

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
