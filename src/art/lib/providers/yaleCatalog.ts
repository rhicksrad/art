import { fetchWithOfflineFallback } from '../../../lib/offlineFixtures';

const CATALOG_ENDPOINT = 'https://collections.library.yale.edu/catalog.json';

const decodeHtml = (() => {
  if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
    const parser = new DOMParser();
    return (value: string): string => {
      const doc = parser.parseFromString(`<body>${value}</body>`, 'text/html');
      return doc.body.textContent ?? value;
    };
  }
  return (value: string): string =>
    value
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
})();

const stripHTML = (value: string): string => {
  if (!value) return '';
  const withoutTags = value.replace(/<[^>]*>/g, ' ');
  return decodeHtml(withoutTags).replace(/\s+/g, ' ').trim();
};

const normalizeValue = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.value === 'string') {
      const normalized = record.value.trim();
      return normalized.length ? normalized : undefined;
    }
    const attributes = record.attributes;
    if (attributes && typeof attributes === 'object') {
      const attrRecord = attributes as Record<string, unknown>;
      if (typeof attrRecord.value === 'string') {
        const normalized = attrRecord.value.trim();
        return normalized.length ? normalized : undefined;
      }
    }
  }
  return undefined;
};

const normalizeList = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    const result: string[] = [];
    for (const entry of value) {
      const normalized = normalizeValue(entry);
      if (normalized) {
        result.push(normalized);
      }
    }
    return result;
  }
  const single = normalizeValue(value);
  return single ? [single] : [];
};

export type FacetOption = {
  value: string;
  label: string;
  count: number;
};

export type YaleCatalogItem = {
  id: string;
  title: string;
  manifest: string;
  landingPage: string;
  repository?: string;
  resourceTypes: string[];
  creator?: string;
  date?: string;
  description?: string;
  subjects: string[];
  publishers: string[];
  callNumbers: string[];
  containers: string[];
  imageCount?: number;
  raw: Record<string, unknown>;
};

export type YaleCatalogFacets = Record<string, FacetOption[]>;

export type YaleCatalogSearchResponse = {
  items: YaleCatalogItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  facets: YaleCatalogFacets;
};

export type YaleCatalogSearchParams = {
  q?: string;
  formats?: string[];
  repositories?: string[];
  page?: number;
};

const buildCatalogUrl = (params: YaleCatalogSearchParams): string => {
  const url = new URL(CATALOG_ENDPOINT);
  if (params.q && params.q.trim()) {
    url.searchParams.set('q', params.q.trim());
  }
  (params.formats ?? []).forEach((format) => {
    const trimmed = format.trim();
    if (trimmed) {
      url.searchParams.append('f[format][]', trimmed);
    }
  });
  (params.repositories ?? []).forEach((repository) => {
    const trimmed = repository.trim();
    if (trimmed) {
      url.searchParams.append('f[repository_ssi][]', trimmed);
    }
  });
  if (params.page && params.page > 1) {
    url.searchParams.set('page', String(params.page));
  }
  return url.toString();
};

const isFacet = (value: unknown): value is { id: string; attributes?: { items?: Array<{ attributes?: { label?: string; value?: string; hits?: number } }> } } => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && record.id.length > 0 && record.type === 'facet';
};

const parseFacets = (included: unknown): YaleCatalogFacets => {
  if (!Array.isArray(included)) {
    return {};
  }
  const result: YaleCatalogFacets = {};
  for (const entry of included) {
    if (!isFacet(entry)) continue;
    const items = entry.attributes?.items;
    if (!Array.isArray(items)) continue;
    const parsed: FacetOption[] = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const attributes = (item as Record<string, unknown>).attributes;
      if (!attributes || typeof attributes !== 'object') continue;
      const attrRecord = attributes as Record<string, unknown>;
      const value = normalizeValue(attrRecord.value);
      const label = normalizeValue(attrRecord.label) ?? value;
      const hitsRaw = attrRecord.hits;
      const count = typeof hitsRaw === 'number' ? hitsRaw : Number.parseInt(normalizeValue(hitsRaw) ?? '0', 10);
      if (!value || !label) continue;
      parsed.push({
        value,
        label,
        count: Number.isFinite(count) ? count : 0,
      });
    }
    if (parsed.length) {
      result[entry.id] = parsed;
    }
  }
  return result;
};

