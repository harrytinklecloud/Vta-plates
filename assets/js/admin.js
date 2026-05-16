import { apiFetch, clearSession, getSession, setSession } from "./api.js";
import {
  buildTimelineMarkup,
  formatDate,
  formatMoney,
  hydrateConfiguredUrls,
  hideBanner,
  resolveAssetUrl,
  setActiveNav,
  setupReveal,
  showBanner,
  slugifyStatus
} from "./common.js";

const authStatus = document.getElementById("admin-auth-status");
const panelStatus = document.getElementById("admin-panel-status");
const loginForm = document.getElementById("admin-login-form");
const logoutButton = document.getElementById("admin-logout-button");
const activeOrders = document.getElementById("active-orders");
const pastOrders = document.getElementById("past-orders");
const productsContainer = document.getElementById("admin-products");
const codesContainer = document.getElementById("admin-codes");
const settingsForm = document.getElementById("settings-form");

const state = {
  products: [],
  codes: [],
  orders: [],
  pastOrders: [],
  settings: null
};

setActiveNav("admin");
hydrateConfiguredUrls();
setupReveal();
bindEvents();
hydrate().catch((error) => showBanner(panelStatus, error.message, "error"));

function bindEvents() {
  loginForm.addEventListener("submit", handleLogin);
  logoutButton.addEventListener("click", handleLogout);
  document.getElementById("refresh-orders").addEventListener("click", () => loadAdminData());
  document.getElementById("new-product-button").addEventListener("click", createEmptyProductCard);
  document.getElementById("new-code-button").addEventListener("click", createEmptyCodeCard);
  settingsForm.addEventListener("submit", saveSettings);

  document.querySelectorAll('input[name="adminTab"]').forEach((input) => {
    input.addEventListener("change", syncAdminTabs);
  });
}

async function hydrate() {
  syncAdminTabs();
  const session = getSession();
  if (!session?.token || session.user?.role !== "admin") {
    renderLoggedOutState();
    return;
  }

  await loadAdminData();
}

function syncAdminTabs() {
  document.querySelectorAll(".admin-tabs .segment").forEach((segment) => {
    segment.classList.toggle("active", segment.querySelector("input").checked);
  });

  const current = document.querySelector('input[name="adminTab"]:checked').value;
  document.getElementById("admin-orders-panel").classList.toggle("hidden", current !== "orders");
  document.getElementById("admin-past-panel").classList.toggle("hidden", current !== "past");
  document.getElementById("admin-products-panel").classList.toggle("hidden", current !== "products");
  document.getElementById("admin-codes-panel").classList.toggle("hidden", current !== "codes");
  document.getElementById("admin-settings-panel").classList.toggle("hidden", current !== "settings");
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

    if (response.session.user.role !== "admin") {
      throw new Error("This account does not have admin access.");
    }

    setSession(response.session);
    showBanner(authStatus, "Admin session ready.", "success");
    await loadAdminData();
  } catch (error) {
    showBanner(authStatus, error.message, "error");
  }
}

async function loadAdminData() {
  const [productsResponse, ordersResponse, settingsResponse, codesResponse] = await Promise.all([
    apiFetch("/admin/products", { method: "GET" }),
    apiFetch("/admin/orders", { method: "GET" }),
    apiFetch("/admin/settings", { method: "GET" }),
    apiFetch("/admin/codes", { method: "GET" })
  ]);

  state.products = productsResponse.products || [];
  state.orders = ordersResponse.orders || [];
  state.pastOrders = ordersResponse.pastOrders || [];
  state.settings = settingsResponse.settings;
  state.codes = codesResponse.codes || [];

  renderLoggedInState();
  renderOrders();
  renderPastOrders();
  renderProducts();
  renderCodes();
  populateSettings();
}

function renderLoggedInState() {
  logoutButton.classList.remove("hidden");
  hideBanner(panelStatus);
}

