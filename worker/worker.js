// Art API Explorer Worker: one buffered proxy in front of every upstream API.
//
// It adds API keys, caches successful responses, and turns any upstream failure into a JSON
// diagnostic. Diagnostics never contain secrets: every URL that leaves this Worker in a
// response body goes through redactUrl().
//
// Secrets:
//   HARVARD_ARTMUSEUMS_KEY
//   UBC_OC_API_KEY
//   DATAVERSE_API_TOKEN            (optional)
// Plain vars:
//   DATAVERSE_BASE="https://dataverse.harvard.edu"
//   ALLOWED_ORIGINS="*"

const VERSION = '2026-11-12.site-and-api';

const UPSTREAMS = {
  harvardArt: 'https://api.harvardartmuseums.org',
  princetonArt: 'https://data.artmuseum.princeton.edu',
  ubcRest: 'https://oc-index.library.ubc.ca',
  ubcOai: 'https://oce-index.library.ubc.ca/oai',
  ubcIiif: 'https://iiif.library.ubc.ca',
  arxiv: 'https://export.arxiv.org',
  northwesternDC: 'https://api.dc.library.northwestern.edu',
  stanfordPurl: 'https://purl.stanford.edu',
  stanfordEmbed: 'https://embed.stanford.edu',
  hathiCatalog: 'https://catalog.hathitrust.org',
  htrc: 'https://data.htrc.illinois.edu',
  leipzigIiif: 'https://iiif.ub.uni-leipzig.de',
  bernIiif: 'https://www.e-rara.ch',
};

/** Query parameters whose values are credentials and must never be echoed back. */
const SECRET_PARAMS = /^(api[-_]?key|key|token|access[-_]?token)$/i;

/** Hosts the generic IIIF passthrough may fetch. It is not an open proxy. */
const PASSTHROUGH_HOSTS = /(^|\.)yale\.edu$/i;

const IIIF_ACCEPT = 'application/json,application/ld+json;q=0.9,*/*;q=0.1';

/** Simple prefix routes: [prefix, upstream base, Accept header]. */
const DIRECT_ROUTES = [
  ['/princeton-art', UPSTREAMS.princetonArt, 'application/json'],
  ['/ubc-iiif', UPSTREAMS.ubcIiif, 'image/*,application/json;q=0.1'],
  ['/northwestern', UPSTREAMS.northwesternDC, 'application/json'],
  ['/stanford-purl', UPSTREAMS.stanfordPurl, '*/*'],
  ['/stanford-embed', UPSTREAMS.stanfordEmbed, 'application/json'],
  ['/hathi-catalog', UPSTREAMS.hathiCatalog, 'application/json'],
  ['/htrc', UPSTREAMS.htrc, 'application/json'],
  ['/leipzig-iiif', UPSTREAMS.leipzigIiif, IIIF_ACCEPT],
  ['/bern-iiif', UPSTREAMS.bernIiif, IIIF_ACCEPT],
];

export default {
  async fetch(req, env, ctx) {
    try {
      // The site calls the API under /api on its own origin; the bare paths stay for older callers.
      const incoming = new URL(req.url);
      if (incoming.pathname === '/api' || incoming.pathname.startsWith('/api/')) {
        incoming.pathname = incoming.pathname.slice(4) || '/';
        req = new Request(incoming.toString(), req);
      } else if (
        env.ASSETS &&
        normalizePath(incoming.pathname) === '/ubc-oai' &&
        !incoming.searchParams.has('verb')
      ) {
        return env.ASSETS.fetch(req);
      }
      const url = new URL(req.url);
      const path = normalizePath(url.pathname);

      if (req.method === 'OPTIONS') return cors204(env);
      if (!['GET', 'HEAD'].includes(req.method)) return jserr(405, 'Method Not Allowed', env);

      if (path === '/' || path === '/diag') return diag(env, url);
      if (path === '/favicon.ico') return favicon(env);

      if (path.startsWith('/harvard-art/')) {
        return withCache(req, env, ctx, () => harvardArtProxy(req, env));
      }
      if (path === '/yale-iiif') {
        return withCache(req, env, ctx, () => iiifPassthrough(req, env));
      }
      if (path.startsWith('/dataverse/')) {
        return withCache(req, env, ctx, () => dataverseProxy(req, env));
      }
      if (path.startsWith('/ubc/')) {
        return withCache(req, env, ctx, () => ubcRestProxy(req, env));
      }
      if (path === '/ubc-oai') {
        return withCache(req, env, ctx, () => ubcOaiProxy(req, env));
      }
      if (path === '/arxiv/search') {
        return withCache(req, env, ctx, () => arxivProxy(req));
      }
      for (const [prefix, base, accept] of DIRECT_ROUTES) {
        if (path.startsWith(`${prefix}/`)) {
          return withCache(req, env, ctx, () => directProxy(req, base, prefix, accept));
        }
      }

      return jserr(404, 'Not Found', env);
    } catch (err) {
      return jserr(500, 'Unhandled error', env, { detail: redactText(String(err), env) });
    }
  },
};

