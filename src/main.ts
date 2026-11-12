import './styles';

import { createShell } from './components/shell';
import { h } from './lib/dom';
import { currentRoute } from './lib/routes';
import { routeRegistry } from './lib/routes';

type PageModule = {
  default: { mount: (el: HTMLElement) => void };
};

const pageModules = import.meta.glob<PageModule>('./pages/*.ts');

const routes = new Map<string, () => Promise<PageModule>>();
for (const route of routeRegistry) {
  const loader = pageModules[`${route.moduleKey}.ts`];
  if (!loader)
    throw new Error(`Missing page module for route ${route.path}: ${route.moduleKey}.ts`);
  routes.set(route.path, loader);
  route.aliases?.forEach((alias) => routes.set(alias, loader));
}

const mount = async (): Promise<void> => {
  const container = document.getElementById('app');
  if (!container) throw new Error('Missing #app container');

  const main = createShell(container);
  const loader = routes.get(currentRoute()) ?? routes.get('/');
  try {
    if (!loader) throw new Error('No page is registered for this route.');
    const module = await loader();
    module.default.mount(main);
  } catch (error) {
    main.replaceChildren(
      h(
        'div',
        { class: 'page' },
        h('h1', null, 'This page failed to load'),
        h('p', { class: 'lede' }, error instanceof Error ? error.message : String(error)),
      ),
    );
  }
};

void mount();
