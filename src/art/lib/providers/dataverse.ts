import { WORKER_BASE } from '../../../lib/config';
import type { DVFacets, DVSearchState, NormalRecord } from './types';

const DEFAULT_API_ROOT = new URL('/dataverse/api', WORKER_BASE).toString().replace(/\/$/, '');
const DEFAULT_SITE_ROOT = 'https://dataverse.harvard.edu';

const readAttr = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const root = document.getElementById('app') ?? document.body ?? document.documentElement;
  return root?.getAttribute(name) ?? document.body?.getAttribute(name) ?? document.documentElement.getAttribute(name);
};

let memoizedApiRoot: string | null = null;
let memoizedSiteRoot: string | null = null;

const resolveApiRoot = (): string => {
  if (memoizedApiRoot) return memoizedApiRoot;
  const attr = readAttr('data-dataverse-api-root');
  if (attr && attr.trim()) {
    memoizedApiRoot = attr.trim().replace(/\/$/, '');
    return memoizedApiRoot;
  }
  memoizedApiRoot = DEFAULT_API_ROOT;
  return memoizedApiRoot;
};

const resolveSiteRoot = (): string => {
  if (memoizedSiteRoot) return memoizedSiteRoot;
  const attr = readAttr('data-dataverse-site-root');
  if (attr && attr.trim()) {
    memoizedSiteRoot = attr.trim().replace(/\/$/, '');
    return memoizedSiteRoot;
  }
  memoizedSiteRoot = DEFAULT_SITE_ROOT;
  return memoizedSiteRoot;
};

const ensureHttps = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('http://')) {
    return `https://${trimmed.slice('http://'.length)}`;
  }
  return trimmed;
};

const toArray = (value: unknown): string[] | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry ?? '')))
      .filter((entry) => entry.length > 0);
    return normalized.length ? normalized : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : undefined;
  }
  return undefined;
};

const extractYear = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return String(parsed.getUTCFullYear());
  }
  const match = value.match(/\d{4}/);
  return match ? match[0] : undefined;
};

const mapFacetKey = (rawKey: string): string => {
  switch (rawKey) {
    case 'subject_ss':
      return 'subject';
    case 'publicationDate':
      return 'publicationDate';
    case 'fileTypeGroupFacet':
    case 'file_type_group':
      return 'fileTypeGroupFacet';
    case 'dvName':
    case 'name_of_dataverse':
    case 'identifier_of_dataverse':
    case 'dataverse':
      return 'dataverse';
    default:
      return rawKey;
  }
};

const extractBuckets = (payload: any): { value: string; count: number }[] => {
  if (!payload) return [];
  if (Array.isArray(payload.buckets)) {
    const buckets: { value: string; count: number }[] = [];
    for (const bucket of payload.buckets) {
      const rawValue = bucket?.value ?? bucket?.key ?? bucket?.name;
      const count = Number(bucket?.count ?? bucket?.value_count ?? 0);
      if (!rawValue) continue;
      buckets.push({ value: String(rawValue), count: Number.isFinite(count) ? count : 0 });
    }
    return buckets;
  }
  if (Array.isArray(payload.labels)) {
    const buckets: { value: string; count: number }[] = [];
    for (const entry of payload.labels) {
      if (typeof entry !== 'object' || entry === null) continue;
      for (const [label, count] of Object.entries(entry)) {
        buckets.push({ value: String(label), count: Number(count) || 0 });
      }
    }
    return buckets;
  }
  if (typeof payload === 'object' && payload !== null) {
    const buckets: { value: string; count: number }[] = [];
    for (const [label, count] of Object.entries(payload)) {
      if (typeof count === 'number') {
        buckets.push({ value: String(label), count });
      }
    }
    return buckets;
  }
  return [];
};

const addFacetCount = (facets: DVFacets, key: string, rawValue: unknown, amount = 1): void => {
  if (!rawValue && rawValue !== 0) return;
  const value = String(rawValue).trim();
  if (!value) return;
  const bucket = (facets[key] ??= {});
  bucket[value] = (bucket[value] ?? 0) + amount;
};

const buildDatasetJsonUrl = (apiRoot: string, record: any): string => {
  const base = apiRoot.replace(/\/$/, '');
  if (record?.global_id) {
    return `${base}/datasets/:persistentId/?persistentId=${encodeURIComponent(String(record.global_id))}`;
  }
  if (record?.dataset_persistent_id) {
    return `${base}/datasets/:persistentId/?persistentId=${encodeURIComponent(String(record.dataset_persistent_id))}`;
  }
  if (record?.dataset_id || record?.id) {
    const id = record.dataset_id ?? record.id;
    return `${base}/datasets/${encodeURIComponent(String(id))}`;
  }
  return `${base}/search?q=${encodeURIComponent(String(record?.name ?? ''))}`;
};

