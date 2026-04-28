import { navigableRoutes } from '../lib/routes';

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

const joinBase = (basePath: string, routePath: string): string => {
  const normalizedBase = basePath === '/' ? '' : basePath.replace(/\/+$/, '');
  if (routePath === '/') {
    return normalizedBase || '/';
  }
  const trimmedRoute = routePath.startsWith('/') ? routePath.slice(1) : routePath;
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

  navigableRoutes.forEach((route) => {
    const link = document.createElement('a');
    const normalizedHref = joinBase(basePath, route.path);
    link.setAttribute('href', normalizedHref);
    link.textContent = route.navLabel;
    link.className = 'site-nav__link';

    if (isCurrentPath(normalizedHref)) {
      link.setAttribute('aria-current', 'page');
      link.classList.add('site-nav__link--current');
    }

    nav.appendChild(link);
  });

  return nav;
};
