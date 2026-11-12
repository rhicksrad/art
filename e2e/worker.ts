import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrowserContext, Route } from '@playwright/test';

/**
 * Stands in for the Cloudflare Worker during browser tests, with payloads shaped like the real
 * APIs. Test-only: nothing here is bundled into the site.
 */
const fixture = (name: string): string =>
  readFileSync(resolve(process.cwd(), 'src/adapters/__fixtures__', name), 'utf8');

export const LEAKED_KEY = 'leaked-key-0123456789';

const SWATCHES = ['#4b647d', '#c8af96', '#7d4b4b', '#e1c8af', '#32324b'];
const MAKERS = ['Katsushika Hokusai', 'Berthe Morisot', 'Winslow Homer', 'Hans Bol'];

const harvard = (count: number, total: number): unknown => ({
  info: { totalrecords: total, page: 1 },
  records: Array.from({ length: count }, (_, i) => ({
    id: 200000 + i,
    objectnumber: `1910.${100 + i}`,
    title: `Study number ${i + 1}`,
    dated: `c. ${1800 + i * 7}`,
    datebegin: 1800 + i * 7,
    century: '19th century',
    classification: i % 2 ? 'Prints' : 'Paintings',
    culture: 'Japanese',
    medium: 'Oil on canvas',
    primaryimageurl: `https://nrs.harvard.edu/urn-3:HUAM:TEST${i}_dynmc`,
    images: [
      {
        baseimageurl: `https://nrs.harvard.edu/urn-3:HUAM:TEST${i}_dynmc`,
        width: 800,
        height: 600,
      },
    ],
    people: [{ displayname: MAKERS[i % MAKERS.length], role: 'Artist' }],
    colors: SWATCHES.map((color, n) => ({ color, hue: 'Blue', percent: 0.3 - n * 0.05 })),
    url: `https://www.harvardartmuseums.org/collections/object/${200000 + i}`,
  })),
});

const princeton = (count: number): unknown => ({
  hits: {
    total: 148,
    hits: Array.from({ length: count }, (_, i) => ({
      _id: String(5000 + i),
      _source: {
        objectid: 5000 + i,
        displaytitle: `Harbour view ${i + 1}`,
        displaymaker: 'Claude Monet, 1840–1926; born Paris, France',
        displaydate: String(1860 + i),
        medium: 'Etching',
        primaryimage: [`https://media.artmuseum.princeton.edu/iiif/3/collection/TEST${i}`],
      },
    })),
  },
});

const PIXEL = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#4b647d"/><circle cx="280" cy="110" r="60" fill="#c8af96"/></svg>`;

const json = (route: Route, body: unknown, status = 200): Promise<void> =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const sizeOf = (route: Route, param: string): number =>
  Number(new URL(route.request().url()).searchParams.get(param) ?? 12);

export const mockWorker = async (context: BrowserContext): Promise<void> => {
  await context.route(
    /nrs\.harvard\.edu|media\.artmuseum\.princeton\.edu|iiif\.dc\.library/,
    (route) => route.fulfill({ contentType: 'image/svg+xml', body: PIXEL }),
  );
  await context.route('**/harvard-art/**', (route) =>
    json(route, harvard(sizeOf(route, 'size'), 4647)),
  );
  await context.route('**/princeton-art/**', (route) =>
    json(route, princeton(sizeOf(route, 'size'))),
  );
  await context.route('**/northwestern/**', (route) => json(route, fixture('northwestern.json')));
  await context.route('**/arxiv/**', (route) =>
    route.fulfill({ contentType: 'application/atom+xml', body: fixture('arxiv.xml') }),
  );
  await context.route('**/dataverse/**', (route) => json(route, fixture('dataverse.json')));
  await context.route('**/ubc/collections**', (route) =>
    json(route, { data: { 930: 'aaah', 931: 'bcbooks', 932: 'calendars' } }),
  );
  // An unpatched Worker that leaks its key: the site must never show it.
  await context.route('**/ubc/search/**', (route) =>
    json(
      route,
      {
        upstream: `https://oc-index.library.ubc.ca/search/8.5?index=calendars&key=${LEAKED_KEY}`,
        status: 500,
        statusText: 'Internal Server Error',
        contentType: 'text/html',
        sample: `<html>failed for key=${LEAKED_KEY}</html>`,
      },
      500,
    ),
  );
  await context.route('**/hathi-catalog/**', (route) => json(route, fixture('hathi.json')));
  await context.route('**/stanford-purl/**', (route) =>
    json(
      route,
      fixture(
        route.request().url().includes('manifest')
          ? 'stanford-manifest.json'
          : 'stanford-cocina.json',
      ),
    ),
  );
  await context.route(/\/(htrc|leipzig-iiif|bern-iiif)\//, (route) =>
    json(
      route,
      { upstream: 'https://example.org/', status: 404, statusText: 'Not Found', sample: '' },
      404,
    ),
  );
  // A regex with the query mark, so the /ubc-oai.html page itself is not intercepted.
  await context.route(/\/ubc-oai\?/, (route) =>
    route.fulfill({
      contentType: 'text/xml',
      headers: { 'access-control-allow-origin': '*' },
      body: '<OAI-PMH><Identify><repositoryName>Test repository</repositoryName></Identify></OAI-PMH>',
    }),
  );
  await context.route('**/diag**', (route) =>
    json(route, { ok: true, version: 'test', keys: { HARVARD_ARTMUSEUMS_KEY: true }, cors: '*' }),
  );
};