const buildFileJsonUrl = (apiRoot: string, record: any): string => {
  const base = apiRoot.replace(/\/$/, '');
  if (record?.file_id) {
    return `${base}/files/${encodeURIComponent(String(record.file_id))}`;
  }
  if (record?.file_persistent_id) {
    return `${base}/files/:persistentId/?persistentId=${encodeURIComponent(String(record.file_persistent_id))}`;
  }
  return `${base}/search?q=${encodeURIComponent(String(record?.name ?? ''))}`;
};

const buildDataverseJsonUrl = (apiRoot: string, record: any): string => {
  const base = apiRoot.replace(/\/$/, '');
  const alias = record?.identifier ?? record?.alias ?? record?.dataverse_alias ?? record?.name;
  if (alias) {
    return `${base}/dataverses/${encodeURIComponent(String(alias))}`;
  }
  return `${base}/search?q=${encodeURIComponent(String(record?.name ?? ''))}&type=dataverse`;
};

const buildDatasetUrl = (siteRoot: string, record: any): string => {
  if (record?.url) return String(record.url);
  if (record?.global_id) {
    return `${siteRoot.replace(/\/$/, '')}/dataset.xhtml?persistentId=${encodeURIComponent(String(record.global_id))}`;
  }
  if (record?.dataset_persistent_id) {
    return `${siteRoot.replace(/\/$/, '')}/dataset.xhtml?persistentId=${encodeURIComponent(String(record.dataset_persistent_id))}`;
  }
  return siteRoot;
};

const buildFileUrl = (siteRoot: string, record: any): string => {
  if (record?.file_persistent_id) {
    return `${siteRoot.replace(/\/$/, '')}/file.xhtml?persistentId=${encodeURIComponent(String(record.file_persistent_id))}`;
  }
  if (record?.file_id) {
    return `${siteRoot.replace(/\/$/, '')}/file.xhtml?fileId=${encodeURIComponent(String(record.file_id))}`;
  }
  if (record?.url) return String(record.url);
  return siteRoot;
};

const buildDataverseUrl = (siteRoot: string, record: any): string => {
  if (record?.url) return String(record.url);
  const alias = record?.identifier ?? record?.alias ?? record?.dataverse_alias ?? record?.name;
  if (alias) {
    return `${siteRoot.replace(/\/$/, '')}/dataverse/${encodeURIComponent(String(alias))}`;
  }
  return siteRoot;
};

const normalizeDescription = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.trim() || undefined;
  if (Array.isArray(value)) {
    const joined = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean)
      .join(' ');
    return joined || undefined;
  }
  return undefined;
};

const mapItem = (record: any, apiRoot: string, siteRoot: string): NormalRecord => {
  const kind = (String(record?.type ?? '').toLowerCase() as NormalRecord['kind']) || 'dataset';
  const normalizedKind: NormalRecord['kind'] = kind === 'file' || kind === 'dataverse' ? kind : 'dataset';
  const title = record?.name || record?.title || '(untitled)';
  const id =
    record?.global_id ||
    record?.persistentId ||
    record?.file_persistent_id ||
    record?.identifier ||
    record?.file_id ||
    record?.dataset_id ||
    record?.name ||
    `${normalizedKind}-${Math.random().toString(36).slice(2)}`;

  const authors = toArray(record?.authors ?? record?.author ?? record?.creator);
  const subjects = toArray(record?.subjects ?? record?.subject);
  const dataverseName =
    record?.name_of_dataverse ??
    record?.identifier_of_dataverse ??
    record?.dataverse_name ??
    record?.parentDataverseName ??
    record?.affiliation;
  const doi =
    record?.global_id ??
    record?.persistentId ??
    record?.file_persistent_id ??
    record?.dataset_persistent_id ??
    record?.citationIdentifier;
  const published =
    record?.published_at ??
    record?.publicationDate ??
    record?.releaseOrCreateDate ??
    record?.createdAt ??
    record?.updatedAt ??
    record?.publicationdate;
  const thumbnail = ensureHttps(record?.thumbnail ?? record?.img ?? record?.logo_url);
  const description = normalizeDescription(record?.description ?? record?.dsDescriptionValue ?? record?.citation);
  const fileTypeLabel = record?.file_type_group ?? record?.fileTypeGroupFacet ?? record?.file_type ?? record?.file_content_type;

  let providerUrl: string;
  let jsonUrl: string;
  if (normalizedKind === 'file') {
    providerUrl = buildFileUrl(siteRoot, record);
    jsonUrl = buildFileJsonUrl(apiRoot, record);
  } else if (normalizedKind === 'dataverse') {
    providerUrl = buildDataverseUrl(siteRoot, record);
    jsonUrl = buildDataverseJsonUrl(apiRoot, record);
  } else {
    providerUrl = buildDatasetUrl(siteRoot, record);
    jsonUrl = buildDatasetJsonUrl(apiRoot, record);
  }

  const normalized: NormalRecord = {
    id: String(id),
    kind: normalizedKind,
    title: String(title),
    authors,
    published: published ? String(published) : undefined,
    subjects,
    dataverseName: dataverseName ? String(dataverseName) : undefined,
    doi: doi ? String(doi) : undefined,
    providerUrl,
    jsonUrl,
    thumbnail,
    description,
  };

  if (fileTypeLabel) {
    normalized.fileTypeLabel = Array.isArray(fileTypeLabel)
      ? String(fileTypeLabel[0])
      : String(fileTypeLabel);
  }

  return normalized;
};