/* ---------------- Route handlers ---------------- */

async function harvardArtProxy(req, env) {
  if (!env.HARVARD_ARTMUSEUMS_KEY) return jserr(500, 'Missing HARVARD_ARTMUSEUMS_KEY', env);
  const up = rewriteBase(new URL(req.url), UPSTREAMS.harvardArt, '/harvard-art');
  up.searchParams.set('apikey', env.HARVARD_ARTMUSEUMS_KEY);
  stripReserved(up);
  return forwardBuffered(req, env, up, { method: 'GET', accept: 'application/json' });
}

async function iiifPassthrough(req, env) {
  const target = new URL(req.url).searchParams.get('url');
  if (!target) return jserr(400, 'Missing query param: url', env);
  let up;
  try {
    up = new URL(target);
  } catch {
    return jserr(400, 'Invalid url param', env);
  }
  if (up.protocol !== 'https:') return jserr(400, 'Only https allowed', env);
  if (!PASSTHROUGH_HOSTS.test(up.hostname)) return jserr(403, 'Host not allowed', env);
  stripReserved(up);
  return forwardBuffered(req, env, up, { method: 'GET', accept: IIIF_ACCEPT });
}

async function dataverseProxy(req, env) {
  const src = new URL(req.url);
  const base = env.DATAVERSE_BASE || 'https://dataverse.harvard.edu';
  const path = src.pathname.replace(/^\/dataverse/, '');
  const up = new URL(base);
  up.pathname = joinPaths(up.pathname, path.startsWith('/api/') ? path : `/api${path}`);
  up.search = src.search;
  stripReserved(up);

  const anonymous = () =>
    forwardBuffered(req, env, up, { method: 'GET', accept: 'application/json' });
  if (!env.DATAVERSE_API_TOKEN) return anonymous();

  const withToken = await forwardBuffered(req, env, up, {
    method: 'GET',
    overrideHeaders: new Headers({
      Accept: 'application/json',
      'X-Dataverse-key': env.DATAVERSE_API_TOKEN,
    }),
    accept: 'application/json',
  });
  // Public search needs no token. If the stored one is stale, do not let it break the route.
  return withToken.status === 401 || withToken.status === 403 ? anonymous() : withToken;
}

async function ubcRestProxy(req, env) {
  if (!env.UBC_OC_API_KEY) return jserr(500, 'Missing UBC_OC_API_KEY', env);
  const up = rewriteBase(new URL(req.url), UPSTREAMS.ubcRest, '/ubc');
  const json = () => new Headers({ Accept: 'application/json' });

  // Search at /search/8.5 is a JSON POST upstream. The key goes in the query only: sending it
  // as a header as well makes UBC answer 401.
  if (/^\/search\/8\.5(?:\/)?$/i.test(up.pathname)) {
    const body = {};
    for (const k of ['q', 'index', 'size', 'from', 'sort', 'term', 'terms']) {
      if (up.searchParams.has(k)) {
        const vals = up.searchParams.getAll(k);
        body[k] = vals.length > 1 ? vals : vals[0];
      }
    }
    if (!body.size && up.searchParams.has('limit')) body.size = up.searchParams.get('limit');
    up.searchParams.delete('limit');
    up.searchParams.set('key', env.UBC_OC_API_KEY);
    stripReserved(up);
    const headers = json();
    headers.set('Content-Type', 'application/json');
    return forwardBuffered(req, env, up, {
      method: 'POST',
      body: JSON.stringify(body),
      overrideHeaders: headers,
      accept: 'application/json',
    });
  }

  // Older GET form under /search/8.5/...
  if (/^\/search\/8\.5\//i.test(up.pathname)) {
    if (up.searchParams.has('limit') && !up.searchParams.has('size')) {
      up.searchParams.set('size', up.searchParams.get('limit'));
    }
    const allowed = new Set(['q', 'size', 'from', 'index', 'sort', 'term', 'terms']);
    for (const k of [...up.searchParams.keys()]) if (!allowed.has(k)) up.searchParams.delete(k);
  }

  // Callers never supply the key; the Worker's own is always used.
  stripReserved(up);
  up.searchParams.set('key', env.UBC_OC_API_KEY);
  return forwardBuffered(req, env, up, {
    method: 'GET',
    overrideHeaders: json(),
    accept: 'application/json',
  });
}

