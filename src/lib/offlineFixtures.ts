const originalFetch: typeof fetch | undefined =
  typeof fetch === 'function' ? fetch.bind(globalThis) : undefined;

type FixtureResolver = (url: URL) => string | null;

const createResolver = (match: (url: URL) => boolean, fixture: string): FixtureResolver => {
  return (url) => (match(url) ? fixture : null);
};

const withDynamicResolver = (resolver: (url: URL) => string | null): FixtureResolver => resolver;

const OFFLINE_FIXTURES: FixtureResolver[] = [
  createResolver((url) => url.pathname.startsWith('/harvard-art/object'), '/fixtures/harvard/object.json'),
  createResolver((url) => url.pathname.startsWith('/princeton-art/search'), '/fixtures/princeton/search.json'),
  withDynamicResolver((url) => {
    if (url.pathname.startsWith('/princeton-art/objects/')) {
      const segments = url.pathname.split('/');
      const id = segments[segments.length - 1];
      if (id) {
        return `/fixtures/princeton/objects/${id}.json`;
      }
    }
    return null;
  }),
  createResolver((url) => url.pathname.startsWith('/dataverse/search'), '/fixtures/dataverse/search.json'),
  createResolver((url) => url.pathname.startsWith('/ubc/collections'), '/fixtures/ubc/collections.json'),
  createResolver((url) => url.pathname.startsWith('/ubc/search/8.5'), '/fixtures/ubc/search.json'),
  createResolver((url) => url.pathname.startsWith('/ubc-oai'), '/fixtures/ubc/oai.xml'),
  createResolver((url) => url.pathname.startsWith('/diag'), '/fixtures/system/diag.json'),
  withDynamicResolver((url) => {
    if (url.hostname === 'export.arxiv.org' || url.pathname.startsWith('/arxiv/search')) {
      return '/fixtures/arxiv/feed.xml';
    }
    return null;
  }),
];

const resolveFixture = (url: URL): string | null => {
  for (const resolver of OFFLINE_FIXTURES) {
    const match = resolver(url);
    if (match) {
      return match;
    }
  }
  return null;
};

const buildFixtureUrl = (fixturePath: string, requestUrl: URL): string | null => {
  if (!fixturePath) {
    return null;
  }
  if (/^https?:/i.test(fixturePath)) {
    return fixturePath;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(fixturePath, window.location.origin).toString();
  }
  try {
    return new URL(fixturePath, `${requestUrl.protocol}//${requestUrl.host}`).toString();
  } catch {
    return null;
  }
};

const fetchFixture = async (url: URL): Promise<Response | null> => {
  if (!originalFetch) {
    return null;
  }
  const fixturePath = resolveFixture(url);
  if (!fixturePath) {
    return null;
  }
  const resolved = buildFixtureUrl(fixturePath, url);
  if (!resolved) {
    return null;
  }
  try {
    const response = await originalFetch(resolved, { cache: 'no-store' });
    return response.ok ? response : null;
  } catch {
    return null;
  }
};

export const fetchWithOfflineFallback = async (url: URL, init?: RequestInit): Promise<Response> => {
  if (!originalFetch) {
    const fallback = await fetchFixture(url);
    if (fallback) {
      return fallback;
    }
    throw new Error('Fetch API is not available in this environment.');
  }

  try {
    const response = await originalFetch(url.toString(), init);
    if (response.ok) {
      return response;
    }
    const fallback = await fetchFixture(url);
    return fallback ?? response;
  } catch (error) {
    const fallback = await fetchFixture(url);
    if (fallback) {
      return fallback;
    }
    throw error;
  }
};

export const hasOfflineFixture = (url: URL): boolean => resolveFixture(url) !== null;
