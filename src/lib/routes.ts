// @ts-expect-error -- Shared runtime route registry is authored in ESM for Node scripts and Vite config.
import { routeRegistry as sharedRouteRegistry } from './routeRegistry.mjs';

export type PageModuleImportKey = `./pages/${string}`;

export type RouteDefinition = {
  path: `/${string}` | '/';
  htmlShell: string;
  moduleKey: PageModuleImportKey;
  navLabel: string;
  navVisible: boolean;
  aliases?: readonly (`/${string}` | '/')[];
};

export const routeRegistry = sharedRouteRegistry as readonly RouteDefinition[];

export const navigableRoutes = routeRegistry.filter((route) => route.navVisible);

const BASE = (() => {
  const raw = import.meta.env.BASE_URL ?? '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
})();

/** Site-relative href that respects the GitHub Pages base path. */
export const pageHref = (path: string, params?: Record<string, string | undefined>): string => {
  const clean = path === '/' ? '' : path.replace(/^\/+/, '');
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return `${BASE}${clean}${suffix ? `?${suffix}` : ''}`;
};

/** Current route path with the base stripped, e.g. "/harvard.html" or "/". */
export const currentRoute = (): string => {
  let path = window.location.pathname;
  if (BASE !== '/' && path.startsWith(BASE)) path = `/${path.slice(BASE.length)}`;
  else if (BASE !== '/' && `${path}/` === BASE) path = '/';
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path === '/index.html' || path === '' ? '/' : path;
};
