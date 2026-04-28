import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

import { routeRegistry } from './src/lib/routes';

const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
const isCI = !!process.env.CI;

const rootDir = fileURLToPath(new URL('.', import.meta.url));

const rollupInput = Object.fromEntries(
  routeRegistry.map((route) => [route.htmlShell, resolve(rootDir, `${route.htmlShell}.html`)]),
);

const workerProxyTarget = 'https://art.hicksrch.workers.dev';
const workerProxyRoutes = [
  '/arxiv',
  '/dataverse',
  '/harvard-art',
  '/princeton-art',
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

export default defineConfig({
  base: isCI && repo ? `/${repo}/` : '/',
  build: {
    rollupOptions: {
      input: rollupInput,
    },
  },
  server: {
    proxy: proxyConfig,
  },
});
