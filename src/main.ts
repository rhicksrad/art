import { createSiteHeader } from "./components/SiteHeader";
import { createSiteNav } from "./components/SiteNav";
import { resolvePage } from "./lib/router";

const base = import.meta.env.BASE_URL ?? "/";

const appRoot = document.getElementById("app");

if (!appRoot) {
  throw new Error("Missing #app container");
}

appRoot.innerHTML = "";

const header = createSiteHeader();
const nav = createSiteNav(base);
const main = document.createElement("main");
main.className = "site-main";

appRoot.append(header, nav, main);

const mount = resolvePage(window.location.pathname);
mount(main);
