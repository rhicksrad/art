import { clear, h, icon } from '../lib/dom';
import { redactSecrets, workerUrl, type QueryParams } from '../lib/http';
import { WORKER_BASE } from '../lib/config';

type Probe = {
  name: string;
  path: string;
  params?: QueryParams;
  /** Summarise a successful body, or throw to mark the probe as failed. */
  check: (body: string) => string;
};

type ProbeResult = {
  probe: Probe;
  url: string;
  ok: boolean;
  status: number;
  ms: number;
  contentType: string;
  detail: string;
  sample?: string;
};

const json = (body: string): Record<string, unknown> => JSON.parse(body) as Record<string, unknown>;

const count = (value: unknown, noun: string): string => {
  if (typeof value !== 'number') throw new Error(`Response did not include a ${noun} count`);
  return `${value.toLocaleString('en-US')} ${noun}`;
};

const contains = (body: string, needle: string, summary: string): string => {
  if (!body.includes(needle)) throw new Error(`Expected ${needle} in the response`);
  return summary;
};

const PROBES: Probe[] = [
  {
    name: 'Harvard Art Museums',
    path: '/harvard-art/object',
    params: { q: 'monet', size: 1 },
    check: (body) =>
      count(
        (json(body).info as Record<string, unknown> | undefined)?.totalrecords,
        'objects for “monet”',
      ),
  },
  {
    name: 'Princeton University Art Museum',
    path: '/princeton-art/search',
    params: { q: 'monet', type: 'artobjects', size: 1 },
    check: (body) => {
      const total = (json(body).hits as Record<string, unknown> | undefined)?.total;
      return count(
        typeof total === 'object' && total ? (total as Record<string, unknown>).value : total,
        'objects for “monet”',
      );
    },
  },
  {
    name: 'Northwestern Digital Collections',
    path: '/northwestern/api/v2/search',
    params: { query: 'poster', size: 1 },
    check: (body) =>
      count(
        (json(body).pagination as Record<string, unknown> | undefined)?.total_hits,
        'works for “poster”',
      ),
  },
  {
    name: 'UBC collections list',
    path: '/ubc/collections',
    check: (body) =>
      count(
        Object.keys((json(body).data as Record<string, unknown> | undefined) ?? {}).length ||
          undefined,
        'collections',
      ),
  },
  {
    name: 'UBC search',
    path: '/ubc/search/8.5',
    params: { index: 'calendars', q: 'newspaper', size: 1 },
    check: (body) => {
      json(body);
      return 'Search responded with JSON';
    },
  },
  {
    name: 'UBC OAI-PMH',
    path: '/ubc-oai',
    params: { verb: 'Identify' },
    check: (body) => contains(body, 'Identify', 'Identify responded'),
  },
  {
    name: 'Stanford PURL record',
    path: '/stanford-purl/bb112zx3193.json',
    check: (body) => `“${String(json(body).label ?? 'record')}”`,
  },
  {
    name: 'Stanford IIIF manifest',
    path: '/stanford-purl/bb112zx3193/iiif/manifest',
    check: (body) => contains(body, 'sc:Manifest', 'IIIF manifest returned'),
  },
  {
    name: 'HathiTrust Catalog',
    path: '/hathi-catalog/api/volumes/full/oclc/424023.json',
    check: (body) =>
      count((json(body).items as unknown[] | undefined)?.length, 'digitised copies of OCLC 424023'),
  },
  {
    name: 'Leipzig IIIF manifest',
    path: '/leipzig-iiif/0000000001/manifest.json',
    check: (body) => contains(body, 'sc:Manifest', 'IIIF manifest returned'),
  },
  {
    name: 'Bern rare books (e-rara IIIF)',
    path: '/bern-iiif/i3f/v20/2273935/manifest',
    check: (body) => contains(body, 'sc:Manifest', 'IIIF manifest returned'),
  },
  {
    name: 'arXiv',
    path: '/arxiv/search',
    params: { search_query: 'all:museum', max_results: 1 },
    check: (body) => contains(body, '<entry>', 'Atom feed with entries'),
  },
  {
    name: 'Harvard Dataverse',
    path: '/dataverse/search',
    params: { q: 'museum', type: 'dataset', per_page: 1 },
    check: (body) =>
      count(
        (json(body).data as Record<string, unknown> | undefined)?.total_count,
        'datasets for “museum”',
      ),
  },
  {
    name: 'HTRC Extracted Features',
    path: '/htrc/ef-api/volumes/mdp.39015025315527/metadata',
    check: (body) => {
      json(body);
      return 'Metadata returned';
    },
  },
];

/** The Worker wraps upstream HTML and errors in `{ upstream, status, contentType, sample }`. */
const diagnosticOf = (body: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' && ('upstream' in parsed || 'error' in parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
};

