const routes: Record<string, () => Promise<{ default: { mount: (el: HTMLElement) => void } | ((el: HTMLElement) => void) }>> = {
  '/': () => import('./pages/home'),
  '/index.html': () => import('./pages/home'),
  '/harvard.html': () => import('./pages/harvard'),
  '/princeton.html': () => import('./pages/princeton'),
  '/yale.html': () => import('./pages/yale'),
  '/dataverse.html': () => import('./pages/dataverse'),
  '/ubc.html': () => import('./pages/ubc'),
  '/ubc-oai.html': () => import('./pages/ubcOai'),
  '/arxiv.html': () => import('./pages/arxiv'),
};

const resolvePath = (): string => {
  const url = new URL(window.location.href);
  const pathname = url.pathname.endsWith('/') && url.pathname.length > 1 ? url.pathname.slice(0, -1) : url.pathname;
  return pathname === '' ? '/' : pathname;
};

const mount = async (): Promise<void> => {
  const container = document.getElementById('app');
  if (!container) {
    throw new Error('Missing #app container');
  }

  const path = resolvePath();
  const loader = routes[path] ?? routes['/'];
  try {
    const module = await loader();
    const entry = module.default;
    const mountFn = typeof entry === 'function' ? entry : entry.mount;
    if (typeof mountFn !== 'function') {
      throw new Error('Page module does not export a mount function');
    }
    mountFn(container);
  } catch (error) {
    container.textContent = `Failed to load page: ${error instanceof Error ? error.message : String(error)}`;
  }
};

void mount();
