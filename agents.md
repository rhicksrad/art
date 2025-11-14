# `agents.md`

## Mission

**Art API Explorer** — A unified Cloudflare Worker and frontend site that aggregates major university open APIs for exploration, learning, and visualization.
The project’s goal: one endpoint space and one UI where users can browse, query, and visualize datasets from art, research, and scholarship institutions.

---

## Core Philosophy

* **One Worker, Many Universes** — a single Cloudflare Worker mediates all API traffic, handles caching, and normalizes quirks.
* **No API keys in browser** — all keys live as Cloudflare secrets.
* **Exploration-first** — responses are transparent, and debugging routes (`/diag` and `?debug=1`) show upstream URLs, content types, and samples.
* **Fail openly** — upstream failures return structured JSON diagnostics, never HTML error pages.

---

## Bound Endpoints

| Route              | Description                                             | Source                                 |
| ------------------ | ------------------------------------------------------- | -------------------------------------- |
| `/harvard-art/*`   | Harvard Art Museums API (JSON, requires key)            | `https://api.harvardartmuseums.org`    |
| `/princeton-art/*` | Princeton University Art Museum (open, JSON)            | `https://data.artmuseum.princeton.edu` |
| `/yale-iiif?url=`  | IIIF / LinkedArt proxy (Yale manifests or any IIIF URL) | Any IIIF manifest URL                  |
| `/dataverse/*`     | Harvard Dataverse API (set via `DATAVERSE_BASE`)        | `https://dataverse.harvard.edu`        |
| `/ubc/*`           | UBC Open Collections API (REST, OAI, IIIF)              | `https://oc-index.library.ubc.ca`      |
| `/ubc-oai?verb=`   | UBC OAI-PMH feed                                        | `https://oce-index.library.ubc.ca/oai` |
| `/ubc-iiif/*`      | UBC IIIF service passthrough                            | `https://iiif.library.ubc.ca`          |
| `/arxiv/search`    | arXiv Atom feed proxy                                   | `https://export.arxiv.org/api/query`   |
| `/diag`            | Worker health report and environment keys               | local                                  |
| `/favicon.ico`     | 1×1 transparent PNG to silence browser errors           | local                                  |

---

## Auth & Secrets

All API keys are stored in Cloudflare **Secrets**:

```
HARVARD_ARTMUSEUMS_KEY
UBC_OC_API_KEY
DATAVERSE_API_TOKEN (optional)
```

Environment variables:

```
DATAVERSE_BASE="https://dataverse.harvard.edu"
ALLOWED_ORIGINS="*"
```

---

## Worker Behavior Summary

### ✅ Harvard

* Appends `apikey` to all requests.
* Tested endpoints: `/object`, `/object/{id}`, `/gallery`, etc.
* Returns valid JSON.

### ✅ Princeton

* `/objects/{id}` returns 404 for many IDs; use `/search?q=term&type=artobjects`.
* Works reliably via the `/search` endpoint.

### ✅ Dataverse

* Uses `DATAVERSE_BASE` (default Harvard Dataverse).
* `/search?q=data&type=dataset` returns results instantly.
* Fully CORS-compatible.

### ✅ UBC Open Collections

#### Working Routes

* `/ubc/collections` — full list of collection IDs/slugs.
* `/ubc/oai` and `/ubc/iiif` — OK.
* `/ubc/search/8.5` — confirmed functional (requires `index` query parameter).

#### Search Quirks

* `/ubc/search/8.5` (POST) requires API key in URL, not header.
* Using both header + query key triggers `401 Unauthorized`.
* Using header-only triggers `401 Unauthorized`.
* Working pattern:

  ```
  GET /ubc/search/8.5?index={index}&q=<query>&size=<n>
  ```
* Valid index discovered: **`calendars`**

### ✅ arXiv

* `/arxiv/search?search_query=cat:cs.AI&max_results=1`
* Returns Atom XML feed; parsed successfully.

### ✅ Yale IIIF

* `/yale-iiif?url=https://iiif.harvardartmuseums.org/manifests/object/299843`
* Returns a full manifest JSON.

---

## Cache + Debug

