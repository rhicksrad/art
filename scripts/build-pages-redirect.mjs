// Builds the GitHub Pages site as a set of redirects to the Cloudflare address, one page per
// registered route, so old links keep their path and query string.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeHtmlEntries } from '../src/lib/routeRegistry.mjs';

const target = (process.env.SITE_URL ?? 'https://art.hicksrch.workers.dev').replace(/\/+$/, '');
const outDir = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist-redirect');

const page = (path) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Art API Explorer has moved</title>
    <link rel="canonical" href="${target}${path}" />
    <script>
      location.replace(${JSON.stringify(target + path)} + location.search + location.hash);
    </script>
    <meta http-equiv="refresh" content="0; url=${target}${path}" />
  </head>
  <body>
    <p>Art API Explorer has moved to <a href="${target}${path}">${target}${path}</a>.</p>
  </body>
</html>
`;

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const entry of activeHtmlEntries) {
  const path = entry === 'index.html' ? '/' : `/${entry.replace(/\.html$/, '')}`;
  writeFileSync(resolve(outDir, entry), page(path));
}
// Unknown paths land on the home page rather than GitHub's 404.
writeFileSync(resolve(outDir, '404.html'), page('/'));
console.log(
  `Wrote ${activeHtmlEntries.length + 1} redirect pages to dist-redirect/ for ${target}.`,
);
