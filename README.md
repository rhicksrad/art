# Art API Explorer

A Vite + TypeScript site that talks exclusively to the shared Cloudflare Worker at `https://art.hicksrch.workers.dev`. The Worker fans out to each upstream API, handles caching, adds required keys, and exposes a consistent surface for the browser.

## Architecture

- **Worker endpoints** – All browser requests use relative URLs that the Worker serves:
  - `/harvard-art/*`, `/princeton-art/*`, `/dataverse/*`, `/ubc/*`, `/arxiv/search`, `/yale-iiif`, `/ubc-oai`, and `/diag`.
  - The Worker appends API keys, manages caching via a `ttl` query parameter, and returns JSON diagnostics for any error path.
- **No client-side secrets** – Keys live in Cloudflare Secrets. The browser resolves the Worker base URL from `window.__CONFIG__`, `import.meta.env.VITE_WORKER_BASE`, or defaults to `https://art.hicksrch.workers.dev`.
- **HTTP helpers** – `src/lib/http.ts` centralises fetch logic: JSON/text helpers, strong `Accept` headers, query-string building, and typed `HttpError` instances with response samples.
- **Routing** – `src/main.ts` maps each HTML shell (e.g. `harvard.html`) to a page module. Pages build UI with vanilla DOM components.
- **Adapters** – `src/adapters/*` normalise each API into a shared `ItemCard` shape so the UI can render cards consistently.
- **Styling** – One global stylesheet (`src/styles/theme.css`) defines light/dark themes, layouts, and component styling.
- **Debugging** – `debug.html` runs smoke tests against the Worker and logs PASS/FAIL with short samples. Append `?debug=1` to any request for upstream traces.

## UBC index discovery

UBC Open Collections exposes multiple Elasticsearch indices. The active slug is discovered at runtime via `/ubc/collections`. The frontend caches the first slug that starts with a letter in `localStorage` and falls back to `aaah` if discovery fails. All searches use the legacy GET endpoint:

```
GET /ubc/search/8.5/<index>?q=term&size=12
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