const normalizeFacets = (rawFacets: any, hits: any[], items: NormalRecord[]): DVFacets => {
  const facets: DVFacets = {};

  if (Array.isArray(rawFacets)) {
    for (const entry of rawFacets) {
      if (typeof entry !== 'object' || entry === null) continue;
      for (const [key, payload] of Object.entries(entry)) {
        const normalizedKey = mapFacetKey(key);
        for (const bucket of extractBuckets(payload)) {
          addFacetCount(facets, normalizedKey, bucket.value, bucket.count);
        }
      }
    }
  }

  for (const item of items) {
    addFacetCount(facets, 'type', item.kind, 1);
    if (item.subjects) {
      for (const subject of item.subjects) {
        addFacetCount(facets, 'subject', subject, 1);
      }
    }
    if (item.dataverseName) {
      addFacetCount(facets, 'dataverse', item.dataverseName, 1);
    }
    const year = extractYear(item.published);
    if (year) addFacetCount(facets, 'publicationDate', year, 1);
    if (item.kind === 'file' && item.fileTypeLabel) {
      addFacetCount(facets, 'fileTypeGroupFacet', item.fileTypeLabel, 1);
    }
  }

  for (const hit of hits) {
    const year = extractYear(hit?.publicationDate ?? hit?.published_at ?? hit?.releaseOrCreateDate);
    if (year) addFacetCount(facets, 'publicationDate', year, 1);
    const dvName =
      hit?.name_of_dataverse ?? hit?.identifier_of_dataverse ?? hit?.dataverse_name ?? hit?.parentDataverseName;
    if (dvName) addFacetCount(facets, 'dataverse', dvName, 1);
    const typeGroup = hit?.file_type_group ?? hit?.fileTypeGroupFacet ?? hit?.file_type;
    if (typeGroup) addFacetCount(facets, 'fileTypeGroupFacet', typeGroup, 1);
  }

  return facets;
};

const escapeFacetValue = (value: string): string => {
  return value.replace(/"/g, '\\"');
};

export async function searchDataverse(
  state: DVSearchState,
  signal?: AbortSignal,
): Promise<{ items: NormalRecord[]; total: number; facets: DVFacets; nextPage?: number }> {
  const apiRoot = resolveApiRoot();
  const siteRoot = resolveSiteRoot();
  const page = Math.max(1, state.page ?? 1);
  const size = Math.min(100, Math.max(10, state.size ?? 30));

  const params = new URLSearchParams();
  params.set('q', state.q && state.q.trim() ? state.q.trim() : '*');

  const typeSet = new Set(state.type && state.type.length ? state.type : ['dataset']);
  params.set('type', Array.from(typeSet).join(','));

  params.set('start', String((page - 1) * size));
  params.set('per_page', String(size));

  if (state.sort) params.set('sort', state.sort);
  if (state.order) params.set('order', state.order);

  for (const subject of state.subject ?? []) {
    params.append('fq', `subject:"${escapeFacetValue(subject)}"`);
  }
  for (const dv of state.dataverse ?? []) {
    params.append('fq', `dvName:"${escapeFacetValue(dv)}"`);
  }
  for (const fileType of state.fileType ?? []) {
    params.append('fq', `fileTypeGroupFacet:"${escapeFacetValue(fileType)}"`);
  }
  if (state.yearStart || state.yearEnd) {
    const startYear = Math.max(0, state.yearStart ?? 0);
    const endYear = Math.max(startYear, state.yearEnd ?? startYear);
    const range = `publicationDate:[${String(startYear).padStart(4, '0')}-01-01T00:00:00Z TO ${String(endYear).padStart(4, '0')}-12-31T23:59:59Z]`;
    params.append('fq', range);
  }

  params.set('show_facets', 'true');
  params.set('show_relevance', 'false');

  const url = `${apiRoot}/search?${params.toString()}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Dataverse ${response.status}`);
  }
  const json = await response.json();

  const hits: any[] = Array.isArray(json?.data?.items) ? json.data.items : [];
  const items = hits.map((record) => mapItem(record, apiRoot, siteRoot));

  const total = Number(json?.data?.total_count ?? items.length);
  const nextPage = page * size < total ? page + 1 : undefined;
  const facets = normalizeFacets(json?.data?.facets, hits, items);

  return { items, total, facets, nextPage };
}
