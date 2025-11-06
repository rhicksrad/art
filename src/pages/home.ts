import { createAlert } from '../components/Alert';
import { fetchJSON, fetchText } from '../lib/http';
import { getUbcIndex, searchUbc } from '../lib/ubc';

const DEFAULT_YALE_MANIFEST = 'https://iiif.harvardartmuseums.org/manifests/object/299843';

const mount = (el: HTMLElement): void => {
  el.innerHTML = '';

  const heading = document.createElement('h1');
  heading.textContent = 'Art API Explorer';

  const diagSection = document.createElement('section');
  const diagHeading = document.createElement('h2');
  diagHeading.textContent = 'Worker diagnostics';
  const diagContent = document.createElement('div');
  diagSection.append(diagHeading, diagContent);

  const navSection = document.createElement('section');
  const navHeading = document.createElement('h2');
  navHeading.textContent = 'Explore datasets';
  const navList = document.createElement('ul');
  navList.className = 'nav-list';
  const pages = [
    { href: 'harvard.html', label: 'Harvard Art Museums' },
    { href: 'princeton.html', label: 'Princeton University Art Museum' },
    { href: 'yale.html', label: 'Yale / IIIF manifests' },
    { href: 'dataverse.html', label: 'Harvard Dataverse' },
    { href: 'ubc.html', label: 'UBC Open Collections' },
    { href: 'ubc-oai.html', label: 'UBC OAI-PMH' },
    { href: 'arxiv.html', label: 'arXiv' },
  ];
  pages.forEach((page) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = page.href;
    link.textContent = page.label;
    item.appendChild(link);
    navList.appendChild(item);
  });
  navSection.append(navHeading, navList);

  const statusSection = document.createElement('section');
  const statusHeading = document.createElement('h2');
  statusHeading.textContent = 'Source status';
  const statusList = document.createElement('div');
  statusList.className = 'status-list';
  statusSection.append(statusHeading, statusList);

  el.append(heading, diagSection, navSection, statusSection);

  const renderDiag = (data: unknown): void => {
    diagContent.innerHTML = '';
    if (!data || typeof data !== 'object') {
      diagContent.appendChild(createAlert('Diagnostic payload malformed.', 'error'));
      return;
    }
    const record = data as Record<string, unknown>;
    const keys = record.keys && typeof record.keys === 'object' ? (record.keys as Record<string, unknown>) : {};
    const keysList = document.createElement('ul');
    keysList.className = 'keys-list';
    Object.entries(keys).forEach(([name, value]) => {
      const item = document.createElement('li');
      const enabled = value === true;
      item.textContent = `${name}: ${enabled ? 'present' : 'missing'}`;
      keysList.appendChild(item);
    });
    const dataverseBase = typeof record.dataverseBase === 'string' ? record.dataverseBase : 'unknown';
    const baseLine = document.createElement('p');
    baseLine.textContent = `Dataverse base: ${dataverseBase}`;
    diagContent.append(keysList, baseLine);
  };

  void fetchJSON('/diag')
    .then((data) => {
      renderDiag(data);
    })
    .catch((error) => {
      diagContent.replaceChildren(createAlert(`Failed to load diagnostics: ${error instanceof Error ? error.message : error}`, 'error'));
    });

  type Probe = {
    name: string;
    run: () => Promise<string>;
  };

  const probes: Probe[] = [
    {
      name: 'Harvard',
      run: async () => {
        const data = await fetchJSON<{ records?: unknown[] }>('/harvard-art/object', { size: 1 });
        const count = Array.isArray(data.records) ? data.records.length : 0;
        return `${count} record${count === 1 ? '' : 's'} returned`;
      },
    },
    {
      name: 'Princeton',
      run: async () => {
        const data = await fetchJSON<{ hits?: { hits?: unknown[] } }>('/princeton-art/search', {
          q: 'monet',
          type: 'artobjects',
          size: 1,
        });
        const count = Array.isArray(data.hits?.hits) ? data.hits?.hits?.length ?? 0 : 0;
        return `${count} hit${count === 1 ? '' : 's'} returned`;
      },
    },
    {
      name: 'Dataverse',
      run: async () => {
        const data = await fetchJSON<{ data?: { items?: unknown[] } }>('/dataverse/search', {
          q: 'data',
          type: 'dataset',
          per_page: 1,
        });
        const count = Array.isArray(data.data?.items) ? data.data?.items.length ?? 0 : 0;
        return `${count} item${count === 1 ? '' : 's'} returned`;
      },
    },
    {
      name: 'UBC',
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

  probes.forEach((probe) => {
    const card = document.createElement('div');
    card.className = 'status-card';
    const title = document.createElement('strong');
    title.textContent = probe.name;
    const message = document.createElement('p');
    message.textContent = 'Loading…';
    card.append(title, message);
    statusList.appendChild(card);

    probe
      .run()
      .then((result) => {
        message.textContent = result;
        card.classList.add('status-card--ok');
      })
      .catch((error) => {
        card.replaceChildren(title, createAlert(`Failed: ${error instanceof Error ? error.message : String(error)}`, 'error'));
      });
  });
};

export default { mount };
