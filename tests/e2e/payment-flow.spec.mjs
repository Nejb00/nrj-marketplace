import { test, expect } from "@playwright/test";

const FAKE_USER_ID = "00000000-0000-4000-8000-000000000023";
const FAKE_ORDER_ID = "00000000-0000-4000-8000-000000000123";
const FAKE_PAYMENT_ID = "00000000-0000-4000-8000-000000000223";
const FAKE_PROVIDER_REFERENCE = "E2E-OPENPAY-023";
const FAKE_PRODUCT = {
  id: 23023,
  name: "Produit E2E NRJ",
  price: 12_500,
  category_id: null,
  image: null,
  popularity_score: 100,
  created_at: "2026-10-05T00:00:00.000Z",
  moq: 1,
  tailles: "",
  couleurs: "",
};

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

function makeUser() {
  return {
    id: FAKE_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: null,
    phone: null,
    app_metadata: {},
    user_metadata: {},
  };
}

function makeSession() {
  return {
    access_token: "e2e-access-token",
    refresh_token: "e2e-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: makeUser(),
  };
}

async function installSafeBackendMocks(page) {
  const calls = {
    createOrder: [],
    createPayment: [],
    paymentStatus: [],
  };

  await page.route("**/auth/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith("/auth/v1/signup")) {
      await route.fulfill(jsonResponse(makeSession(), 200));
      return;
    }

    if (url.pathname.endsWith("/auth/v1/user")) {
      await route.fulfill(jsonResponse(makeUser(), 200));
      return;
    }

    if (url.pathname.endsWith("/auth/v1/settings")) {
      await route.fulfill(jsonResponse({
        external: {},
        disable_signup: false,
        anonymous_users_enabled: true,
      }));
      return;
    }

    await route.fulfill(jsonResponse({}, 200));
  });

  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith("/rest/v1/products")) {
      // Catalogue: tableau. Fiche produit via .single(): objet JSON.
      const isSingleProduct = url.searchParams.get("id") === `eq.${FAKE_PRODUCT.id}`;
      await route.fulfill(jsonResponse(isSingleProduct ? FAKE_PRODUCT : [FAKE_PRODUCT]));
      return;
    }

    if (url.pathname.endsWith("/rest/v1/categories")) {
      await route.fulfill(jsonResponse([]));
      return;
    }

    if (url.pathname.includes("/rest/v1/rpc/")) {
      await route.fulfill(jsonResponse([]));
      return;
    }

    await route.fulfill(jsonResponse([], 200));
  });

  await page.route("**/functions/v1/create-order", async (route) => {
    const payload = JSON.parse(route.request().postData() || "{}");
    calls.createOrder.push(payload);

    expect(payload.payment_method).toBe("openpay_mtn");
    expect(payload.phone).toBe("242061234567");
    expect(payload.items).toEqual([
      {
        productId: FAKE_PRODUCT.id,
        quantity: 1,
        taille: null,
        couleur: null,
      },
    ]);
    expect(typeof payload.idempotency_key).toBe("string");
    expect(payload.idempotency_key.length).toBeGreaterThanOrEqual(16);

    await route.fulfill(jsonResponse({
      ok: true,
      order_id: FAKE_ORDER_ID,
      total: FAKE_PRODUCT.price,
      payment_method: "openpay_mtn",
      status: "pending",
      reused: false,
    }, 201));
  });

  await page.route("**/functions/v1/payment-openpay", async (route) => {
    const payload = JSON.parse(route.request().postData() || "{}");

    if (payload.action === "create") {
      calls.createPayment.push(payload);
      expect(payload.order_id).toBe(FAKE_ORDER_ID);
      expect(payload.currency).toBe("XAF");
      expect(payload.operator).toBe("MTN");
      expect(payload.payment_phone_number).toBe("242061234567");
      expect(typeof payload.idempotency_key).toBe("string");
      expect(payload.idempotency_key.length).toBeGreaterThanOrEqual(16);

      // Deliberately never declare the payment paid at creation time.
      await route.fulfill(jsonResponse({
        ok: true,
        reused: false,
        payment_id: FAKE_PAYMENT_ID,
        provider_reference: FAKE_PROVIDER_REFERENCE,
        status: "processing",
      }));
      return;
    }

    if (payload.action === "status") {
      calls.paymentStatus.push(payload);
      expect(payload.provider_reference).toBe(FAKE_PROVIDER_REFERENCE);

      await route.fulfill(jsonResponse({
        ok: true,
        provider_reference: FAKE_PROVIDER_REFERENCE,
        status: "success",
      }));
      return;
    }

    throw new Error("Action paiement inattendue dans le test E2E");
  });

  return calls;
}

