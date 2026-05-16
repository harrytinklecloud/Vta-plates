import { apiFetch, clearCart, getCart, getSession, setCart } from "./api.js";
import {
  formatDate,
  formatMoney,
  getTodayDateString,
  hydrateConfiguredUrls,
  hideBanner,
  resolveAssetUrl,
  setActiveNav,
  setupReveal,
  showBanner
} from "./common.js";

const state = {
  products: [],
  settings: null,
  cart: getCart(),
  selectedProductId: null,
  applePayStatus: "not_started",
  quote: null,
  quoteTimer: null,
  quoteError: ""
};

const productGrid = document.getElementById("product-grid");
const selectedProductPreview = document.getElementById("selected-product-preview");
const builderForm = document.getElementById("builder-form");
const cartItems = document.getElementById("cart-items");
const cartTotal = document.getElementById("cart-total");
const discountBreakdown = document.getElementById("discount-breakdown");
const checkoutForm = document.getElementById("checkout-form");
const statusBanner = document.getElementById("shop-status");
const accountCallout = document.getElementById("account-callout");
const pickupFields = document.getElementById("pickup-fields");
const shippingFields = document.getElementById("shipping-fields");
const applePayButton = document.getElementById("apple-pay-button");
const applyCodesButton = document.getElementById("apply-codes-button");
const pickupDateInput = document.getElementById("pickup-date");
const promoCodeInput = document.getElementById("promo-code");
const creatorCodeInput = document.getElementById("creator-code");
const builderRiderNameInput = document.getElementById("builder-rider-name");

setActiveNav("shop");
hydrateConfiguredUrls();
setupReveal();

init().catch((error) => {
  showBanner(statusBanner, error.message, "error");
});

async function init() {
  await Promise.all([loadProducts(), loadSettings()]);
  state.selectedProductId = state.products[0]?.id || null;
  hydrateCustomer();
  bindEvents();
  renderProducts();
  renderBuilder();
  await renderCart();
  updateAccountCallout();
  applyPickupRules();
}

async function loadProducts() {
  const response = await apiFetch("/products", { method: "GET" });
  state.products = response.products || [];
}

async function loadSettings() {
  const response = await apiFetch("/settings", { method: "GET" });
  state.settings = response.settings;
}

function hydrateCustomer() {
  const session = getSession();
  if (!session?.user) return;

  document.getElementById("customer-name").value = session.user.name || "";
  document.getElementById("customer-email").value = session.user.email || "";

  if (!builderRiderNameInput.value) {
    builderRiderNameInput.value = session.user.name || "";
  }
}

function bindEvents() {
  builderForm.addEventListener("submit", handleAddToCart);
  checkoutForm.addEventListener("submit", submitOrder);
  applePayButton.addEventListener("click", handleApplePayAttempt);
  applyCodesButton.addEventListener("click", () => refreshQuote(false));

  checkoutForm.querySelectorAll('input[name="fulfillmentMode"]').forEach((input) => {
    input.addEventListener("change", () => {
      syncSegmentStates();
      toggleFulfillmentPanels();
    });
  });

  pickupDateInput.addEventListener("change", validatePickupDate);
  promoCodeInput.addEventListener("input", scheduleQuoteRefresh);
  creatorCodeInput.addEventListener("input", scheduleQuoteRefresh);
  promoCodeInput.addEventListener("blur", () => refreshQuote(true));
  creatorCodeInput.addEventListener("blur", () => refreshQuote(true));
}

