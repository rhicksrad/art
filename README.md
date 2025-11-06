# Art Archive Viewer

## Prerequisites

- Node.js 20
- pnpm

## Development

```bash
pnpm install
pnpm dev
```

## Architecture

The site is built with Vite and TypeScript. Each top-level HTML shell (for example `index.html`, `arxiv.html`, and `harvard.html`) exists to support direct navigation when the static bundle is hosted on GitHub Pages. The shells load the same TypeScript entry point in `src/main.ts`, which mounts views that render content from the data utilities in `src/lib` and components in `src/components`.

## Routing

Routing is file-driven. Every page under `src/pages` is registered in `src/main.ts`, and the corresponding HTML shell ensures that deep links remain valid even with GitHub Pages' static hosting constraints.

## Config

The application expects a worker base URL of `https://art.hicksrch.workers.dev`. You can override this by creating or editing `public/config.js` and setting `window.__CONFIG__ = { WORKER_BASE: "https://your-worker.example" };`. The Home page also performs a health check against `/diag` to surface worker availability for quick diagnostics.

## CI/CD

Push to the `main` branch to trigger the GitHub Actions workflow that builds, lints, type-checks, and publishes the site to GitHub Pages. Local workflows mirror CI through `pnpm build`, `pnpm lint`, and `pnpm typecheck` so the build remains green both locally and in automation.
