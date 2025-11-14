# Art API Explorer

A Vite + TypeScript site that talks exclusively to the shared Cloudflare Worker at `https://art.hicksrch.workers.dev`. The Worker fans out to each upstream API, handles caching, adds required keys, and exposes a consistent surface for the browser.

## Unified search

The homepage acts like a "Google for academic APIs". A single form fans a query out to Harvard Art Museums, Princeton,
Harvard Dataverse, UBC Open Collections, and arXiv. The UI lets you:

- Pick which sources participate.
- Control the max results per source, toggle a grid/list layout, and filter down to cards with images.
- See per-source loading state, error alerts, and normalized cards rendered via shared adapters.
- Jump into the unified experience from the header search bar, which rewrites the URL to `/?q=<term>`.

## Architecture

- **Worker endpoints** – All browser requests use relative URLs that the Worker serves:
  - `/harvard-art/*`, `/princeton-art/*`, `/dataverse/*`, `/ubc/*`, `/arxiv/search`, `/ubc-oai`, and `/diag`.
  - The Worker appends API keys, manages caching via a `ttl` query parameter, and returns JSON diagnostics for any error path.
- **No client-side secrets** – Keys live in Cloudflare Secrets. The browser resolves the Worker base URL from `window.__CONFIG__`, `import.meta.env.VITE_WORKER_BASE`, or defaults to `https://art.hicksrch.workers.dev`.
- **HTTP helpers** – `src/lib/http.ts` centralises fetch logic: JSON/text helpers, strong `Accept` headers, query-string building, and typed `HttpError` instances with response samples.
- **Routing** – `src/main.ts` maps each HTML shell (e.g. `harvard.html`) to a page module. Pages build UI with vanilla DOM components.
- **Adapters** – `src/adapters/*` normalise each API into a shared `ItemCard` shape so the UI can render cards consistently.
- **Styling** – A layered design system lives in `src/styles/`, with tokens, base, components, charts, and utility layers imported through `src/styles/index.ts`.
- **Debugging** – `debug.html` runs smoke tests against the Worker and logs PASS/FAIL with short samples. Append `?debug=1` to any request for upstream traces.

## Included services

- **Harvard Art Museums** – `/harvard-art/object` search with people, classification, and IIIF imagery.
- **Princeton University Art Museum** – `/princeton-art/search` Linked Art responses rendered as ItemCards.
- **Harvard Dataverse** – `/dataverse/search` dataset explorer with subject and keyword tags.
- **UBC Open Collections** – `/ubc/search/8.5/{index}` discovery with automatic index resolution and IIIF helpers.
- **UBC OAI-PMH** – `/ubc-oai` verb runner for harvesting metadata.
- **arXiv** – `/arxiv/search` Atom feed parser for category-aware research cards.
- **Northwestern Digital Collections** – `/northwestern/api/v2/search` for posters, ephemera, and recordings with IIIF image helpers.
- **Stanford PURL / Embed** – `/stanford-purl/*` + `/stanford-embed/*` lookup for any 11-character PURL id.
- **HathiTrust Catalog** – `/hathi-catalog/api/volumes/full/{type}/{id}.json` identifier search for digitized volumes.
- **HTRC Analytics** – `/htrc/api/metadata/volume/{htid}` metadata probes for the HathiTrust Research Center.
- **Leipzig IIIF** – `/leipzig-iiif/*` proxy for iiif.ub.uni-leipzig.de collections and manifests.
- **Bern IIIF** – `/bern-iiif/*` proxy for iiif.ub.unibe.ch collections and manifests.

## UBC index discovery

UBC Open Collections exposes multiple Elasticsearch indices. The active slug is discovered at runtime via `/ubc/collections`. The frontend caches the first slug that starts with a letter in `localStorage` and falls back to `calendars` if discovery fails. All searches use the Worker proxy for the GET endpoint with an `index` query parameter:

```
GET /ubc/search/8.5?index=<index>&q=term&size=12
```

No POST requests or query-string API keys are sent from the browser.

## Development

Requirements: Node 20, pnpm, strict TypeScript.

```bash
pnpm install
pnpm dev      # Vite dev server
pnpm typecheck
pnpm build
```

The site expects the Worker base URL to be available at runtime. In development you can create `public/config.js` and define `window.__CONFIG__ = { WORKER_BASE: 'https://your-worker.example.com' };`. For Pages deployments, the GitHub Actions workflow writes this file using the `WORKER_BASE` secret before building.

## Deployment

GitHub Pages deploys via the existing “Pages via Actions” workflow:

1. Install pnpm (9.12.3) and dependencies.
2. Write `public/config.js` with the `WORKER_BASE` secret or default worker URL.
3. `pnpm build` outputs static assets under `dist/`.
4. Upload the artifact and deploy to Pages.

## Known caveats

- UBC search relies on the GET index endpoint and occasionally returns worker diagnostics if the upstream rotates indices. Reloading the collections probe resolves the current slug.
- The UBC OAI endpoint (`ubc-oai.html`) still depends on the upstream OAI service, which can return 52x responses during maintenance.
- Some Princeton object IDs 404 on the open API; use the search endpoint instead of direct object lookups.
- arXiv requests are Atom feeds; parsing failures will surface as typed HTTP errors with response samples.

## Debugging tips

- Visit `/diag` for key status, cache info, and base URLs.
- Append `?debug=1` to any Worker URL to inspect upstream status codes and body samples.
- Load `debug.html` to run the bundled smoke tests against the production Worker.
