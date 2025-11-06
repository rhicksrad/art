const ROUTES = [
  { href: "", label: "Home" },
  { href: "harvard.html", label: "Harvard" },
  { href: "princeton.html", label: "Princeton" },
  { href: "yale.html", label: "Yale" },
  { href: "dataverse.html", label: "Dataverse" },
  { href: "ubc.html", label: "UBC" },
  { href: "ubc-oai.html", label: "UBC OAI" },
  { href: "arxiv.html", label: "arXiv" }
];

const isCurrentPath = (href: string): boolean => {
  const normalizedHref = href.endsWith("/") ? href.slice(0, -1) : href;
  const pathname = window.location.pathname.endsWith("/")
    ? window.location.pathname.slice(0, -1)
    : window.location.pathname;
  return normalizedHref === pathname;
};

export const createSiteNav = (base: string): HTMLElement => {
  const nav = document.createElement("nav");
  nav.className = "site-nav";

  ROUTES.forEach((route) => {
    const link = document.createElement("a");
    const normalizedHref = `${base}${route.href}`;
    link.setAttribute("href", normalizedHref);
    link.textContent = route.label;
    link.className = "site-nav__link";

    if (
      normalizedHref === window.location.pathname ||
      `${normalizedHref}/` === window.location.pathname ||
      isCurrentPath(normalizedHref)
    ) {
      link.setAttribute("aria-current", "page");
      link.classList.add("site-nav__link--current");
    }

    nav.appendChild(link);
  });

  return nav;
};
