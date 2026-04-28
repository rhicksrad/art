import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeHtmlEntries, routeRegistry } from '../src/lib/routeRegistry.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const errors = [];

const expectedHtmlForRoute = (route) => `${route.htmlShell}.html`;

const duplicateValues = (values) => {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }
    seen.add(value);
  }
  return [...duplicates];
};

const navVisibleRoutes = routeRegistry.filter((route) => route.navVisible);
for (const route of navVisibleRoutes) {
  const htmlEntry = expectedHtmlForRoute(route);
  if (!activeHtmlEntries.includes(htmlEntry)) {
    errors.push(`Nav-visible route ${route.path} is missing an HTML build entry (${htmlEntry}).`);
    continue;
  }
  if (!existsSync(resolve(repoRoot, htmlEntry))) {
    errors.push(`Nav-visible route ${route.path} references missing HTML file: ${htmlEntry}.`);
  }
}

for (const route of routeRegistry) {
  const htmlEntry = expectedHtmlForRoute(route);
  if (!activeHtmlEntries.includes(htmlEntry)) {
    errors.push(`Runtime route ${route.path} is missing a build input (${htmlEntry}).`);
  }
}

const routeIds = routeRegistry.map((route) => route.htmlShell);
for (const duplicateId of duplicateValues(routeIds)) {
  errors.push(`Duplicate route id detected: ${duplicateId}.`);
}

const allPaths = routeRegistry.flatMap((route) => [route.path, ...(route.aliases ?? [])]);
for (const duplicatePath of duplicateValues(allPaths)) {
  errors.push(`Duplicate route path/alias detected: ${duplicatePath}.`);
}

const runtimeHtmlEntries = new Set(routeRegistry.map(expectedHtmlForRoute));
for (const htmlEntry of activeHtmlEntries) {
  if (!runtimeHtmlEntries.has(htmlEntry)) {
    errors.push(`Orphan build input detected with no runtime route: ${htmlEntry}.`);
  }
}

if (errors.length > 0) {
  console.error('Route registry validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Route registry validation passed (${routeRegistry.length} routes).`);