function renderLoggedOutState() {
  logoutButton.classList.add("hidden");
  activeOrders.innerHTML = `<article class="order-card"><h3>Admin login required</h3><p>Use the admin password to open the packer dashboard.</p></article>`;
  pastOrders.innerHTML = "";
  productsContainer.innerHTML = "";
  codesContainer.innerHTML = "";
}

function renderOrders() {
  if (!state.orders.length) {
    activeOrders.innerHTML = `<article class="order-card"><h3>No active orders</h3><p>The live queue is empty right now.</p></article>`;
    return;
  }

  activeOrders.innerHTML = state.orders
    .map(
      (order) => `
        <article class="order-card">
          <header>
            <div>
              <p class="eyebrow">${order.orderNumber}</p>
              <h3>${order.customer.name} • ${formatMoney(order.amount)}</h3>
            </div>
            <span class="status-badge status-${slugifyStatus(order.status)}">${order.status}</span>
          </header>

          <div class="pill-row" style="margin-bottom: 16px">
            <span class="pill">${order.fulfillment.mode === "pickup" ? "Pickup" : "Shipped"}</span>
            <span class="pill">${order.customer.email}</span>
            <span class="pill">${formatDate(order.createdAt.slice(0, 10))}</span>
          </div>

          <p>${order.items.map((item) => `${item.productName} #${item.customNumber} (${item.riderName})`).join(" • ")}</p>
          <p style="margin-top: 10px">
            ${
              order.fulfillment.mode === "pickup"
                ? `${order.fulfillment.location} • ${order.fulfillment.window} • ${formatDate(order.fulfillment.date)}`
                : `${order.fulfillment.address.street}, ${order.fulfillment.address.city}, ${order.fulfillment.address.state} ${order.fulfillment.address.zip}`
            }
          </p>
          ${
            order.pricing?.discounts?.length
              ? `<p style="margin-top: 10px">Codes used: ${order.pricing.discounts.map((discount) => `${discount.code} (-${formatMoney(discount.amount)})`).join(" • ")}</p>`
              : `<p style="margin-top: 10px">Codes used: none</p>`
          }

          ${buildTimelineMarkup(order.status)}

          <div class="order-actions" style="margin-top: 18px">
            <select data-order-id="${order.id}" class="status-select">
              ${["Received", "Printing", "Ready to Pickup", "Pickup / Shipped", "Picked Up", "Shipped"]
                .map(
                  (status) => `
                    <option value="${status}" ${order.status === status ? "selected" : ""}>${status}</option>
                  `
                )
                .join("")}
            </select>
            <div class="pill-row">
              <button class="button button-secondary save-status" type="button" data-order-id="${order.id}">Save Status</button>
              <button class="button button-primary archive-order" type="button" data-order-id="${order.id}">Mark Done</button>
            </div>
          </div>
        </article>
      `
    )
    .join("");

  activeOrders.querySelectorAll(".save-status").forEach((button) => {
    button.addEventListener("click", () => saveOrder(button.dataset.orderId, false));
  });

  activeOrders.querySelectorAll(".archive-order").forEach((button) => {
    button.addEventListener("click", () => saveOrder(button.dataset.orderId, true));
  });
}

function renderPastOrders() {
  if (!state.pastOrders.length) {
    pastOrders.innerHTML = `<article class="order-card"><h3>No archived orders</h3><p>Finished jobs will show up here after they are marked done.</p></article>`;
    return;
  }

  pastOrders.innerHTML = state.pastOrders
    .map(
      (order) => `
        <article class="order-card">
          <header>
            <div>
              <p class="eyebrow">${order.orderNumber}</p>
              <h3>${order.customer.name}</h3>
            </div>
            <span class="status-badge status-${slugifyStatus(order.status)}">${order.status}</span>
          </header>
          <p>${order.items.map((item) => `${item.productName} #${item.customNumber}`).join(" • ")}</p>
          ${
            order.pricing?.discounts?.length
              ? `<p style="margin-top: 10px">Codes used: ${order.pricing.discounts.map((discount) => discount.code).join(" • ")}</p>`
              : ""
          }
          <div class="order-actions" style="margin-top: 18px">
            <button class="button button-secondary restore-order" type="button" data-order-id="${order.id}">Move Back To Active</button>
          </div>
        </article>
      `
    )
    .join("");

  pastOrders.querySelectorAll(".restore-order").forEach((button) => {
    button.addEventListener("click", () => restoreOrder(button.dataset.orderId));
  });
}

function renderProducts() {
  productsContainer.innerHTML = state.products
    .map(
      (product) => `
        <article class="admin-product-card">
          <form class="admin-product-form" data-product-id="${product.id}">
            <div class="inline-form-row">
              <label>
                Name
                <input name="name" type="text" value="${product.name}" required />
              </label>
              <label>
                Base type
                <input name="baseType" type="text" value="${product.baseType}" required />
              </label>
            </div>
            <div class="inline-form-row">
              <label>
                Price
                <input name="price" type="number" min="0" value="${product.price}" required />
              </label>
              <label>
                Accent
                <input name="accent" type="text" value="${product.accent || ""}" />
              </label>
            </div>
            <label>
              Description
              <textarea name="description" rows="3" required>${product.description}</textarea>
            </label>
            <label>
              Image URL or data URL
              <input name="image" type="text" value="${product.image}" required />
            </label>
            <label>
              Upload custom image
              <input name="imageFile" type="file" accept="image/*" />
            </label>
            <button class="button button-primary" type="submit">Save Product</button>
          </form>
        </article>
      `
    )
    .join("");

  productsContainer.querySelectorAll(".admin-product-form").forEach((form) => {
    form.addEventListener("submit", saveProduct);
    const fileInput = form.querySelector('input[name="imageFile"]');
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      form.querySelector('input[name="image"]').value = await fileToDataUrl(file);
    });
  });
}

function renderCodes() {
  codesContainer.innerHTML = state.codes
    .map(
      (code) => `
        <article class="admin-product-card">
          <form class="admin-code-form" data-code-id="${code.id}">
            <div class="inline-form-row">
              <label>
                Code
                <input name="code" type="text" value="${code.code}" required />
              </label>
              <label>
                Type
                <select name="type">
                  <option value="flat" ${code.type === "flat" ? "selected" : ""}>Flat discount</option>
                  <option value="percentage" ${code.type === "percentage" ? "selected" : ""}>Percentage discount</option>
                  <option value="creator" ${code.type === "creator" ? "selected" : ""}>Creator discount</option>
                </select>
              </label>
            </div>
            <div class="inline-form-row">
              <label>
                Value
                <input name="value" type="number" min="0" step="0.01" value="${code.value}" required />
              </label>
              <label>
                Creator name
                <input name="creatorName" type="text" value="${code.creatorName || ""}" placeholder="Only for creator codes" />
              </label>
            </div>
            <label class="full-span">
              <input name="active" type="checkbox" ${code.active ? "checked" : ""} />
              Code is active
            </label>
            <button class="button button-primary" type="submit">Save Code</button>
          </form>
        </article>
      `
    )
    .join("");

  codesContainer.querySelectorAll(".admin-code-form").forEach((form) => {
    form.addEventListener("submit", saveCode);
    const typeSelect = form.querySelector('select[name="type"]');
    const valueInput = form.querySelector('input[name="value"]');
    const creatorNameInput = form.querySelector('input[name="creatorName"]');

    const syncType = () => {
      const isCreator = typeSelect.value === "creator";
      creatorNameInput.required = isCreator;
      if (isCreator) {
        valueInput.value = "2";
      }
    };

    typeSelect.addEventListener("change", syncType);
    syncType();
  });
}

function createEmptyProductCard() {
  state.products.unshift({
    id: `product-${crypto.randomUUID().slice(0, 8)}`,
    name: "New Plate",
    baseType: "Custom",
    price: 20,
    accent: "#A8FF5A",
    description: "Describe this plate listing.",
    image: resolveAssetUrl("/assets/images/plate-motocutz.svg")
  });

  renderProducts();
  document.querySelector('input[name="adminTab"][value="products"]').checked = true;
  syncAdminTabs();
}

function createEmptyCodeCard() {
  state.codes.unshift({
    id: `code-${crypto.randomUUID().slice(0, 8)}`,
    code: "NEWCODE",
    type: "flat",
    value: 5,
    creatorName: "",
    active: true
  });

  renderCodes();
  document.querySelector('input[name="adminTab"][value="codes"]').checked = true;
  syncAdminTabs();
}

async function saveProduct(event) {
  event.preventDefault();
  try {
    hideBanner(panelStatus);

    const form = new FormData(event.currentTarget);
    const productId = event.currentTarget.dataset.productId;

    await apiFetch(`/admin/products/${productId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: String(form.get("name") || "").trim(),
        baseType: String(form.get("baseType") || "").trim(),
        price: Number(form.get("price") || 0),
        accent: String(form.get("accent") || "").trim(),
        description: String(form.get("description") || "").trim(),
        image: String(form.get("image") || "").trim()
      })
    });

    showBanner(panelStatus, "Product updated.", "success");
    await loadAdminData();
  } catch (error) {
    showBanner(panelStatus, error.message, "error");
  }
}

