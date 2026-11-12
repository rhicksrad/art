import { h, icon } from '../lib/dom';
import { applyTheme, resolveTheme, restoreAccent } from '../lib/prefs';
import { currentRoute, pageHref } from '../lib/routes';
import { SOURCE_GROUPS, SOURCES } from '../sources';

const navLink = (label: string, path: string, route: string): HTMLAnchorElement =>
  h(
    'a',
    {
      href: pageHref(path),
      class: 'nav__link',
      'aria-current': route === path ? 'page' : undefined,
    },
    label,
  );

const sourcesMenu = (route: string): HTMLElement => {
  const onSourcePage = SOURCES.some((source) => source.page === route);
  const panel = h('div', { class: 'menu__panel' });
  for (const group of SOURCE_GROUPS) {
    panel.append(
      h(
        'div',
        { class: 'menu__group' },
        h('p', { class: 'menu__heading' }, group),
        ...SOURCES.filter((source) => source.group === group).map((source) =>
          h(
            'a',
            {
              href: pageHref(source.page),
              class: 'menu__item',
              'aria-current': route === source.page ? 'page' : undefined,
            },
            h('span', { class: 'menu__label' }, source.label),
            h('span', { class: 'menu__hint' }, source.holds),
          ),
        ),
      ),
    );
  }
  const menu = h(
    'details',
    { class: 'menu' },
    h('summary', { class: `nav__link${onSourcePage ? ' nav__link--active' : ''}` }, 'Sources'),
    panel,
  );
  document.addEventListener('click', (event) => {
    if (menu.open && !menu.contains(event.target as Node)) menu.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') menu.open = false;
  });
  return menu;
};

const themeToggle = (): HTMLButtonElement => {
  const button = h('button', {
    type: 'button',
    class: 'icon-button',
    'aria-label': 'Switch colour theme',
  });
  const paint = (): void => {
    const dark = document.documentElement.dataset.theme === 'dark';
    button.replaceChildren(icon(dark ? 'sun' : 'moon', 18));
    button.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
  };
  button.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
    paint();
  });
  paint();
  return button;
};

const headerSearch = (): HTMLFormElement => {
  const input = h('input', {
    type: 'search',
    name: 'q',
    placeholder: 'Search every source',
    'aria-label': 'Search every source',
    autocomplete: 'off',
  });
  // A plain GET form: works without JavaScript and lands on the unified search.
  return h(
    'form',
    { class: 'header-search', action: pageHref('/'), method: 'get', role: 'search' },
    icon('search', 16),
    input,
  );
};

export const createShell = (root: HTMLElement): HTMLElement => {
  applyTheme(resolveTheme());
  restoreAccent();
  const route = currentRoute();

  const header = h(
    'header',
    { class: 'site-header' },
    h(
      'div',
      { class: 'site-header__inner' },
      h(
        'a',
        { href: pageHref('/'), class: 'brand', 'aria-label': 'Art API Explorer home' },
        h('span', { class: 'brand__mark', 'aria-hidden': 'true' }),
        h('span', { class: 'brand__name' }, 'Art API Explorer'),
      ),
      h(
        'nav',
        { class: 'nav', 'aria-label': 'Primary' },
        navLink('Search', '/', route),
        sourcesMenu(route),
        navLink('OAI harvester', '/ubc-oai.html', route),
        navLink('Status', '/debug.html', route),
      ),
      h(
        'div',
        { class: 'site-header__tools' },
        route === '/' ? null : headerSearch(),
        themeToggle(),
      ),
    ),
  );

  const main = h('main', { class: 'site-main', id: 'main' });

  const footer = h(
    'footer',
    { class: 'site-footer' },
    h(
      'div',
      { class: 'site-footer__inner' },
      h(
        'p',
        null,
        'Every request goes through one Cloudflare Worker, which adds API keys, caches responses and reports upstream failures as JSON. Nothing shown here is sample data.',
      ),
      h(
        'p',
        { class: 'site-footer__links' },
        h('a', { href: pageHref('/debug.html') }, 'Worker status'),
        h('a', { href: 'https://github.com/rhicksrad/art', rel: 'noreferrer' }, 'Source on GitHub'),
      ),
    ),
  );

  root.replaceChildren(
    h('a', { href: '#main', class: 'skip-link' }, 'Skip to content'),
    header,
    main,
    footer,
  );
  return main;
};
