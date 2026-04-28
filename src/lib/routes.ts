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
