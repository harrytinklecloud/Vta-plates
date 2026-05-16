import { hydrateConfiguredUrls, setActiveNav, setupReveal } from "./common.js";

setActiveNav(document.body.dataset.page || "home");
hydrateConfiguredUrls();
setupReveal();
