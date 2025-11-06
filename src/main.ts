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

const normalizeBasePath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }
  const ensured = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return ensured.endsWith('/') ? ensured.slice(0, -1) || '/' : ensured;
};

const BASE_PATH = normalizeBasePath(import.meta.env.BASE_URL ?? '/');

const stripBasePath = (pathname: string): string => {
  if (BASE_PATH === '/' || !pathname.startsWith(BASE_PATH)) {
    return pathname;
  }
  const stripped = pathname.slice(BASE_PATH.length) || '/';
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
};

const resolvePath = (): string => {
  const url = new URL(window.location.href);
  const trimmed = url.pathname.endsWith('/') && url.pathname.length > 1 ? url.pathname.slice(0, -1) : url.pathname;
  const normalized = stripBasePath(trimmed);
  return normalized === '' ? '/' : normalized;
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
