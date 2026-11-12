# Art API Explorer

A showcase of what you can build on free public APIs. One search box fans a query out to university museums, libraries and research archives, and every result on screen is live data. Nothing is sample data, and when an upstream fails the page says so and shows the response.

Built with Vite, strict TypeScript and vanilla DOM. All requests go through one Cloudflare Worker at `https://art.hicksrch.workers.dev`, which adds API keys, caches responses and turns upstream failures into JSON diagnostics.

## What it does

- **Unified search** on the home page across Harvard Art Museums, Princeton University Art Museum, Northwestern Digital Collections, UBC Open Collections, arXiv and Harvard Dataverse. Paste a Stanford PURL, an OCLC/ISBN/LCCN number, a HathiTrust volume id or an IIIF path and the matching lookup source runs instead.
- **Live front page**: a featured painting pulled from Harvard each day tints the whole interface with its extracted palette, next to a wall of works and live record counts per source.
- **Gallery and timeline views** of any result set, with facets built from the loaded records (dates, source, type, makers, subjects, palette). Clicking a facet filters in place.
- **Detail view** with a zoom loupe, every image of the record, the colour palette, full facts, links out and the raw API record.
- **Colour search**: click any palette swatch to find Harvard works that share that colour.
- **One explorer page per API** with that API's own controls, sample queries and a log of the Worker requests behind the page.
- **OAI-PMH console** for UBC (`ubc-oai.html`) and a **live status page** (`debug.html`) that probes every Worker route.

## Architecture

| Path                                          | Role                                                                                                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/routeRegistry.mjs`                   | Single list of pages. Vite inputs, navigation, and the route checks all read it.                                                                                                                   |
| `src/main.ts`                                 | Builds the shell and mounts the page module for the current HTML entry.                                                                                                                            |
| `src/sources/index.ts`                        | The source registry. Each entry describes one API: labels, sample queries, controls, and a `search()` that returns normalised items plus the Worker requests it made.                              |
| `src/adapters/*`                              | Turn each API's response into the shared `ItemCard` shape (`src/lib/types.ts`). Covered by unit tests against recorded response shapes in `src/adapters/__fixtures__` (tests only, never shipped). |
| `src/pages/explorer.ts`                       | The generic per-source explorer. `src/pages/<source>.ts` are one-line mounts of it.                                                                                                                |
| `src/pages/home.ts`, `status.ts`, `ubcOai.ts` | Home and unified search, the status page, the OAI console.                                                                                                                                         |
| `src/components/*`                            | Shell, cards, masonry, timeline, charts, results with facets, detail dialog, error panel.                                                                                                          |
| `src/styles/*`                                | Design tokens (light and dark), base, layout, components. The direction they follow is written down in `DESIGN.md`.                                                                                |
| `src/lib/http.ts`                             | `workerUrl`, `fetchJSON`, `fetchText` and a typed `HttpError` carrying the upstream diagnostic.                                                                                                    |

To add an API: add a Worker route, write an adapter, add an entry to `SOURCES`, and add a page to the route registry with a matching HTML shell and `src/pages/<slug>.ts`.

## The Worker

`worker/worker.js` is the source of the Cloudflare Worker, with tests beside it. It adds the API keys, caches successful responses, and returns a JSON diagnostic for any upstream failure or for `?debug=1`. Diagnostics are redacted: credential parameters and the Worker's own secret values are replaced before anything is returned.

`.github/workflows/worker.yml` deploys it with Wrangler when `worker/` changes on `main`, if the repository has a `CLOUDFLARE_API_TOKEN` secret (a token with "Edit Cloudflare Workers" permission) and `CLOUDFLARE_ACCOUNT_ID`. Without the secret the workflow reports that it skipped the deploy. To deploy by hand: `cd worker && npx wrangler deploy`.

Secrets set in Cloudflare: `HARVARD_ARTMUSEUMS_KEY`, `UBC_OC_API_KEY`, and optionally `DATAVERSE_API_TOKEN`.

## Worker base URL

Resolved in this order: `window.__CONFIG__.WORKER_BASE`, then `VITE_WORKER_BASE`, then the page origin when running on localhost (the Vite dev and preview servers proxy Worker routes), then `https://art.hicksrch.workers.dev`.

## Development

Requirements: Node 20+, pnpm 9.

```bash
pnpm install
pnpm dev           # dev server, proxies Worker routes
pnpm lint
pnpm typecheck
pnpm test
pnpm check:routes
pnpm build
pnpm smoke:pages   # checks every registered page exists in dist/
pnpm test:e2e      # browser tests against the build, Worker routes mocked
pnpm test:live     # the same pages against the real Worker
```

The browser tests are Playwright (`e2e/`), run on a desktop and a phone viewport against `vite preview`, so run `pnpm build` first and `pnpm exec playwright install chromium` once. `e2e/worker.ts` stands in for the Worker with payloads shaped like the real APIs, including a failing source that tries to leak a key. The live suite accepts an upstream being down but fails on a blank page, a script error or an unredacted key.

## CI and deployment

`.github/workflows/pages.yml` runs lint, typecheck, unit tests, the route check, the build and the smoke check on every pull request and on pushes to `main`. Pushes to `main` then deploy `dist/` to GitHub Pages.

## API notes

- **Northwestern** search takes `query=`, not `q=` (`q` is ignored and returns the whole catalogue).
- **Harvard** supports `sort=random:<seed>` and `color=<hex>`; the colour must be one of the quantised hex values the API returns in `colors[]`.
- **Princeton** `/objects/{id}` 404s for many ids; the site uses `/search`.
- **UBC** search is `GET /ubc/search/8.5?index=<slug>&q=…`; the index list comes from `/ubc/collections`.
- Upstream health changes. Open `debug.html` for the current state of every route, and `/diag` on the Worker for key status.