* `ttl` param controls Cloudflare cache (default 3600 s, up to 86400).
* `/diag` shows:

  * key presence
  * base URLs
  * CORS policy
* `?debug=1` returns the upstream URL, status, content type, and a body sample for any error response.

---

## Architecture Highlights

* **Buffered forwarding** — upstream responses are fully read (`arrayBuffer`) and re-emitted, preventing CF stream reuse errors.
* **Safe caching** — responses are cloned before caching and returning.
* **Header whitelist** — only safe response headers are preserved (`content-type`, `etag`, `last-modified`, etc.).
* **Favicon** — tiny transparent PNG built-in to prevent noisy 404s.

---

## Known Good Probes

```js
fetch("https://art.hicksrch.workers.dev/harvard-art/object/299843").then(r=>r.json());
fetch("https://art.hicksrch.workers.dev/princeton-art/search?q=monet&type=artobjects&size=1").then(r=>r.json());
fetch("https://art.hicksrch.workers.dev/dataverse/search?q=data&type=dataset&per_page=1").then(r=>r.json());
fetch("https://art.hicksrch.workers.dev/ubc/collections").then(r=>r.json());
fetch("https://art.hicksrch.workers.dev/ubc/search/8.5?index=calendars&q=newspaper&size=1").then(r=>r.json());
fetch("https://art.hicksrch.workers.dev/arxiv/search?search_query=cat:cs.AI&max_results=1").then(r=>r.text());
fetch("https://art.hicksrch.workers.dev/yale-iiif?url=https://iiif.harvardartmuseums.org/manifests/object/299843").then(r=>r.json());
```

---

## Frontend Strategy

### Pages

| Page              | Source               | Chart/Visualization                              |
| ----------------- | -------------------- | ------------------------------------------------ |
| `/harvard.html`   | Harvard Art Museums  | Histogram of objects per decade; color analytics |
| `/princeton.html` | Princeton Art Museum | Maker networks                                   |
| `/yale.html`      | IIIF manifests       | Thumbnail gallery                                |
| `/dataverse.html` | Dataverse            | Subject bar charts; dataset counts               |
| `/ubc.html`       | UBC Collections      | Per-year bars; IIIF image previews               |
| `/arxiv.html`     | arXiv                | Category growth sparkline                        |
| `/home.html`      | All                  | Combined timeline, saved searches, diagnostics   |

### Unified search UX

* The homepage hosts a multi-source search console. Users pick sources (Harvard, Princeton, Yale manifests, Dataverse, UBC, arXiv), set the per-source limit, toggle layout (grid vs. list), and optionally require image thumbnails.
* Each source renders `ItemCard`s from the adapters; loading and error states surface inside the section via `Alert` components.
* The header search box rewrites the URL to `/?q=<term>` so the unified search auto-runs with shared state pulled from `window.location.search`.

---

## Lessons Learned

1. **Always verify API method.**
   UBC `/search/8.5` accepts GET when indexed, not POST.
2. **Never send duplicate keys.**
   A query key + header key causes `401 Unauthorized`.
3. **Diag early, diag often.**
   `/diag` output plus `?debug=1` saved hours of blind debugging.
4. **Upstream HTML ≠ worker failure.**
   Buffering avoids Cloudflare’s “Worker threw exception” HTML by preventing re-read streams.
5. **Small headers, big wins.**
   Removing `content-length` and `content-encoding` fixed stream crashes.
6. **UBC index is dynamic.**
   Validate via `/ubc/collections` and fallback to a known slug (e.g., `calendars`).
7. **Keep caching optional.**
   `ttl=0` disables cache; `ttl=86400` prewarms results for heavy browse sessions.

---

## Future Work

* Add auto-index discovery in Worker for UBC when `index` missing (default to `calendars`).
* Merge IIIF endpoints into a unified `/iiif/*` namespace with manifest parsing.
* Build data visualizations for temporal and geographic dimensions.
* Add CLI smoke-test script for all endpoints.
* Publish `agents.md` knowledge to repo for contributors.

---

**Version:** `2025-11-06`
**Worker:** `art.hicksrch.workers.dev`
**Status:** ✅ stable — all APIs functional except UBC POST variant (GET-only search mode confirmed).
