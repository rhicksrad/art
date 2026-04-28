export type PageModuleImportKey = `./pages/${string}`;

export type RouteDefinition = {
  path: `/${string}` | '/';
  htmlShell: string;
  moduleKey: PageModuleImportKey;
  navLabel: string;
  navVisible: boolean;
  aliases?: readonly (`/${string}` | '/')[];
};

export const routeRegistry: readonly RouteDefinition[] = [
  {
    path: '/',
    aliases: ['/index.html'],
    htmlShell: 'index',
    moduleKey: './pages/home',
    navLabel: 'Home',
    navVisible: true,
  },
  {
    path: '/harvard.html',
    htmlShell: 'harvard',
    moduleKey: './pages/harvard',
    navLabel: 'Harvard',
    navVisible: true,
  },
  {
    path: '/princeton.html',
    htmlShell: 'princeton',
    moduleKey: './pages/princeton',
    navLabel: 'Princeton',
    navVisible: true,
  },
  {
    path: '/dataverse.html',
    htmlShell: 'dataverse',
    moduleKey: './pages/dataverse',
    navLabel: 'Dataverse',
    navVisible: true,
  },
  {
    path: '/ubc.html',
    htmlShell: 'ubc',
    moduleKey: './pages/ubc',
    navLabel: 'UBC',
    navVisible: true,
  },
  {
    path: '/ubc-oai.html',
    htmlShell: 'ubc-oai',
    moduleKey: './pages/ubcOai',
    navLabel: 'UBC OAI',
    navVisible: true,
  },
  {
    path: '/arxiv.html',
    htmlShell: 'arxiv',
    moduleKey: './pages/arxiv',
    navLabel: 'arXiv',
    navVisible: true,
  },
  {
    path: '/northwestern.html',
    htmlShell: 'northwestern',
    moduleKey: './pages/northwestern',
    navLabel: 'Northwestern',
    navVisible: true,
  },
  {
    path: '/stanford.html',
    htmlShell: 'stanford',
    moduleKey: './pages/stanford',
    navLabel: 'Stanford',
    navVisible: true,
  },
  {
    path: '/hathi.html',
    htmlShell: 'hathi',
    moduleKey: './pages/hathi',
    navLabel: 'HathiTrust',
    navVisible: true,
  },
  {
    path: '/htrc.html',
    htmlShell: 'htrc',
    moduleKey: './pages/htrc',
    navLabel: 'HTRC',
    navVisible: true,
  },
  {
    path: '/leipzig.html',
    htmlShell: 'leipzig',
    moduleKey: './pages/leipzig',
    navLabel: 'Leipzig IIIF',
    navVisible: true,
  },
  {
    path: '/bern.html',
    htmlShell: 'bern',
    moduleKey: './pages/bern',
    navLabel: 'Bern IIIF',
    navVisible: true,
  },
];

export const navigableRoutes = routeRegistry.filter((route) => route.navVisible);