async function saveCode(event) {
  event.preventDefault();
  try {
    hideBanner(panelStatus);

    const form = new FormData(event.currentTarget);
    const codeId = event.currentTarget.dataset.codeId;
    const type = String(form.get("type") || "flat");

    await apiFetch(`/admin/codes/${codeId}`, {
      method: "PATCH",
      body: JSON.stringify({
        code: String(form.get("code") || "").trim().toUpperCase(),
        type,
        value: type === "creator" ? 2 : Number(form.get("value") || 0),
        creatorName: String(form.get("creatorName") || "").trim(),
        active: form.get("active") === "on"
      })
    });

    showBanner(panelStatus, "Promo code updated.", "success");
    await loadAdminData();
  } catch (error) {
    showBanner(panelStatus, error.message, "error");
  }
}

function populateSettings() {
  settingsForm.elements.pickupLocation.value = state.settings.pickup.location || "";
  settingsForm.elements.tiktokUrl.value = state.settings.tiktokUrl || "";
  settingsForm.elements.blackoutDates.value = (state.settings.pickup.additionalBlackoutDates || []).join("\n");
  settingsForm.elements.pickupWindows.value = (state.settings.pickup.windows || []).join(", ");
}

async function saveSettings(event) {
  event.preventDefault();
  try {
    hideBanner(panelStatus);

    const blackoutDates = String(settingsForm.elements.blackoutDates.value || "")
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);

    const windows = String(settingsForm.elements.pickupWindows.value || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    await apiFetch("/admin/settings", {
      method: "PUT",
      body: JSON.stringify({
        pickupLocation: settingsForm.elements.pickupLocation.value.trim(),
        tiktokUrl: settingsForm.elements.tiktokUrl.value.trim(),
        blackoutDates,
        pickupWindows: windows
      })
    });

    showBanner(panelStatus, "Settings saved.", "success");
    await loadAdminData();
  } catch (error) {
    showBanner(panelStatus, error.message, "error");
  }
}

async function saveOrder(orderId, archive) {
  try {
    hideBanner(panelStatus);
    const select = document.querySelector(`select[data-order-id="${orderId}"]`);

    await apiFetch(`/admin/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: select.value,
        archived: archive
      })
    });

    showBanner(panelStatus, archive ? "Order moved to past orders." : "Order status saved.", "success");
    await loadAdminData();
  } catch (error) {
    showBanner(panelStatus, error.message, "error");
  }
}

async function restoreOrder(orderId) {
  try {
    hideBanner(panelStatus);

    await apiFetch(`/admin/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({
        archived: false
      })
    });

    showBanner(panelStatus, "Order moved back to active.", "success");
    await loadAdminData();
  } catch (error) {
    showBanner(panelStatus, error.message, "error");
  }
}

function handleLogout() {
  clearSession();
  renderLoggedOutState();
  showBanner(authStatus, "Logged out.", "success");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}