async function ubcOaiProxy(req, env) {
  if (!env.UBC_OC_API_KEY) return jserr(500, 'Missing UBC_OC_API_KEY', env);
  const up = new URL(UPSTREAMS.ubcOai);
  up.search = new URL(req.url).search;
  stripReserved(up);
  up.searchParams.set('key', env.UBC_OC_API_KEY);
  const accept = 'application/xml,text/xml;q=0.9,*/*;q=0.1';
  return forwardBuffered(req, env, up, {
    method: 'GET',
    overrideHeaders: new Headers({ Accept: accept }),
    accept,
  });
}

async function arxivProxy(req) {
  const up = new URL(`${UPSTREAMS.arxiv}/api/query`);
  up.search = new URL(req.url).search;
  stripReserved(up);
  return forwardBuffered(req, undefined, up, {
    method: 'GET',
    accept: 'application/atom+xml,text/xml;q=0.9,*/*;q=0.1',
  });
}

async function directProxy(req, base, cutPrefix, accept) {
  const up = rewriteBase(new URL(req.url), base, cutPrefix);
  stripReserved(up);
  return forwardBuffered(req, undefined, up, { method: 'GET', accept });
}

/* ---------------- Buffered forward + safe cache ---------------- */

async function withCache(req, env, ctx, fn) {
  const src = new URL(req.url);
  const ttl = clampTtl(parseInt(src.searchParams.get('ttl') || '3600', 10));
  if (req.method === 'HEAD' || ttl === 0) return addCors(await fn(), env);

  const cache = caches.default;

  const cacheKey = new Request(req.url, { method: 'GET', headers: cacheKeyHeaders(req) });
  const cached = await cache.match(cacheKey);
  if (cached) return addCors(new Response(cached.body, cached), env);

  const fresh = await fn();
  if (fresh.ok && isCacheable(fresh)) {
    const toClient = fresh.clone();
    const toCache = fresh.clone();
    const policy = `public, max-age=${ttl}, stale-while-revalidate=${Math.round(ttl / 2)}`;
    toClient.headers.set('Cache-Control', policy);
    toCache.headers.set('Cache-Control', policy);
    ctx.waitUntil(cache.put(cacheKey, toCache));
    return addCors(toClient, env);
  }
  return addCors(fresh, env);
}

function isCacheable(res) {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (res.status >= 400) return false;
  return (
    ct.includes('application/json') ||
    ct.includes('application/ld+json') ||
    ct.includes('application/xml') ||
    ct.includes('text/xml') ||
    ct.includes('application/atom+xml') ||
    ct.includes('application/manifest+json') ||
    ct.startsWith('image/')
  );
}

/**
 * Fetch the upstream, read it fully, and re-emit it. Reading the body up front avoids
 * Cloudflare's stream-reuse errors. Failures, HTML bodies and `?debug=1` requests come back as
 * a JSON diagnostic with credentials removed.
 */
async function forwardBuffered(req, env, up, opts = {}) {
  const wantDebug = new URL(req.url).searchParams.get('debug') === '1';

  try {
    const headers = opts.overrideHeaders || new Headers();
    if (opts.accept && !headers.has('Accept')) headers.set('Accept', opts.accept);

    const res = await fetch(up.toString(), {
      method: opts.method || 'GET',
      headers,
      redirect: 'follow',
      cf: { cacheTtlByStatus: { '200-299': 0, 404: 0, '500-599': 0 } },
      body: opts.body || undefined,
    });

    const ct = res.headers.get('content-type') || '';
    const buf = await res.arrayBuffer();
    const isHtml = /\btext\/html\b/i.test(ct);

    if (res.ok && !isHtml && !wantDebug) {
      return responseFromBuffer(buf, res.status, res.statusText, res.headers);
    }

    return new Response(
      JSON.stringify(
        {
          upstream: redactUrl(up),
          status: res.status,
          statusText: res.statusText,
          contentType: ct,
          sample: redactText(sniffSample(buf, ct), env),
        },
        null,
        2,
      ),
      {
        // An HTML page with a 2xx status is still a failure for an API client.
        status: res.ok && isHtml && !wantDebug ? 502 : res.status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      },
    );
  } catch (e) {
    return jserr(502, 'Upstream fetch failed', undefined, {
      url: redactUrl(up),
      detail: redactText(String(e), env),
    });
  }
}

function responseFromBuffer(buf, status, statusText, upstreamHeaders) {
  const headers = safeResponseHeaders(upstreamHeaders);
  headers.delete('content-encoding');
  headers.delete('content-length');
  return new Response(buf, { status, statusText, headers });
}

/* ---------------- Redaction ---------------- */

