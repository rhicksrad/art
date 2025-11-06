# Art Archive Viewer

## Prerequisites
- Node.js 20
- pnpm

## Development
```bash
pnpm install
pnpm dev
```

## Deployment
Push to the `main` branch to trigger the GitHub Actions workflow that builds and publishes the site to GitHub Pages.

## Runtime Configuration
The application expects a worker base URL of `https://art.hicksrch.workers.dev`. You can override this by creating or editing `public/config.js` and setting `window.__CONFIG__ = { WORKER_BASE: "https://your-worker.example" };`.
