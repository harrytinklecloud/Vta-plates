export const ORDER_FLOW = ["Received", "Printing", "Ready to Pickup", "Pickup / Shipped"];

export function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

export function getAppConfig() {
  return window.VTA_CONFIG || {};
}

export function resolveAssetUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path) || path.startsWith("data:")) return path;

  const assetBase = String(getAppConfig().assetBase || "").replace(/\/$/, "");
  if (!assetBase) return path;

  return `${assetBase}${path.startsWith("/") ? path : `/${path}`}`;
}

export function hydrateConfiguredUrls() {
  const config = getAppConfig();

  document.querySelectorAll("[data-config-link='tiktok']").forEach((link) => {
    if (config.tiktokUrl) {
      link.setAttribute("href", config.tiktokUrl);
    }
  });

  document.querySelectorAll("[data-config-src]").forEach((element) => {
    const path = element.getAttribute("data-config-src");
    if (path) {
      element.setAttribute("src", resolveAssetUrl(path));
    }
  });
}

export function formatDate(value) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${value}T12:00:00`));
}

export function slugifyStatus(status) {
  return status.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function showBanner(element, message, type = "success") {
  if (!element) return;

  element.textContent = message;
  element.className = `banner is-visible ${type === "error" ? "is-error" : "is-success"}`;
}

export function hideBanner(element) {
  if (!element) return;
  element.textContent = "";
  element.className = "banner";
}

export function setupReveal() {
  const items = document.querySelectorAll(".reveal");

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    {
      threshold: 0.14
    }
  );

  items.forEach((item) => {
    const rect = item.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) {
      item.classList.add("is-visible");
      return;
    }

    observer.observe(item);
  });
}

export function setActiveNav(page) {
  const lookup = {
    home: new Set(["/index.html", "./index.html", "../index.html"]),
    shop: new Set(["/shop.html", "./shop.html", "../shop.html"]),
    account: new Set(["/account.html", "./account.html", "../account.html"]),
    admin: new Set(["/admin/index.html", "./admin/index.html", "../admin/index.html"])
  };

  document.querySelectorAll(".nav a").forEach((link) => {
    const href = link.getAttribute("href");
    if (lookup[page]?.has(href)) {
      link.classList.add("is-active");
    }
  });
}

export function buildTimelineMarkup(status) {
  const steps = ["Received", "Printing", "Ready to Pickup", "Pickup / Shipped"];
  const activeIndex = Math.max(0, steps.findIndex((step) => step === status || (step === "Pickup / Shipped" && ["Picked Up", "Shipped"].includes(status))));

  return `
    <div class="timeline-bar">
      ${steps
        .map((step, index) => {
          const complete = index <= activeIndex;
          const stateClass = complete ? (index === activeIndex ? "is-current" : "is-complete") : "";

          return `
            <div class="timeline-stage ${stateClass}">
              <span></span>
              <small>${step}</small>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

export function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}