/** The URL as text, with credential parameters replaced. */
export function redactUrl(url) {
  const copy = new URL(url.toString());
  for (const key of [...copy.searchParams.keys()]) {
    if (SECRET_PARAMS.test(key)) copy.searchParams.set(key, 'REDACTED');
  }
  return copy.toString();
}

/** Remove this Worker's own secret values, and any credential-looking parameter, from text. */
export function redactText(text, env) {
  let out = String(text);
  for (const name of ['HARVARD_ARTMUSEUMS_KEY', 'UBC_OC_API_KEY', 'DATAVERSE_API_TOKEN']) {
    const secret = env && env[name];
    if (secret) out = out.split(secret).join('REDACTED');
  }
  return out.replace(
    /((?:^|[^a-z0-9])(?:api[-_]?key|key|token|access[-_]?token)=)[^&\s"'<>\\]+/gi,
    '$1REDACTED',
  );
}

/* ---------------- Utilities ---------------- */

function sniffSample(buf, ct) {
  try {
    if (/json|xml|html|text/.test(ct)) return new TextDecoder().decode(buf).slice(0, 2000);
  } catch {
    // fall through to the byte count
  }
  return `(bytes ${buf.byteLength})`;
}

function normalizePath(p) {
  const noTrail = p.replace(/\/+$/g, '');
  return noTrail === '' ? '/' : noTrail;
}

function rewriteBase(srcUrl, base, cutPrefix) {
  const up = new URL(base);
  const suffix = srcUrl.pathname.replace(new RegExp('^' + escapeRegex(cutPrefix)), '');
  up.pathname = joinPaths(up.pathname, suffix);
  up.search = srcUrl.search;
  return up;
}

function joinPaths(a, b) {
  return (a.replace(/\/+$/, '') + '/' + b.replace(/^\/+/, '')).replace(/\/{2,}/g, '/');
}

function safeResponseHeaders(headers) {
  const allow = new Set([
    'content-type',
    'content-language',
    'cache-control',
    'expires',
    'etag',
    'last-modified',
    'vary',
    'content-disposition',
    'accept-ranges',
    'date',
    'link',
  ]);
  const out = new Headers();
  for (const [k, v] of headers.entries()) {
    if (allow.has(k.toLowerCase())) out.set(k, v);
  }
  return out;
}

function cacheKeyHeaders(req) {
  const h = new Headers();
  const accept = req.headers.get('Accept');
  if (accept) h.set('Accept', accept);
  return h;
}

function clampTtl(n) {
  if (!Number.isFinite(n) || n < 0) return 3600;
  return Math.min(24 * 3600, n);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parameters that steer this Worker and are never sent upstream. */
function stripReserved(url) {
  url.searchParams.delete('ttl');
  url.searchParams.delete('debug');
}

function cors204(env) {
  return addCors(new Response(null, { status: 204 }), env);
}

function addCors(res, env) {
  res.headers.set('Access-Control-Allow-Origin', ((env && env.ALLOWED_ORIGINS) || '*').trim());
  res.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, If-None-Match, If-Modified-Since');
  res.headers.set('Access-Control-Max-Age', '86400');
  return res;
}

function jserr(status, message, env, extra) {
  const res = new Response(JSON.stringify({ error: message, ...(extra || {}) }, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
  return env ? addCors(res, env) : res;
}

function diag(env, url) {
  const payload = {
    ok: true,
    now: new Date().toISOString(),
    version: VERSION,
    endpoints: [
      '/harvard-art/*',
      '/princeton-art/*',
      '/yale-iiif?url=<https url on yale.edu>',
      '/dataverse/*',
      '/ubc/*',
      '/ubc-oai?verb=Identify',
      '/ubc-iiif/*',
      '/arxiv/search',
      '/northwestern/*',
      '/stanford-purl/*',
      '/stanford-embed/*',
      '/hathi-catalog/*',
      '/htrc/*',
      '/leipzig-iiif/*',
      '/bern-iiif/*',
    ],
    keys: {
      HARVARD_ARTMUSEUMS_KEY: !!env.HARVARD_ARTMUSEUMS_KEY,
      UBC_OC_API_KEY: !!env.UBC_OC_API_KEY,
      DATAVERSE_API_TOKEN: !!env.DATAVERSE_API_TOKEN,
    },
    dataverseBase: env.DATAVERSE_BASE || 'https://dataverse.harvard.edu',
    cors: env.ALLOWED_ORIGINS || '*',
    path: url.pathname,
  };
  const res = new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
  return addCors(res, env);
}

function favicon(env) {
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5r94kAAAAASUVORK5CYII=';
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const res = new Response(bin, {
    status: 200,
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800, immutable' },
  });
  return addCors(res, env);
}
