const ROUTES = [
  { href: '', label: 'Home' },
  { href: 'harvard.html', label: 'Harvard' },
  { href: 'princeton.html', label: 'Princeton' },
  { href: 'yale.html', label: 'Yale' },
  { href: 'dataverse.html', label: 'Dataverse' },
  { href: 'ubc.html', label: 'UBC' },
  { href: 'ubc-oai.html', label: 'UBC OAI' },
  { href: 'arxiv.html', label: 'arXiv' },
];

const normalizePath = (value: string): string => {
  if (!value) return '/';
  const ensured = value.startsWith('/') ? value : `/${value}`;
  if (ensured === '/index.html') {
    return '/';
  }
  if (ensured.endsWith('/index.html')) {
    return ensured.slice(0, -'/index.html'.length) || '/';
  }
  if (ensured.endsWith('/') && ensured.length > 1) {
    return ensured.slice(0, -1);
  }
  return ensured;
};

const joinBase = (basePath: string, routeHref: string): string => {
  const normalizedBase = basePath === '/' ? '' : basePath.replace(/\/+$/, '');
  if (!routeHref) {
    return normalizedBase || '/';
  }
  const trimmedRoute = routeHref.startsWith('/') ? routeHref.slice(1) : routeHref;
  const joined = `${normalizedBase}/${trimmedRoute}`;
  if (joined.endsWith('/') && joined !== '/') {
    return joined.slice(0, -1);
  }
  return joined.startsWith('/') ? joined : `/${joined}`;
};

const isCurrentPath = (href: string): boolean => {
  const current = normalizePath(window.location.pathname);
  const target = normalizePath(href);
  return current === target;
};

export const createSiteNav = (basePath: string): HTMLElement => {
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  nav.setAttribute('aria-label', 'Primary navigation');

  ROUTES.forEach((route) => {
    const link = document.createElement('a');
    const normalizedHref = joinBase(basePath, route.href);
    link.setAttribute('href', normalizedHref);
    link.textContent = route.label;
    link.className = 'site-nav__link';

    if (isCurrentPath(normalizedHref)) {
      link.setAttribute('aria-current', 'page');
      link.classList.add('site-nav__link--current');
    }

    nav.appendChild(link);
  });

  return nav;
};