const buildRepositoryFacetFallback = (items: YaleCatalogItem[]): FacetOption[] => {
  const counts = new Map<string, number>();
  for (const item of items) {
    const repository = item.repository?.trim();
    if (!repository) continue;
    counts.set(repository, (counts.get(repository) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count);
};

let repositoryFacetWarningLogged = false;

const parseItem = (raw: unknown): YaleCatalogItem | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : undefined;
  const attributes = record.attributes;
  if (!id || !attributes || typeof attributes !== 'object') {
    return null;
  }
  const attr = attributes as Record<string, unknown>;
  const title = typeof attr.title === 'string' ? attr.title.trim() : undefined;
  if (!title) {
    return null;
  }
  const manifest = `https://collections.library.yale.edu/manifests/${id}`;
  const landingPage = `https://collections.library.yale.edu/catalog/${id}`;

  const descriptionParts = normalizeList(attr.description_tesim).map(stripHTML);
  const subjects = normalizeList(attr.subjectTopic_tesim).map(stripHTML);
  const repositoryTrail = normalizeValue(attr.ancestorTitles_tesim);
  const repository = repositoryTrail ? stripHTML(repositoryTrail).split('>')[0]?.trim() || undefined : undefined;
  const resourceTypes = normalizeList(attr.resourceType_tesim).map(stripHTML);
  const creators = normalizeList(attr.creator_tesim).map(stripHTML);
  const dates = normalizeList(attr.date_ssim).map(stripHTML);
  const publishers = normalizeList(attr.publisher_tesim).map(stripHTML);
  const callNumbers = normalizeList(attr.callNumber_tesim).map(stripHTML);
  const containers = normalizeList(attr.containerGrouping_tesim).map(stripHTML);
  const imageCountRaw = normalizeValue(attr.imageCount_isi);
  const imageCount = imageCountRaw ? Number.parseInt(stripHTML(imageCountRaw), 10) : undefined;

  return {
    id,
    title,
    manifest,
    landingPage,
    repository,
    resourceTypes,
    creator: creators.length ? creators.join('; ') : undefined,
    date: dates.length ? dates.join('; ') : undefined,
    description: descriptionParts.length ? descriptionParts.join(' ') : undefined,
    subjects,
    publishers,
    callNumbers,
    containers,
    imageCount: Number.isFinite(imageCount) ? imageCount : undefined,
    raw: record,
  };
};

const parseResponse = (data: unknown): YaleCatalogSearchResponse => {
  if (!data || typeof data !== 'object') {
    throw new Error('Unexpected response from Yale catalog.');
  }
  const record = data as Record<string, unknown>;
  const itemsRaw = Array.isArray(record.data) ? record.data : [];
  const items: YaleCatalogItem[] = [];
  for (const entry of itemsRaw) {
    const parsed = parseItem(entry);
    if (parsed) {
      items.push(parsed);
    }
  }
  const meta = (record.meta as Record<string, unknown>) ?? {};
  const pages = (meta.pages as Record<string, unknown>) ?? {};
  const total = typeof pages.total_count === 'number' ? pages.total_count : Number.parseInt(String(pages.total_count ?? 0), 10);
  const page = typeof pages.current_page === 'number' ? pages.current_page : Number.parseInt(String(pages.current_page ?? 1), 10);
  const totalPages = typeof pages.total_pages === 'number' ? pages.total_pages : Number.parseInt(String(pages.total_pages ?? 1), 10);
  const perPage = typeof pages.limit_value === 'number' ? pages.limit_value : Number.parseInt(String(pages.limit_value ?? 10), 10);
  const facets = parseFacets(record.included);

  if (!facets['repository_ssi'] || facets['repository_ssi'].length === 0) {
    const fallback = buildRepositoryFacetFallback(items);
    if (fallback.length) {
      facets['repository_ssi'] = fallback;
      if (!repositoryFacetWarningLogged && typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('Yale catalog response omitted repository facets; generated fallback from manifest records.');
        repositoryFacetWarningLogged = true;
      }
    }
  }

  return {
    items,
    total: Number.isFinite(total) ? total : items.length,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    perPage: Number.isFinite(perPage) && perPage > 0 ? perPage : items.length,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
    facets,
  };
};

declare global {
  interface Window {
    __ART_WORKER_BASE__?: string;
  }
}

const DEFAULT_WORKER_ORIGIN = 'https://art.hicksrch.workers.dev';

const resolveWorkerOrigin = (): string => {
  if (typeof window === 'undefined') {
    throw new Error('Yale catalog proxy requires a browser environment.');
  }

  const override = window.__ART_WORKER_BASE__;
  if (override) {
    try {
      return new URL(override).origin;
    } catch {
      console.warn('Invalid __ART_WORKER_BASE__ override; falling back to detected origin.');
    }
  }

  try {
    const current = new URL(window.location.origin);
    if (
      current.hostname === 'localhost' ||
      current.hostname === '127.0.0.1' ||
      current.hostname.endsWith('.workers.dev')
    ) {
      return current.origin;
    }
  } catch {
    // ignore and fall back to default worker origin
  }

  return DEFAULT_WORKER_ORIGIN;
};

const buildProxyUrl = (url: string): string => {
  const proxy = new URL('/yale-iiif', resolveWorkerOrigin());
  proxy.searchParams.set('url', url);
  proxy.searchParams.set('ttl', '3600');
  return proxy.toString();
};

const isDiagnosticResponse = (value: unknown): value is { status?: number; upstream?: string; sample?: string } => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return ('status' in record && typeof record.status === 'number') || ('sample' in record && typeof record.sample === 'string');
};

export async function searchYaleCatalog(
  params: YaleCatalogSearchParams,
  signal?: AbortSignal,
): Promise<YaleCatalogSearchResponse> {
  const upstreamUrl = buildCatalogUrl(params);
  const proxyUrl = new URL(buildProxyUrl(upstreamUrl));
  const response = await fetchWithOfflineFallback(proxyUrl, {
    signal,
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Yale catalog request failed (${response.status}). ${text.slice(0, 140)}`.trim());
  }

  const data = await response.json().catch(() => {
    throw new Error('Yale catalog response was not valid JSON.');
  });

  if (isDiagnosticResponse(data) && !('data' in (data as Record<string, unknown>))) {
    const status = (data as Record<string, unknown>).status;
    const upstream = (data as Record<string, unknown>).upstream;
    const sample = (data as Record<string, unknown>).sample;
    const message = [`Upstream request failed${status ? ` (${status})` : ''}.`, sample ? String(sample) : '', upstream ? `URL: ${upstream}` : '']
      .filter(Boolean)
      .join(' ');
    throw new Error(message || 'The Yale catalog proxy returned an error.');
  }

  return parseResponse(data);
}

