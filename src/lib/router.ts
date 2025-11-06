import home from "../pages/home";
import harvard from "../pages/harvard";
import princeton from "../pages/princeton";
import yale from "../pages/yale";
import dataverse from "../pages/dataverse";
import ubc from "../pages/ubc";
import ubcOai from "../pages/ubcOai";
import arxiv from "../pages/arxiv";

type PageMount = (el: HTMLElement) => void;

type RouteTable = Record<string, PageMount>;

const routes: RouteTable = {
  "/": home,
  "/index.html": home,
  "/harvard": harvard,
  "/harvard.html": harvard,
  "/princeton": princeton,
  "/princeton.html": princeton,
  "/yale": yale,
  "/yale.html": yale,
  "/dataverse": dataverse,
  "/dataverse.html": dataverse,
  "/ubc": ubc,
  "/ubc.html": ubc,
  "/ubc-oai": ubcOai,
  "/ubc-oai.html": ubcOai,
  "/arxiv": arxiv,
  "/arxiv.html": arxiv
};

const BASE_URL = import.meta.env.BASE_URL ?? "/";

const normalizePath = (pathname: string): string => {
  let normalized = pathname || "/";

  if (BASE_URL !== "/" && normalized.startsWith(BASE_URL)) {
    const trimmed = normalized.slice(BASE_URL.length);
    normalized = `/${trimmed}`;
  }

  normalized = normalized.replace(/\/+/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized || "/";
};

export const resolvePage = (pathname: string): PageMount => {
  const normalized = normalizePath(pathname);
  return routes[normalized] ?? home;
};