test.describe("NRJ Marketplace — paiement E2E sécurisé", () => {
  test("catalogue → panier → checkout → création → statut provider → commande payée", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    const calls = await installSafeBackendMocks(page);

    await page.goto("/");
    await expect(page.locator("#tapToSearch")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#filterBar .filter-btn").first()).toBeVisible({ timeout: 20_000 });

    const productCard = page.locator("#productsGrid .product-card").first();
    await expect(productCard).toBeVisible({ timeout: 20_000 });
    await productCard.click();

    await expect(page.locator("#productModal")).toHaveClass(/\bopen\b/);
    await page.locator("#addToCartStickyBtn").click();

    // addToCart() persists asynchronously; wait for the browser's durable state
    // before closing the product modal, otherwise the E2E can race the save.
    await expect.poll(
      async () => page.evaluate(() => {
        const cart = JSON.parse(localStorage.getItem("nrj_cart_v32") || "[]");
        return cart.length;
      }),
      { timeout: 10_000 }
    ).toBe(1);

    await page.locator("#modalCloseBtn").click();

    await page.locator('a[data-nav="cart"]').click();
    await expect(page.locator("#cartPanel")).toHaveClass(/\bopen\b/);
    await expect(page.locator(".cart-item").first()).toBeVisible();
    await expect(page.locator("#checkoutBtn")).toBeEnabled();

    await page.locator("#checkoutBtn").click();
    await expect(page.locator("#orderModalOverlay")).toHaveClass(/\bopen\b/);

    await page.locator("#customerName").fill("Client E2E NRJ");
    await page.locator("#customerPhone").fill("242061234567");
    await page.locator("#paymentOperator").selectOption("MTN");

    const paymentButton = page.locator("#startMobileMoneyBtn");
    await expect(paymentButton).toBeEnabled();

    await paymentButton.click();

    await expect(page.locator("#orderModalOverlay")).not.toHaveClass(/\bopen\b/, {
      timeout: 20_000,
    });

    expect(calls.createOrder).toHaveLength(1);
    expect(calls.createPayment).toHaveLength(1);
    expect(calls.paymentStatus).toHaveLength(1);

    const orders = await page.evaluate(() => JSON.parse(localStorage.getItem("nrj_orders") || "[]"));
    expect(orders.some((order) => order.remoteOrderId === FAKE_ORDER_ID && order.syncStatus === "paid")).toBe(true);

    const cart = await page.evaluate(() => JSON.parse(localStorage.getItem("nrj_cart_v32") || "[]"));
    expect(cart).toEqual([]);

    // Le checkout peut laisser le panneau panier ouvert après vidage.
    // Fermer l'overlay s'il est visible avant de renaviguer vers le panier.
    const cartCloseButton = page.locator("#cartCloseBtn");
    if (await cartCloseButton.isVisible()) {
      await cartCloseButton.click();
    }
    await page.locator('a[data-nav="cart"]').click();
    await expect(page.locator("#cartPanel")).toHaveClass(/\bopen\b/);
    await expect(page.locator("#cartEmptyTitle")).toBeVisible();

    expect(pageErrors).toEqual([]);
  });
});