const runProbe = async (probe: Probe): Promise<ProbeResult> => {
  // ttl=0 bypasses the Worker cache so this reflects the upstream right now.
  const url = workerUrl(probe.path, { ...probe.params, ttl: 0 }).toString();
  const started = performance.now();
  const base = { probe, url, contentType: '' };
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json,application/xml;q=0.9,*/*;q=0.5' },
    });
    const body = redactSecrets(await response.text());
    const ms = Math.round(performance.now() - started);
    const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';
    const diagnostic = diagnosticOf(body);
    if (!response.ok) {
      const reason = diagnostic?.error ?? diagnostic?.statusText ?? response.statusText;
      return {
        ...base,
        ok: false,
        status: response.status,
        ms,
        contentType,
        detail: `Upstream answered ${response.status}${reason ? ` ${String(reason)}` : ''}`,
        sample: String(diagnostic?.sample ?? diagnostic?.detail ?? body).slice(0, 1200),
      };
    }
    try {
      const reachable = probe.check(body);
      const wrapped =
        diagnostic && 'upstream' in diagnostic
          ? ` (upstream sent ${String(diagnostic.contentType ?? 'HTML')})`
          : '';
      return {
        ...base,
        ok: true,
        status: response.status,
        ms,
        contentType,
        detail: `${reachable}${wrapped}`,
      };
    } catch (error) {
      return {
        ...base,
        ok: false,
        status: response.status,
        ms,
        contentType,
        detail: error instanceof Error ? error.message : String(error),
        sample: body.slice(0, 1200),
      };
    }
  } catch (error) {
    return {
      ...base,
      ok: false,
      status: 0,
      ms: Math.round(performance.now() - started),
      detail: `Worker unreachable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const mount = (el: HTMLElement): void => {
  document.title = 'Worker status | Art API Explorer';
  const summary = h('p', { class: 'status-line', 'aria-live': 'polite' });
  const worker = h('dl', { class: 'facts facts--compact' });
  const tbody = h('tbody');
  const again = h('button', { type: 'button', class: 'button' }, 'Run again');

  const row = (probe: Probe): HTMLTableRowElement =>
    h(
      'tr',
      { dataset: { probe: probe.name } },
      h('th', { scope: 'row' }, probe.name),
      h('td', null, h('span', { class: 'pill pill--pending' }, 'Checking…')),
      h('td', { class: 'num' }, '—'),
      h('td', { class: 'num' }, '—'),
      h('td', null, h('code', null, probe.path)),
    );

  const paint = (result: ProbeResult): void => {
    const target = Array.from(tbody.children).find(
      (tr) => (tr as HTMLElement).dataset.probe === result.probe.name,
    );
    if (!target) return;
    const detail = h('td', { class: 'status-table__detail' }, h('span', null, result.detail));
    if (result.sample)
      detail.append(
        h(
          'details',
          { class: 'disclosure' },
          h('summary', null, 'Response body'),
          h('pre', { class: 'code' }, result.sample),
        ),
      );
    detail.append(
      h(
        'a',
        { href: result.url, target: '_blank', rel: 'noreferrer', class: 'status-table__link' },
        h('code', null, result.probe.path),
        icon('external', 13),
      ),
    );
    target.replaceChildren(
      h('th', { scope: 'row' }, result.probe.name),
      h(
        'td',
        null,
        h(
          'span',
          { class: `pill ${result.ok ? 'pill--ok' : 'pill--bad'}` },
          icon(result.ok ? 'check' : 'alert', 13),
          result.ok ? 'Working' : 'Failing',
        ),
      ),
      h('td', { class: 'num' }, result.status === 0 ? '—' : String(result.status)),
      h('td', { class: 'num' }, `${result.ms} ms`),
      detail,
    );
  };

  const loadDiag = async (): Promise<void> => {
    clear(worker);
    const add = (label: string, value: string): void => {
      worker.append(h('dt', null, label), h('dd', null, value));
    };
    add('Worker', WORKER_BASE);
    try {
      const response = await fetch(workerUrl('/diag', { ttl: 0 }).toString());
      const diag = (await response.json()) as {
        version?: string;
        now?: string;
        keys?: Record<string, boolean>;
        cors?: string;
      };
      add('Version', diag.version ?? 'unknown');
      for (const [key, present] of Object.entries(diag.keys ?? {}))
        add(key, present ? 'configured' : 'missing');
      add('CORS', diag.cors ?? 'unknown');
    } catch (error) {
      add(
        'Diagnostics',
        `/diag could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const run = async (): Promise<void> => {
    again.disabled = true;
    tbody.replaceChildren(...PROBES.map(row));
    summary.textContent = `Checking ${PROBES.length} endpoints…`;
    void loadDiag();
    let healthy = 0;
    await Promise.all(
      PROBES.map(async (probe) => {
        const result = await runProbe(probe);
        if (result.ok) healthy += 1;
        paint(result);
      }),
    );
    summary.textContent = `${healthy} of ${PROBES.length} endpoints are working right now.`;
    again.disabled = false;
  };

  again.addEventListener('click', () => void run());

  el.replaceChildren(
    h(
      'div',
      { class: 'page' },
      h(
        'header',
        { class: 'page-head' },
        h('h1', null, 'Worker status'),
        h(
          'p',
          { class: 'lede' },
          'A live, uncached request to every upstream the Worker proxies. When something fails, this is the exact response it sent back.',
        ),
      ),
      h('div', { class: 'status-head' }, summary, again),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'status-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h('th', null, 'Endpoint'),
              h('th', null, 'State'),
              h('th', { class: 'num' }, 'HTTP'),
              h('th', { class: 'num' }, 'Time'),
              h('th', null, 'Detail'),
            ),
          ),
          tbody,
        ),
      ),
      h(
        'section',
        { class: 'panel panel--flat' },
        h('header', { class: 'panel__head' }, h('h3', null, 'Worker configuration')),
        worker,
      ),
    ),
  );
  void run();
};

export default { mount };
