import { DVFacets, DVSearchState, NormalRecord } from '../types';

const HARVARD_BASE = 'https://dataverse.harvard.edu/api';

const getApiRoot = (): string => {
  const el = document.getElementById('app');
  const attr = el?.getAttribute('data-dataverse-api')?.trim();
  const base = attr && attr.length > 0 ? attr : '/dataverse';
  const normalized = base.endsWith('/') ? base.slice(0, -1) : base;
  return normalized.endsWith('/search') ? normalized.slice(0, -7) : normalized;
};

const resolveSearchUrl = (params: URLSearchParams): string => {
  const root = getApiRoot();
  return `${root}/search?${params.toString()}`;
};

const resolveJsonUrl = (record: any): string => {
  const sanitize = (value: string | undefined): string | undefined => {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    if (/^https?:\/\//i.test(trimmed) === false) return undefined;
    return trimmed.startsWith('http://') ? trimmed.replace(/^http:\/\//i, 'https://') : trimmed;
  };

  const apiUrl = sanitize(record.apiUrl);
  if (apiUrl) {
    return apiUrl;
  }
  const link = sanitize(record.link);
  if (link) {
    return link;
  }
  const persistentId: string | undefined = record.persistentId || record.global_id;
  if (persistentId) {
    const encoded = encodeURIComponent(persistentId.replace(/^doi:/i, 'doi:'));
    return `${HARVARD_BASE}/datasets/:persistentId/?persistentId=${encoded}`;
  }
  if (typeof record.entity_id === 'number' || typeof record.entity_id === 'string') {
    const id = String(record.entity_id);
    return `${HARVARD_BASE}/datasets/${id}`;
  }
  if (typeof record.identifier === 'string') {
    return `${HARVARD_BASE}/datasets/${encodeURIComponent(record.identifier)}`;
  }
  return sanitize(record.url) ?? '';
};

const sanitizeThumbnail = (input: string | undefined): string | undefined => {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (trimmed.length === 0) return undefined;
  if (/^https?:\/\//i.test(trimmed) === false) return undefined;
  if (trimmed.startsWith('http://')) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }
  return trimmed;
};

const icon = (kind: 'image' | 'pdf' | 'table' | 'file' | 'dataset'): string => {
  return `/assets/dataverse/${kind}.svg`;
};

const mapItem = (record: any): NormalRecord => {
  const type = typeof record.type === 'string' ? record.type.toLowerCase() : 'dataset';
  const kind: NormalRecord['kind'] = (['dataset', 'file', 'dataverse'] as const).includes(type as NormalRecord['kind'])
    ? (type as NormalRecord['kind'])
    : 'dataset';
  const id =
    (typeof record.global_id === 'string' && record.global_id.length > 0 && record.global_id) ||
    (record.entity_id !== undefined ? String(record.entity_id) : undefined) ||
    (typeof record.identifier === 'string' ? record.identifier : undefined) ||
    (typeof record.name === 'string' ? record.name : `dataverse-${Math.random().toString(36).slice(2)}`);

  const title =
    (typeof record.name === 'string' && record.name.length > 0 && record.name) ||
    (typeof record.title === 'string' && record.title.length > 0 && record.title) ||
    '(untitled)';

  const collectAuthors = (): string[] | undefined => {
    const pools = [record.authors, record.creator, record.author];
    for (const candidate of pools) {
      if (Array.isArray(candidate)) {
        const values = candidate.filter((value) => typeof value === 'string');
        if (values.length > 0) return values;
      }
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return [candidate];
      }
    }
    return undefined;
  };
  const authors = collectAuthors();

  const sanitizeProviderUrl = (value: string | undefined): string | undefined => {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    if (/^https?:\/\//i.test(trimmed) === false) return undefined;
    return trimmed.startsWith('http://') ? trimmed.replace(/^http:\/\//i, 'https://') : trimmed;
  };

  const providerUrl =
    sanitizeProviderUrl(record.url) ||
    sanitizeProviderUrl(record.html_url) ||
    sanitizeProviderUrl(record.citationHtml) ||
    'https://dataverse.harvard.edu/';

  const subjectsSource = record.subjects ?? record.subject ?? record.subject_ss;
  const subjects = Array.isArray(subjectsSource)
    ? subjectsSource.filter((value) => typeof value === 'string')
    : typeof subjectsSource === 'string'
      ? [subjectsSource]
      : undefined;

  const dataverseName =
    (typeof record.identifier_of_dataverse === 'string' && record.identifier_of_dataverse) ||
    (typeof record.identifierOfDataverse === 'string' && record.identifierOfDataverse) ||
    (typeof record.identifierOfDV === 'string' && record.identifierOfDV) ||
    (typeof record.dataverse_alias === 'string' && record.dataverse_alias) ||
    undefined;

  const doi =
    (typeof record.global_id === 'string' && record.global_id) ||
    (typeof record.persistentId === 'string' && record.persistentId) ||
    undefined;

  const published =
    (typeof record.published_at === 'string' && record.published_at) ||
    (typeof record.publicationDate === 'string' && record.publicationDate) ||
    (typeof record.date === 'string' && record.date) ||
    (typeof record.year === 'number' ? String(record.year) : undefined);

  const rawFileType =
    (typeof record.file_type_group === 'string' && record.file_type_group) ||
    (typeof record.file_type === 'string' && record.file_type) ||
    undefined;

  const thumb =
    sanitizeThumbnail(record.thumbnail || record.img) ||
    (kind === 'file'
      ? (() => {
          const fileType = (rawFileType ?? '').toLowerCase();
          if (fileType.includes('image')) return icon('image');
          if (fileType.includes('pdf')) return icon('pdf');
          if (fileType.includes('tabular') || fileType.includes('spreadsheet')) return icon('table');
          return icon('file');
        })()
      : icon('dataset'));

  const descriptionSource =
    (typeof record.description === 'string' && record.description) ||
    (typeof record.dsDescriptionValue === 'string' && record.dsDescriptionValue) ||
    undefined;
  const description = descriptionSource ? descriptionSource.toString().trim() || undefined : undefined;

  return {
    id,
    kind,
    title,
    authors,
    published,
    subjects,
    dataverseName,
    doi,
    providerUrl,
    jsonUrl: resolveJsonUrl(record),
    thumbnail: thumb,
    description,
    fileTypeGroup: rawFileType,
  };
};

const normalizeFacets = (facets: any): DVFacets => {
  const output: DVFacets = {};
  if (!Array.isArray(facets)) return output;
  for (const facet of facets) {
    const name: string = typeof facet.name === 'string' ? facet.name : typeof facet.field === 'string' ? facet.field : 'facet';
    const buckets: any[] = Array.isArray(facet.buckets) ? facet.buckets : [];
    if (!output[name]) output[name] = {};
    for (const bucket of buckets) {
      const key =
        (typeof bucket.value === 'string' && bucket.value.length > 0 && bucket.value) ||
        (typeof bucket.name === 'string' && bucket.name) ||
        (bucket.key !== undefined ? String(bucket.key) : undefined);
      if (!key) continue;
      const count =
        typeof bucket.count === 'number'
          ? bucket.count
          : typeof bucket.value_count === 'number'
            ? bucket.value_count
            : 0;
      output[name][key] = count;
    }
  }
  return output;
};

export async function searchDataverse(
  state: DVSearchState,
  signal?: AbortSignal
): Promise<{ items: NormalRecord[]; total: number; facets: DVFacets; nextPage?: number }> {
  const page = Math.max(1, state.page ?? 1);
  const size = Math.min(100, Math.max(10, state.size ?? 30));

  const params = new URLSearchParams();
  params.set('q', state.q && state.q.length > 0 ? state.q : '*');

  const types = (state.type?.length ? state.type : ['dataset']).join(',');
  params.set('type', types);

  params.set('start', String((page - 1) * size));
  params.set('per_page', String(size));

  if (state.sort) params.set('sort', state.sort);
  if (state.order) params.set('order', state.order);

  for (const subject of state.subject ?? []) {
    params.append('fq', `subject:"${subject}"`);
  }
  for (const dv of state.dataverse ?? []) {
    params.append('fq', `dvName:"${dv}"`);
  }
  for (const fileType of state.fileType ?? []) {
    params.append('fq', `fileTypeGroupFacet:"${fileType}"`);
  }
  if (state.yearStart || state.yearEnd) {
    const start = state.yearStart ?? 0;
    const end = state.yearEnd ?? 9999;
    params.append(
      'fq',
      `publicationDate:[${String(start).padStart(4, '0')}-01-01T00:00:00Z TO ${String(end).padStart(4, '0')}-12-31T23:59:59Z]`
    );
  }

  params.set('show_facets', 'true');
  params.set('show_relevance', 'false');

  const url = resolveSearchUrl(params);
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Dataverse request failed (${response.status})`);
  }

  const json = await response.json();
  const hits = Array.isArray(json?.data?.items) ? json.data.items : [];
  const items = hits.map((record: unknown) => mapItem(record));
  const total: number = typeof json?.data?.total_count === 'number' ? json.data.total_count : items.length;
  const nextPage = page * size < total ? page + 1 : undefined;
  const facets = normalizeFacets(json?.data?.facets);

  return { items, total, facets, nextPage };
}
