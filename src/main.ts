import { resolvePage } from "./lib/router";

const base = import.meta.env.BASE_URL ?? "/";

const routes = [
  { href: "", label: "Home" },
  { href: "harvard.html", label: "Harvard" },
  { href: "princeton.html", label: "Princeton" },
  { href: "yale.html", label: "Yale" },
  { href: "dataverse.html", label: "Dataverse" },
  { href: "ubc.html", label: "UBC" },
  { href: "ubc-oai.html", label: "UBC OAI" },
  { href: "arxiv.html", label: "arXiv" }
];

const appRoot = document.getElementById("app");

if (!appRoot) {
  throw new Error("Missing #app container");
}

appRoot.innerHTML = "";

const header = document.createElement("header");
const title = document.createElement("h1");
title.textContent = "Academic Resource Toolkit";
header.appendChild(title);

const nav = document.createElement("nav");
routes.forEach((route) => {
  const link = document.createElement("a");
  const normalizedHref = `${base}${route.href}`;
  link.setAttribute("href", normalizedHref);
  link.textContent = route.label;
  if (normalizedHref === window.location.pathname ||
      normalizedHref === `${window.location.pathname}/`) {
    link.setAttribute("aria-current", "page");
  }
  nav.appendChild(link);
});

const main = document.createElement("main");

appRoot.appendChild(header);
appRoot.appendChild(nav);
appRoot.appendChild(main);

const mount = resolvePage(window.location.pathname);
mount(main);
