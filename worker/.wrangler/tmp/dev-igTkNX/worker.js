var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "2026-11-12.site-and-api";
var UPSTREAMS = {
  harvardArt: "https://api.harvardartmuseums.org",
  princetonArt: "https://data.artmuseum.princeton.edu",
  ubcRest: "https://oc-index.library.ubc.ca",
  ubcOai: "https://oce-index.library.ubc.ca/oai",
  ubcIiif: "https://iiif.library.ubc.ca",
  arxiv: "https://export.arxiv.org",
  northwesternDC: "https://api.dc.library.northwestern.edu",
  stanfordPurl: "https://purl.stanford.edu",
  stanfordEmbed: "https://embed.stanford.edu",
  hathiCatalog: "https://catalog.hathitrust.org",
  htrc: "https://analytics.hathitrust.org",
  leipzigIiif: "https://iiif.ub.uni-leipzig.de",
  bernIiif: "https://iiif.ub.unibe.ch"
};
var SECRET_PARAMS = /^(api[-_]?key|key|token|access[-_]?token)$/i;
var PASSTHROUGH_HOSTS = /(^|\.)yale\.edu$/i;
var IIIF_ACCEPT = "application/json,application/ld+json;q=0.9,*/*;q=0.1";
var DIRECT_ROUTES = [
  ["/princeton-art", UPSTREAMS.princetonArt, "application/json"],
  ["/ubc-iiif", UPSTREAMS.ubcIiif, "image/*,application/json;q=0.1"],
  ["/northwestern", UPSTREAMS.northwesternDC, "application/json"],
  ["/stanford-purl", UPSTREAMS.stanfordPurl, "*/*"],
  ["/stanford-embed", UPSTREAMS.stanfordEmbed, "application/json"],
  ["/hathi-catalog", UPSTREAMS.hathiCatalog, "application/json"],
  ["/htrc", UPSTREAMS.htrc, "application/json"],
  ["/leipzig-iiif", UPSTREAMS.leipzigIiif, IIIF_ACCEPT],
  ["/bern-iiif", UPSTREAMS.bernIiif, IIIF_ACCEPT]
];
var worker_default = {
  async fetch(req, env, ctx) {
    try {
      const incoming = new URL(req.url);
      if (incoming.pathname === "/api" || incoming.pathname.startsWith("/api/")) {
        incoming.pathname = incoming.pathname.slice(4) || "/";
        req = new Request(incoming.toString(), req);
      } else if (env.ASSETS && normalizePath(incoming.pathname) === "/ubc-oai" && !incoming.searchParams.has("verb")) {
        return env.ASSETS.fetch(req);
      }
      const url = new URL(req.url);
      const path = normalizePath(url.pathname);
      if (req.method === "OPTIONS") return cors204(env);
      if (!["GET", "HEAD"].includes(req.method)) return jserr(405, "Method Not Allowed", env);
      if (path === "/" || path === "/diag") return diag(env, url);
      if (path === "/favicon.ico") return favicon(env);
      if (path.startsWith("/harvard-art/")) {
        return withCache(req, env, ctx, () => harvardArtProxy(req, env));
      }
      if (path === "/yale-iiif") {
        return withCache(req, env, ctx, () => iiifPassthrough(req, env));
      }
      if (path.startsWith("/dataverse/")) {
        return withCache(req, env, ctx, () => dataverseProxy(req, env));
      }
      if (path.startsWith("/ubc/")) {
        return withCache(req, env, ctx, () => ubcRestProxy(req, env));
      }
      if (path === "/ubc-oai") {
        return withCache(req, env, ctx, () => ubcOaiProxy(req, env));
      }
      if (path === "/arxiv/search") {
        return withCache(req, env, ctx, () => arxivProxy(req));
      }
      for (const [prefix, base, accept] of DIRECT_ROUTES) {
        if (path.startsWith(`${prefix}/`)) {
          return withCache(req, env, ctx, () => directProxy(req, base, prefix, accept));
        }
      }
      return jserr(404, "Not Found", env);
    } catch (err) {
      return jserr(500, "Unhandled error", env, { detail: redactText(String(err), env) });
    }
  }
};
async function harvardArtProxy(req, env) {
  if (!env.HARVARD_ARTMUSEUMS_KEY) return jserr(500, "Missing HARVARD_ARTMUSEUMS_KEY", env);
  const up = rewriteBase(new URL(req.url), UPSTREAMS.harvardArt, "/harvard-art");
  up.searchParams.set("apikey", env.HARVARD_ARTMUSEUMS_KEY);
  stripReserved(up);
  return forwardBuffered(req, env, up, { method: "GET", accept: "application/json" });
}
__name(harvardArtProxy, "harvardArtProxy");
async function iiifPassthrough(req, env) {
  const target = new URL(req.url).searchParams.get("url");
  if (!target) return jserr(400, "Missing query param: url", env);
  let up;
  try {
    up = new URL(target);
  } catch {
    return jserr(400, "Invalid url param", env);
  }
  if (up.protocol !== "https:") return jserr(400, "Only https allowed", env);
  if (!PASSTHROUGH_HOSTS.test(up.hostname)) return jserr(403, "Host not allowed", env);
  stripReserved(up);
  return forwardBuffered(req, env, up, { method: "GET", accept: IIIF_ACCEPT });
}
__name(iiifPassthrough, "iiifPassthrough");
async function dataverseProxy(req, env) {
  const src = new URL(req.url);
  const base = env.DATAVERSE_BASE || "https://dataverse.harvard.edu";
  const path = src.pathname.replace(/^\/dataverse/, "");
  const up = new URL(base);
  up.pathname = joinPaths(up.pathname, path.startsWith("/api/") ? path : `/api${path}`);
  up.search = src.search;
  stripReserved(up);
  const anonymous = /* @__PURE__ */ __name(() => forwardBuffered(req, env, up, { method: "GET", accept: "application/json" }), "anonymous");
  if (!env.DATAVERSE_API_TOKEN) return anonymous();
  const withToken = await forwardBuffered(req, env, up, {
    method: "GET",
    overrideHeaders: new Headers({
      Accept: "application/json",
      "X-Dataverse-key": env.DATAVERSE_API_TOKEN
    }),
    accept: "application/json"
  });
  return withToken.status === 401 || withToken.status === 403 ? anonymous() : withToken;
}
__name(dataverseProxy, "dataverseProxy");
async function ubcRestProxy(req, env) {
  if (!env.UBC_OC_API_KEY) return jserr(500, "Missing UBC_OC_API_KEY", env);
  const up = rewriteBase(new URL(req.url), UPSTREAMS.ubcRest, "/ubc");
  const json = /* @__PURE__ */ __name(() => new Headers({ Accept: "application/json" }), "json");
  if (/^\/search\/8\.5(?:\/)?$/i.test(up.pathname)) {
    const body = {};
    for (const k of ["q", "index", "size", "from", "sort", "term", "terms"]) {
      if (up.searchParams.has(k)) {
        const vals = up.searchParams.getAll(k);
        body[k] = vals.length > 1 ? vals : vals[0];
      }
    }
    if (!body.size && up.searchParams.has("limit")) body.size = up.searchParams.get("limit");
    up.searchParams.delete("limit");
    up.searchParams.set("key", env.UBC_OC_API_KEY);
    stripReserved(up);
    const headers = json();
    headers.set("Content-Type", "application/json");
    return forwardBuffered(req, env, up, {
      method: "POST",
      body: JSON.stringify(body),
      overrideHeaders: headers,
      accept: "application/json"
    });
  }
  if (/^\/search\/8\.5\//i.test(up.pathname)) {
    if (up.searchParams.has("limit") && !up.searchParams.has("size")) {
      up.searchParams.set("size", up.searchParams.get("limit"));
    }
    const allowed = /* @__PURE__ */ new Set(["q", "size", "from", "index", "sort", "term", "terms"]);
    for (const k of [...up.searchParams.keys()]) if (!allowed.has(k)) up.searchParams.delete(k);
  }
  stripReserved(up);
  up.searchParams.set("key", env.UBC_OC_API_KEY);
  return forwardBuffered(req, env, up, {
    method: "GET",
    overrideHeaders: json(),
    accept: "application/json"
  });
}
__name(ubcRestProxy, "ubcRestProxy");
async function ubcOaiProxy(req, env) {
  if (!env.UBC_OC_API_KEY) return jserr(500, "Missing UBC_OC_API_KEY", env);
  const up = new URL(UPSTREAMS.ubcOai);
  up.search = new URL(req.url).search;
  stripReserved(up);
  up.searchParams.set("key", env.UBC_OC_API_KEY);
  const accept = "application/xml,text/xml;q=0.9,*/*;q=0.1";
  return forwardBuffered(req, env, up, {
    method: "GET",
    overrideHeaders: new Headers({ Accept: accept }),
    accept
  });
}
__name(ubcOaiProxy, "ubcOaiProxy");
async function arxivProxy(req) {
  const up = new URL(`${UPSTREAMS.arxiv}/api/query`);
  up.search = new URL(req.url).search;
  stripReserved(up);
  return forwardBuffered(req, void 0, up, {
    method: "GET",
    accept: "application/atom+xml,text/xml;q=0.9,*/*;q=0.1"
  });
}
__name(arxivProxy, "arxivProxy");
async function directProxy(req, base, cutPrefix, accept) {
  const up = rewriteBase(new URL(req.url), base, cutPrefix);
  stripReserved(up);
  return forwardBuffered(req, void 0, up, { method: "GET", accept });
}
__name(directProxy, "directProxy");
async function withCache(req, env, ctx, fn) {
  const src = new URL(req.url);
  const ttl = clampTtl(parseInt(src.searchParams.get("ttl") || "3600", 10));
  if (req.method === "HEAD" || ttl === 0) return addCors(await fn(), env);
  const cache = caches.default;
  const cacheKey = new Request(req.url, { method: "GET", headers: cacheKeyHeaders(req) });
  const cached = await cache.match(cacheKey);
  if (cached) return addCors(new Response(cached.body, cached), env);
  const fresh = await fn();
  if (fresh.ok && isCacheable(fresh)) {
    const toClient = fresh.clone();
    const toCache = fresh.clone();
    const policy = `public, max-age=${ttl}, stale-while-revalidate=${Math.round(ttl / 2)}`;
    toClient.headers.set("Cache-Control", policy);
    toCache.headers.set("Cache-Control", policy);
    ctx.waitUntil(cache.put(cacheKey, toCache));
    return addCors(toClient, env);
  }
  return addCors(fresh, env);
}
__name(withCache, "withCache");
function isCacheable(res) {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (res.status >= 400) return false;
  return ct.includes("application/json") || ct.includes("application/ld+json") || ct.includes("application/xml") || ct.includes("text/xml") || ct.includes("application/atom+xml") || ct.includes("application/manifest+json") || ct.startsWith("image/");
}
__name(isCacheable, "isCacheable");
async function forwardBuffered(req, env, up, opts = {}) {
  const wantDebug = new URL(req.url).searchParams.get("debug") === "1";
  try {
    const headers = opts.overrideHeaders || new Headers();
    if (opts.accept && !headers.has("Accept")) headers.set("Accept", opts.accept);
    const res = await fetch(up.toString(), {
      method: opts.method || "GET",
      headers,
      redirect: "follow",
      cf: { cacheTtlByStatus: { "200-299": 0, 404: 0, "500-599": 0 } },
      body: opts.body || void 0
    });
    const ct = res.headers.get("content-type") || "";
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
          sample: redactText(sniffSample(buf, ct), env)
        },
        null,
        2
      ),
      {
        // An HTML page with a 2xx status is still a failure for an API client.
        status: res.ok && isHtml && !wantDebug ? 502 : res.status,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      }
    );
  } catch (e) {
    return jserr(502, "Upstream fetch failed", void 0, {
      url: redactUrl(up),
      detail: redactText(String(e), env)
    });
  }
}
__name(forwardBuffered, "forwardBuffered");
function responseFromBuffer(buf, status, statusText, upstreamHeaders) {
  const headers = safeResponseHeaders(upstreamHeaders);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(buf, { status, statusText, headers });
}
__name(responseFromBuffer, "responseFromBuffer");
function redactUrl(url) {
  const copy = new URL(url.toString());
  for (const key of [...copy.searchParams.keys()]) {
    if (SECRET_PARAMS.test(key)) copy.searchParams.set(key, "REDACTED");
  }
  return copy.toString();
}
__name(redactUrl, "redactUrl");
function redactText(text, env) {
  let out = String(text);
  for (const name of ["HARVARD_ARTMUSEUMS_KEY", "UBC_OC_API_KEY", "DATAVERSE_API_TOKEN"]) {
    const secret = env && env[name];
    if (secret) out = out.split(secret).join("REDACTED");
  }
  return out.replace(
    /((?:^|[^a-z0-9])(?:api[-_]?key|key|token|access[-_]?token)=)[^&\s"'<>\\]+/gi,
    "$1REDACTED"
  );
}
__name(redactText, "redactText");
function sniffSample(buf, ct) {
  try {
    if (/json|xml|html|text/.test(ct)) return new TextDecoder().decode(buf).slice(0, 2e3);
  } catch {
  }
  return `(bytes ${buf.byteLength})`;
}
__name(sniffSample, "sniffSample");
function normalizePath(p) {
  const noTrail = p.replace(/\/+$/g, "");
  return noTrail === "" ? "/" : noTrail;
}
__name(normalizePath, "normalizePath");
function rewriteBase(srcUrl, base, cutPrefix) {
  const up = new URL(base);
  const suffix = srcUrl.pathname.replace(new RegExp("^" + escapeRegex(cutPrefix)), "");
  up.pathname = joinPaths(up.pathname, suffix);
  up.search = srcUrl.search;
  return up;
}
__name(rewriteBase, "rewriteBase");
function joinPaths(a, b) {
  return (a.replace(/\/+$/, "") + "/" + b.replace(/^\/+/, "")).replace(/\/{2,}/g, "/");
}
__name(joinPaths, "joinPaths");
function safeResponseHeaders(headers) {
  const allow = /* @__PURE__ */ new Set([
    "content-type",
    "content-language",
    "cache-control",
    "expires",
    "etag",
    "last-modified",
    "vary",
    "content-disposition",
    "accept-ranges",
    "date",
    "link"
  ]);
  const out = new Headers();
  for (const [k, v] of headers.entries()) {
    if (allow.has(k.toLowerCase())) out.set(k, v);
  }
  return out;
}
__name(safeResponseHeaders, "safeResponseHeaders");
function cacheKeyHeaders(req) {
  const h = new Headers();
  const accept = req.headers.get("Accept");
  if (accept) h.set("Accept", accept);
  return h;
}
__name(cacheKeyHeaders, "cacheKeyHeaders");
function clampTtl(n) {
  if (!Number.isFinite(n) || n < 0) return 3600;
  return Math.min(24 * 3600, n);
}
__name(clampTtl, "clampTtl");
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
__name(escapeRegex, "escapeRegex");
function stripReserved(url) {
  url.searchParams.delete("ttl");
  url.searchParams.delete("debug");
}
__name(stripReserved, "stripReserved");
function cors204(env) {
  return addCors(new Response(null, { status: 204 }), env);
}
__name(cors204, "cors204");
function addCors(res, env) {
  res.headers.set("Access-Control-Allow-Origin", (env && env.ALLOWED_ORIGINS || "*").trim());
  res.headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, If-None-Match, If-Modified-Since");
  res.headers.set("Access-Control-Max-Age", "86400");
  return res;
}
__name(addCors, "addCors");
function jserr(status, message, env, extra) {
  const res = new Response(JSON.stringify({ error: message, ...extra || {} }, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
  return env ? addCors(res, env) : res;
}
__name(jserr, "jserr");
function diag(env, url) {
  const payload = {
    ok: true,
    now: (/* @__PURE__ */ new Date()).toISOString(),
    version: VERSION,
    endpoints: [
      "/harvard-art/*",
      "/princeton-art/*",
      "/yale-iiif?url=<https url on yale.edu>",
      "/dataverse/*",
      "/ubc/*",
      "/ubc-oai?verb=Identify",
      "/ubc-iiif/*",
      "/arxiv/search",
      "/northwestern/*",
      "/stanford-purl/*",
      "/stanford-embed/*",
      "/hathi-catalog/*",
      "/htrc/*",
      "/leipzig-iiif/*",
      "/bern-iiif/*"
    ],
    keys: {
      HARVARD_ARTMUSEUMS_KEY: !!env.HARVARD_ARTMUSEUMS_KEY,
      UBC_OC_API_KEY: !!env.UBC_OC_API_KEY,
      DATAVERSE_API_TOKEN: !!env.DATAVERSE_API_TOKEN
    },
    dataverseBase: env.DATAVERSE_BASE || "https://dataverse.harvard.edu",
    cors: env.ALLOWED_ORIGINS || "*",
    path: url.pathname
  };
  const res = new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
  return addCors(res, env);
}
__name(diag, "diag");
function favicon(env) {
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5r94kAAAAASUVORK5CYII=";
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const res = new Response(bin, {
    status: 200,
    headers: { "content-type": "image/png", "cache-control": "public, max-age=604800, immutable" }
  });
  return addCors(res, env);
}
__name(favicon, "favicon");

// ../../../../root/.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../root/.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-vjGzNt/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../../root/.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-vjGzNt/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default,
  redactText,
  redactUrl
};
//# sourceMappingURL=worker.js.map
