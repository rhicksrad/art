import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { defineConfig } from 'vite';
import { activeHtmlEntries } from './src/lib/routeRegistry.mjs';

const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
const isCI = !!process.env.CI;
// Set DEPLOY_TARGET=cloudflare so `vite preview` and the browser tests serve from the root too.
const forCloudflare = process.env.DEPLOY_TARGET === 'cloudflare';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

const rollupInput = Object.fromEntries(
  activeHtmlEntries
    .filter((entry) => existsSync(resolve(rootDir, entry)))
    .map((entry) => [entry.replace(/\.html$/, ''), resolve(rootDir, entry)]),
);

const workerProxyTarget = 'https://art.hicksrch.workers.dev';
const workerProxyRoutes = [
  '/arxiv',
  '/dataverse',
  '/harvard-art',
  '/northwestern',
  '/princeton-art',
  '/stanford-purl',
  '/stanford-embed',
  '/hathi-catalog',
  '/htrc',
  '/bern-iiif',
  '/ubc',
  '/ubc-iiif',
  '/ubc-oai',
  '/diag',
];

const proxyConfig = workerProxyRoutes.reduce(
  (acc, route) => {
    acc[route] = {
      target: workerProxyTarget,
      changeOrigin: true,
      secure: true,
      bypass(req) {
        if (req.url && req.url.endsWith('.html')) {
          return req.url;
        }
        const accept = req.headers.accept;
        if (accept && accept.includes('text/html')) {
          return req.url;
        }
        return null;
      },
    };
    return acc;
  },
  {} as Record<string, import('vite').ProxyOptions>,
);

// `--mode cloudflare` builds for the Worker's static assets: served from the root, with the API
// on the same origin under /api (see .env.cloudflare and worker/wrangler.toml).
export default defineConfig(({ mode }) => ({
  base: mode !== 'cloudflare' && !forCloudflare && isCI && repo ? `/${repo}/` : '/',
  build: {
    rollupOptions: {
      input: rollupInput,
    },
  },
  server: {
    proxy: proxyConfig,
  },
  preview: {
    proxy: proxyConfig,
  },
}));
