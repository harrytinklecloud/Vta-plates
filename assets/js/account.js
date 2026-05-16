import { apiFetch, clearSession, getSession, setSession } from "./api.js";
import {
  buildTimelineMarkup,
  formatDate,
  formatMoney,
  hydrateConfiguredUrls,
  hideBanner,
  setActiveNav,
  setupReveal,
  showBanner,
  slugifyStatus
} from "./common.js";

const authStatus = document.getElementById("auth-status");
const ordersStatus = document.getElementById("orders-status");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const ordersList = document.getElementById("orders-list");
const ordersTitle = document.getElementById("orders-title");
const logoutButton = document.getElementById("logout-button");

setActiveNav("account");
hydrateConfiguredUrls();
setupReveal();
bindEvents();
hydrate().catch((error) => showBanner(ordersStatus, error.message, "error"));

function bindEvents() {
  document.querySelectorAll('input[name="authMode"]').forEach((input) => {
    input.addEventListener("change", syncAuthTabs);
  });

  loginForm.addEventListener("submit", handleLogin);
  registerForm.addEventListener("submit", handleRegister);
  logoutButton.addEventListener("click", handleLogout);
}

async function hydrate() {
  syncAuthTabs();
  const session = getSession();

  if (!session?.token) {
    renderSignedOut();
    return;
  }

  await refreshOrders();
}

function syncAuthTabs() {
  document.querySelectorAll(".auth-tabs .segment").forEach((segment) => {
    segment.classList.toggle("active", segment.querySelector("input").checked);
  });

  const mode = document.querySelector('input[name="authMode"]:checked').value;
  loginForm.classList.toggle("hidden", mode !== "login");
  registerForm.classList.toggle("hidden", mode !== "register");
}

async function handleLogin(event) {
  event.preventDefault();
  try {
    hideBanner(authStatus);

    const data = new FormData(loginForm);
    const response = await apiFetch("/login", {
      method: "POST",
      body: JSON.stringify({
        email: String(data.get("email") || "").trim(),
        password: String(data.get("password") || "")
      })
    });

    setSession(response.session);
    loginForm.reset();
    showBanner(authStatus, "Signed in successfully.", "success");
    await refreshOrders();
  } catch (error) {
    showBanner(authStatus, error.message, "error");
  }
}

async function handleRegister(event) {
  event.preventDefault();
  try {
    hideBanner(authStatus);

    const data = new FormData(registerForm);
    const response = await apiFetch("/register", {
      method: "POST",
      body: JSON.stringify({
        name: String(data.get("name") || "").trim(),
        email: String(data.get("email") || "").trim(),
        password: String(data.get("password") || "")
      })
    });

    setSession(response.session);
    registerForm.reset();
    showBanner(authStatus, "Account created and signed in.", "success");
    await refreshOrders();
  } catch (error) {
    showBanner(authStatus, error.message, "error");
  }
}

async function refreshOrders() {
  const session = getSession();
  if (!session?.token) {
    renderSignedOut();
    return;
  }

  const response = await apiFetch("/orders", { method: "GET" });
  renderOrders(response.orders || [], response.user || session.user);
}

function renderSignedOut() {
  ordersTitle.textContent = "Your tracker";
  ordersList.innerHTML = `
    <article class="order-card">
      <h3>Sign in to view orders</h3>
      <p>Create an account or sign in to track every plate from Received through Pickup / Shipped.</p>
    </article>
  `;
  logoutButton.classList.add("hidden");
}

function renderOrders(orders, user) {
  ordersTitle.textContent = `${user.name}'s orders`;
  logoutButton.classList.remove("hidden");
  hideBanner(ordersStatus);

  if (!orders.length) {
    ordersList.innerHTML = `
      <article class="order-card">
        <h3>No orders yet</h3>
        <p>Open the <a href="./shop.html">shop</a> to build your first plate.</p>
      </article>
    `;
    return;
  }

  ordersList.innerHTML = orders
    .map(
      (order) => `
        <article class="order-card">
          <header>
            <div>
              <p class="eyebrow">${order.orderNumber}</p>
              <h3>${formatMoney(order.amount)} • ${order.fulfillment.mode === "pickup" ? "Pickup" : "Shipping"}</h3>
            </div>
            <span class="status-badge status-${slugifyStatus(order.status)}">${order.status}</span>
          </header>
          <div class="pill-row" style="margin-bottom: 16px">
            <span class="pill">${formatDate(order.createdAt.slice(0, 10))}</span>
            <span class="pill">${order.payment.method === "pickup" ? "Pickup payment" : "Apple Pay"}</span>
            <span class="pill">${order.fulfillment.mode === "pickup" ? order.fulfillment.window : "Ship to address"}</span>
          </div>
          <p>${order.items.map((item) => `${item.productName} #${item.customNumber}`).join(" • ")}</p>
          ${
            order.pricing?.discounts?.length
              ? `<p style="margin-top: 10px">Codes used: ${order.pricing.discounts.map((discount) => discount.code).join(" • ")}</p>`
              : ""
          }
          ${buildTimelineMarkup(order.status)}
        </article>
      `
    )
    .join("");
}

function handleLogout() {
  clearSession();
  renderSignedOut();
  showBanner(ordersStatus, "You have been logged out.", "success");
}