function renderProducts() {
  productGrid.innerHTML = state.products
    .map((product) => {
      const isSelected = product.id === state.selectedProductId;

      return `
        <article class="product-card product-card-selectable ${isSelected ? "is-selected" : ""}">
          <div class="product-art">
            <img src="${resolveAssetUrl(product.image)}" alt="${product.imageAlt || product.name}" />
          </div>
          <div>
            <div class="detail-row">
              <div>
                <p class="eyebrow">${product.baseType}</p>
                <h3>${product.name}</h3>
              </div>
              <div class="pill accent">${formatMoney(product.price)}</div>
            </div>
            <p>${product.description}</p>
            <div class="pill-row" style="margin: 16px 0 18px">
              <span class="pill">Free vented add-on</span>
              <span class="pill">Custom numbers</span>
              <span class="pill">${product.baseType}</span>
            </div>
            <button
              class="button ${isSelected ? "button-primary" : "button-secondary"} choose-product-button"
              type="button"
              data-product-id="${product.id}"
            >
              ${isSelected ? "Selected Base" : "Choose This Base"}
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  productGrid.querySelectorAll(".choose-product-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedProductId = button.dataset.productId;
      renderProducts();
      renderBuilder();
      selectedProductPreview.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
}

function renderBuilder() {
  const product = getSelectedProduct();

  if (!product) {
    selectedProductPreview.innerHTML = `
      <article class="builder-preview-card">
        <strong>No products available</strong>
        <p class="microcopy">Add products in admin before taking orders.</p>
      </article>
    `;
    return;
  }

  selectedProductPreview.innerHTML = `
    <article class="builder-preview-card">
      <div class="builder-preview-image">
        <img src="${resolveAssetUrl(product.image)}" alt="${product.imageAlt || product.name}" />
      </div>
      <div class="builder-preview-copy">
        <p class="eyebrow">Selected base</p>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
        <div class="pill-row" style="margin-top: 16px">
          <span class="pill accent">${formatMoney(product.price)}</span>
          <span class="pill">Free vented</span>
          <span class="pill">${product.baseType}</span>
        </div>
      </div>
    </article>
  `;
}

function getSelectedProduct() {
  return state.products.find((product) => product.id === state.selectedProductId) || null;
}

async function handleAddToCart(event) {
  try {
    event.preventDefault();
    hideBanner(statusBanner);

    const product = getSelectedProduct();
    if (!product) {
      showBanner(statusBanner, "Choose a base before adding a plate.", "error");
      return;
    }

    const form = new FormData(builderForm);
    const cartItem = {
      id: crypto.randomUUID(),
      productId: product.id,
      productName: product.name,
      baseType: product.baseType,
      price: product.price,
      riderName: String(form.get("riderName") || "").trim(),
      customNumber: String(form.get("customNumber") || "").trim().toUpperCase(),
      note: String(form.get("itemNote") || "").trim(),
      vented: form.get("vented") === "on"
    };

    if (!cartItem.riderName || !cartItem.customNumber) {
      showBanner(statusBanner, "Enter the rider name and custom number before adding the plate.", "error");
      return;
    }

    state.cart.push(cartItem);
    persistCart();
    await renderCart();

    const riderName = builderRiderNameInput.value;
    builderForm.reset();
    builderRiderNameInput.value = riderName;
    document.getElementById("builder-vented").checked = true;

    showBanner(statusBanner, `${product.name} added to your build list.`, "success");
  } catch (error) {
    showBanner(statusBanner, error.message, "error");
  }
}

async function renderCart() {
  if (!state.cart.length) {
    cartItems.innerHTML = `
      <div class="cart-item">
        <strong>Your cart is empty.</strong>
        <span class="microcopy">Choose a base, customize one plate, and it will show up here.</span>
      </div>
    `;
    state.quote = null;
    renderQuote();
    return;
  }

  cartItems.innerHTML = state.cart
    .map(
      (item, index) => `
        <article class="cart-item">
          <div class="detail-row">
            <div>
              <strong>Plate ${index + 1}: ${item.productName}</strong>
              <span class="microcopy">${item.baseType} base</span>
            </div>
            <button class="button button-secondary remove-item" type="button" data-item-id="${item.id}">Remove</button>
          </div>
          <div class="pill-row" style="margin-top: 8px">
            <span class="pill">${item.riderName}</span>
            <span class="pill">#${item.customNumber}</span>
            <span class="pill">${item.vented ? "Vented" : "Standard"}</span>
          </div>
          ${item.note ? `<p style="margin-top: 10px">${item.note}</p>` : ""}
        </article>
      `
    )
    .join("");

  cartItems.querySelectorAll(".remove-item").forEach((button) => {
    button.addEventListener("click", async () => {
      state.cart = state.cart.filter((item) => item.id !== button.dataset.itemId);
      persistCart();
      await renderCart();
    });
  });

  await refreshQuote(true);
}

function persistCart() {
  setCart(state.cart);
}

function updateAccountCallout() {
  const session = getSession();

  if (session?.user) {
    accountCallout.innerHTML = `
      Signed in as <strong>${session.user.name}</strong> (${session.user.email}).
      Your order will appear on the <a href="./account.html">orders page</a> after checkout.
    `;
    return;
  }

  accountCallout.innerHTML = `
    You need an account to place and track orders.
    Create one on the <a href="./account.html">account page</a>, then come back here to check out.
  `;
}

function syncSegmentStates() {
  document.querySelectorAll(".segmented-control").forEach((control) => {
    control.querySelectorAll(".segment").forEach((segment) => {
      const input = segment.querySelector("input");
      segment.classList.toggle("active", input.checked);
    });
  });
}

function toggleFulfillmentPanels() {
  const mode = checkoutForm.querySelector('input[name="fulfillmentMode"]:checked').value;
  const isPickup = mode === "pickup";

  pickupFields.classList.toggle("hidden", !isPickup);
  shippingFields.classList.toggle("hidden", isPickup);

  document.getElementById("ship-street").required = !isPickup;
  document.getElementById("ship-city").required = !isPickup;
  document.getElementById("ship-state").required = !isPickup;
  document.getElementById("ship-zip").required = !isPickup;
  pickupDateInput.required = isPickup;
}

function applyPickupRules() {
  pickupDateInput.min = getTodayDateString();
}

function validatePickupDate() {
  const value = pickupDateInput.value;
  if (!value || !state.settings) return true;

  const blockedDates = new Set(state.settings.pickup.blackoutDates || []);
  const day = new Date(`${value}T12:00:00`).getDay();

  if (day === 0 || day === 6 || blockedDates.has(value)) {
    pickupDateInput.setCustomValidity("Pickup is not available on weekends or blocked holidays.");
    showBanner(
      statusBanner,
      `Pickup date ${formatDate(value)} is unavailable. Choose a school day that is not a holiday.`,
      "error"
    );
    return false;
  }

  pickupDateInput.setCustomValidity("");
  hideBanner(statusBanner);
  return true;
}

async function refreshQuote(silent) {
  if (!state.cart.length) {
    state.quote = null;
    state.quoteError = "";
    renderQuote();
    return true;
  }

  try {
    const response = await apiFetch("/pricing/quote", {
      method: "POST",
      body: JSON.stringify({
        items: state.cart.map((item) => ({
          productId: item.productId
        })),
        promoCodes: {
          generalCode: promoCodeInput.value.trim(),
          creatorCode: creatorCodeInput.value.trim()
        }
      })
    });

    state.quote = response.quote;
    state.quoteError = "";
    renderQuote();

    if (!silent) {
      const messages = [];
      if (state.quote.appliedCodes.generalCode) {
        messages.push(`Promo ${state.quote.appliedCodes.generalCode} applied`);
      }
      if (state.quote.appliedCodes.creatorCode) {
        messages.push(`Creator ${state.quote.appliedCodes.creatorCode} applied`);
      }

      if (messages.length) {
        showBanner(statusBanner, `${messages.join(" and ")}.`, "success");
      } else {
        showBanner(statusBanner, "No promo codes applied.", "success");
      }
    }

    return true;
  } catch (error) {
    state.quoteError = error.message;
    state.quote = {
      subtotal: state.cart.reduce((sum, item) => sum + Number(item.price || 0), 0),
      total: state.cart.reduce((sum, item) => sum + Number(item.price || 0), 0),
      discounts: [],
      appliedCodes: {
        generalCode: "",
        creatorCode: ""
      }
    };
    renderQuote();

    if (!silent || promoCodeInput.value.trim() || creatorCodeInput.value.trim()) {
      showBanner(statusBanner, error.message, "error");
    }

    return false;
  }
}

function renderQuote() {
  if (!state.quote) {
    cartTotal.textContent = formatMoney(0);
    discountBreakdown.textContent = "Total updates automatically once you add a plate.";
    return;
  }

  cartTotal.textContent = formatMoney(state.quote.total);

  const lines = [`Subtotal: ${formatMoney(state.quote.subtotal)}`];
  for (const discount of state.quote.discounts || []) {
    lines.push(`${discount.label}: -${formatMoney(discount.amount)}`);
  }
  lines.push(`Final total: ${formatMoney(state.quote.total)}`);

  if ((state.quote.discounts || []).length && state.quote.roundingNote) {
    lines.push(state.quote.roundingNote);
  }

  discountBreakdown.textContent = lines.join(" • ");
}

function scheduleQuoteRefresh() {
  if (state.quoteTimer) {
    clearTimeout(state.quoteTimer);
  }

  state.quoteTimer = window.setTimeout(() => {
    refreshQuote(true);
  }, 180);
}

async function handleApplePayAttempt() {
  hideBanner(statusBanner);
  const quoteIsValid = await refreshQuote(true);
  if (!quoteIsValid) {
    showBanner(statusBanner, state.quoteError || "Enter a valid promo code before continuing.", "error");
    return;
  }

  const total = state.quote?.total || 0;
  if (!total) {
    showBanner(statusBanner, "Add at least one plate before starting Apple Pay.", "error");
    return;
  }

  if (!window.PaymentRequest) {
    state.applePayStatus = "pending_apple_pay";
    showBanner(
      statusBanner,
      "Apple Pay is not supported in this browser, so shipping orders will be saved as pending Apple Pay review.",
      "success"
    );
    return;
  }

  try {
    const request = new PaymentRequest(
      [
        {
          supportedMethods: "https://apple.com/apple-pay",
          data: {
            merchantCapabilities: ["supports3DS"],
            supportedNetworks: ["visa", "masterCard", "amex"],
            countryCode: "US",
            currencyCode: "USD"
          }
        }
      ],
      {
        total: {
          label: "VTAPLATES Shipping Order",
          amount: {
            currency: "USD",
            value: total.toFixed(2)
          }
        }
      }
    );

    const canPay = request.canMakePayment ? await request.canMakePayment() : true;

    if (!canPay) {
      state.applePayStatus = "pending_apple_pay";
      showBanner(
        statusBanner,
        "Apple Pay is unavailable on this device, so the order will be created in pending Apple Pay mode.",
        "success"
      );
      return;
    }

    const paymentResponse = await request.show();
    await paymentResponse.complete("success");
    state.applePayStatus = "authorized";
    showBanner(statusBanner, "Apple Pay was authorized for this shipping order.", "success");
  } catch {
    state.applePayStatus = "pending_apple_pay";
    showBanner(
      statusBanner,
      "Apple Pay was not completed. The order can still be submitted in pending Apple Pay mode for manual follow-up.",
      "error"
    );
  }
}

async function submitOrder(event) {
  try {
    event.preventDefault();
    hideBanner(statusBanner);

    if (!state.cart.length) {
      showBanner(statusBanner, "Add at least one plate to your build list before checking out.", "error");
      return;
    }

    const session = getSession();
    if (!session?.token) {
      showBanner(statusBanner, "Create or sign in to an account before checking out.", "error");
      return;
    }

    const mode = checkoutForm.querySelector('input[name="fulfillmentMode"]:checked').value;
    if (mode === "pickup" && !validatePickupDate()) {
      return;
    }

    const quoteIsValid = await refreshQuote(true);
    if (!quoteIsValid) {
      showBanner(statusBanner, state.quoteError || "Enter a valid promo code before checkout.", "error");
      return;
    }

    if (mode === "shipping" && state.applePayStatus === "not_started") {
      showBanner(statusBanner, "Shipping orders need Apple Pay. Use the Apple Pay button first.", "error");
      return;
    }

    const payload = {
      customer: {
        name: document.getElementById("customer-name").value.trim(),
        email: document.getElementById("customer-email").value.trim()
      },
      items: state.cart.map((item) => ({
        productId: item.productId,
        riderName: item.riderName,
        customNumber: item.customNumber,
        vented: item.vented,
        note: item.note
      })),
      promoCodes: {
        generalCode: promoCodeInput.value.trim(),
        creatorCode: creatorCodeInput.value.trim()
      },
      note: document.getElementById("order-note").value.trim(),
      fulfillment:
        mode === "pickup"
          ? {
              mode: "pickup",
              location: state.settings.pickup.location,
              window: document.getElementById("pickup-window").value,
              date: pickupDateInput.value
            }
          : {
              mode: "shipping",
              address: {
                street: document.getElementById("ship-street").value.trim(),
                city: document.getElementById("ship-city").value.trim(),
                state: document.getElementById("ship-state").value.trim().toUpperCase(),
                zip: document.getElementById("ship-zip").value.trim()
              }
            },
      payment:
        mode === "pickup"
          ? {
              method: "pickup",
              status: "not_required"
            }
          : {
              method: "apple_pay",
              status: state.applePayStatus
            }
    };

    const response = await apiFetch("/orders", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    checkoutForm.reset();
    promoCodeInput.value = "";
    creatorCodeInput.value = "";
    state.cart = [];
    state.applePayStatus = "not_started";
    state.quote = null;
    clearCart();
    renderQuote();
    await renderCart();
    toggleFulfillmentPanels();
    hydrateCustomer();
    showBanner(
      statusBanner,
      `Order ${response.order.orderNumber} created. Track it on the account page.`,
      "success"
    );
  } catch (error) {
    showBanner(statusBanner, error.message, "error");
  }
}
