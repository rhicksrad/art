import { createAlert } from '../components/Alert';
import { fetchJSON, fetchText } from '../lib/http';
import { getUbcIndex, searchUbc } from '../lib/ubc';

const DEFAULT_YALE_MANIFEST = 'https://iiif.harvardartmuseums.org/manifests/object/299843';

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
    title: 'One gateway, many collections',
    description: 'Send every API request through a single Worker that adds credentials, normalises headers, and caches responses.',
  },
  {
    title: 'Live diagnostics baked in',
    description: 'Every page surfaces health probes, secret status, and upstream URLs so you can debug without leaving the UI.',
  },
  {
    title: 'Built for exploration',
    description: 'Visualise timelines, colour palettes, and subject distributions, or open the raw JSON to continue in your own tools.',
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

  ctaGroup.append(primaryCta, secondaryCta);
  section.append(eyebrow, title, intro, ctaGroup, highlights);
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

type StatusSection = {
  section: HTMLElement;
  list: HTMLElement;
};

const createStatusSection = (): StatusSection => {
  const section = document.createElement('section');
  section.className = 'home-section';
  section.id = 'live-status';
  section.appendChild(
    createSectionHeader('Live API checks', 'We probe each upstream service continuously so you know what is responsive right now.')
  );

  const list = document.createElement('div');
  list.className = 'home-status-grid';
  list.setAttribute('role', 'list');
  list.setAttribute('aria-live', 'polite');
  section.appendChild(list);

  return { section, list };
};

type DiagnosticsSection = {
  section: HTMLElement;
  render: (data: unknown) => void;
  showError: (message: string) => void;
};

const createDiagnosticsSection = (): DiagnosticsSection => {
  const section = document.createElement('section');
  section.className = 'home-section home-diagnostics';
  section.appendChild(
    createSectionHeader(
      'Worker diagnostics',
      'A snapshot of configuration and connectivity straight from the Cloudflare Worker.'
    )
  );

  const body = document.createElement('div');
  body.className = 'home-diag__body';
  section.appendChild(body);

  const content = document.createElement('div');
  content.className = 'home-diag__grid';
  body.appendChild(content);

  const render = (data: unknown): void => {
    content.innerHTML = '';
    if (!data || typeof data !== 'object') {
      content.appendChild(createAlert('Diagnostic payload malformed.', 'error'));
      return;
    }

    const record = data as Record<string, unknown>;
    const keysValue = record.keys;
    const keys = typeof keysValue === 'object' && keysValue !== null ? (keysValue as Record<string, unknown>) : {};
    const dataverseBase = typeof record.dataverseBase === 'string' ? record.dataverseBase : 'Unknown';
    const allowedOrigins = typeof record.allowedOrigins === 'string' ? record.allowedOrigins : 'Default (*)';

    const secretsCard = document.createElement('div');
    secretsCard.className = 'home-diag__item';
    const secretsTitle = document.createElement('h3');
    secretsTitle.textContent = 'Secrets';
    const secretsList = document.createElement('ul');
    secretsList.className = 'home-diag__list';
    const secretEntries = Object.entries(keys);
    if (secretEntries.length === 0) {
      const item = document.createElement('li');
      item.textContent = 'No secret information returned.';
      secretsList.appendChild(item);
    } else {
      secretEntries
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([name, value]) => {
          const item = document.createElement('li');
          const enabled = value === true;
          item.textContent = `${name}: ${enabled ? 'present' : 'missing'}`;
          secretsList.appendChild(item);
        });
    }
    secretsCard.append(secretsTitle, secretsList);
    content.appendChild(secretsCard);

    const configCard = document.createElement('div');
    configCard.className = 'home-diag__item';
    const configTitle = document.createElement('h3');
    configTitle.textContent = 'Configuration';

    const configList = document.createElement('dl');
    configList.className = 'home-diag__definitions';

    const dataverseTerm = document.createElement('dt');
    dataverseTerm.textContent = 'Dataverse base';
    const dataverseValue = document.createElement('dd');
    dataverseValue.textContent = dataverseBase;

    const originTerm = document.createElement('dt');
    originTerm.textContent = 'Allowed origins';
    const originValue = document.createElement('dd');
    originValue.textContent = allowedOrigins;

    configList.append(dataverseTerm, dataverseValue, originTerm, originValue);
    configCard.append(configTitle, configList);
    content.appendChild(configCard);

    const rawLink = document.createElement('a');
    rawLink.href = '/diag?debug=1';
    rawLink.className = 'home-diag__raw';
    rawLink.textContent = 'Open full diagnostics →';
    content.appendChild(rawLink);
  };

  const showError = (message: string): void => {
    content.innerHTML = '';
    content.appendChild(createAlert(message, 'error'));
  };

  return { section, render, showError };
};

const createQuickStartSection = (): HTMLElement => {
  const section = document.createElement('section');
  section.className = 'home-section';
  section.appendChild(
    createSectionHeader('Try it instantly', 'Copy a snippet into your console or notebook to hit the Worker right away.')
  );

  const pre = document.createElement('pre');
  pre.textContent = `await fetch('https://art.hicksrch.workers.dev/harvard-art/object/299843?ttl=0')\n  .then((res) => res.json());`;
  section.appendChild(pre);
  return section;
};

const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const hero = createHeroSection();
  const features = createFeatureSection();
  const datasets = createDatasetSection();
  const status = createStatusSection();
  const diagnostics = createDiagnosticsSection();
  const quickStart = createQuickStartSection();

  el.append(hero, features, datasets, status.section, diagnostics.section, quickStart);

  void fetchJSON('/diag')
    .then((data) => {
      diagnostics.render(data);
    })
    .catch((error) => {
      diagnostics.showError(`Failed to load diagnostics: ${error instanceof Error ? error.message : String(error)}`);
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
    status.list.appendChild(card);

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
