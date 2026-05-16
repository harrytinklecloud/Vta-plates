const apiBase =
  (
    new URLSearchParams(window.location.search).get("api") ||
    window.localStorage.getItem("vta-api-base") ||
    window.VTA_CONFIG?.apiBase ||
    ""
  ).replace(/\/$/, "");
const sessionKey = "vta-session";
const cartKey = "vta-cart";

function buildUrl(path) {
  return `${apiBase}${path}`;
}

export function getApiBase() {
  return apiBase;
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey) || "null");
  } catch {
    return null;
  }
}

export function setSession(session) {
  localStorage.setItem(sessionKey, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(sessionKey);
}

export function getCart() {
  try {
    return JSON.parse(localStorage.getItem(cartKey) || "[]");
  } catch {
    return [];
  }
}

export function setCart(cart) {
  localStorage.setItem(cartKey, JSON.stringify(cart));
}

export function clearCart() {
  localStorage.removeItem(cartKey);
}

export async function apiFetch(path, options = {}) {
  const session = getSession();
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  if (session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  const response = await fetch(buildUrl(path), {
    ...options,
    headers
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === "string" ? payload : payload.error || "Request failed";
    throw new Error(message);
  }

  return payload;
}
