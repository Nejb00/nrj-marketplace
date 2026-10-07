import { test, expect } from "@playwright/test";

const PRODUCT_ID = 42424;
const WHITE_VARIANT_ID = "11111111-1111-4111-8111-111111111111";
const RED_VARIANT_ID = "22222222-2222-4222-8222-222222222222";

const PRODUCT = {
  id: PRODUCT_ID,
  name: "Passoire test variantes",
  price: 4_500,
  category_id: null,
  image: "https://example.com/legacy.jpg",
  image2: null,
  image3: null,
  image4: null,
  image5: null,
  image6: null,
  popularity_score: 0,
  created_at: "2026-10-07T00:00:00.000Z",
  moq: 1,
  tailles: "",
  couleurs: "",
};

const VARIANTS = [
  {
    id: WHITE_VARIANT_ID,
    product_id: PRODUCT_ID,
    variant_key: "color:white",
    label: "Blanc",
    color: "Blanc",
    size: null,
    sku: "TEST-WHITE",
    price: null,
    moq: "1",
    active: true,
    sort_order: 0,
    attributes: {},
  },
  {
    id: RED_VARIANT_ID,
    product_id: PRODUCT_ID,
    variant_key: "color:red",
    label: "Rouge",
    color: "Rouge",
    size: null,
    sku: "TEST-RED",
    price: null,
    moq: "1",
    active: true,
    sort_order: 1,
    attributes: {},
  },
];

const MEDIA = [
  ...Array.from({ length: 17 }, (_, index) => ({
    id: `white-media-${index + 1}`,
    product_id: PRODUCT_ID,
    variant_id: WHITE_VARIANT_ID,
    url: `https://example.com/white-${index + 1}.jpg`,
    media_type: "image",
    alt_text: `Blanc ${index + 1}`,
    sort_order: index,
    metadata: {},
  })),
  {
    id: "red-media-1",
    product_id: PRODUCT_ID,
    variant_id: RED_VARIANT_ID,
    url: "https://example.com/red-1.jpg",
    media_type: "image",
    alt_text: "Rouge 1",
    sort_order: 0,
    metadata: {},
  },
];

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

test("fiche produit V2 → couleur → galerie groupée → panier conserve variantId", async ({ page }) => {
  await page.route("**/auth/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/v1/signup")) {
      await route.fulfill(jsonResponse({
        access_token: "variant-e2e-token",
        refresh_token: "variant-e2e-refresh",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user: {
          id: "00000000-0000-4000-8000-000000000424",
          aud: "authenticated",
          role: "authenticated",
          email: null,
          phone: null,
          app_metadata: {},
          user_metadata: {},
        },
      }));
      return;
    }

    if (url.pathname.endsWith("/auth/v1/user")) {
      await route.fulfill(jsonResponse({
        id: "00000000-0000-4000-8000-000000000424",
        aud: "authenticated",
        role: "authenticated",
        email: null,
        phone: null,
        app_metadata: {},
        user_metadata: {},
      }));
      return;
    }

    await route.fulfill(jsonResponse({
      external: {},
      disable_signup: false,
      anonymous_users_enabled: true,
    }));
  });

  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith("/rest/v1/products")) {
      const single = url.searchParams.get("id") === `eq.${PRODUCT_ID}`;
      await route.fulfill(jsonResponse(single ? PRODUCT : [PRODUCT]));
      return;
    }

    if (url.pathname.endsWith("/rest/v1/product_variants")) {
      await route.fulfill(jsonResponse(VARIANTS));
      return;
    }

    if (url.pathname.endsWith("/rest/v1/product_media")) {
      await route.fulfill(jsonResponse(MEDIA));
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

    await route.fulfill(jsonResponse([]));
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.locator("#tapToSearch")).toBeVisible({ timeout: 20_000 });
  const productCard = page.locator("#productsGrid .product-card").first();
  await expect(productCard).toBeVisible({ timeout: 20_000 });
  await productCard.click();

  await expect(page.locator("#productModal")).toHaveClass(/\bopen\b/);
  await page.locator("#addToCartStickyBtn").click();
  await expect(page.locator("#optionsPanel")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#optionsColorOptions .option-color-card")).toHaveCount(2);

  await page.locator('[data-option-color="Blanc"]').click();

  await expect.poll(
    async () => page.locator("#modalCarouselScroll .carousel-item").count(),
    { timeout: 10_000 }
  ).toBe(17);

  await expect(page.locator("#modalCarouselScroll img").first()).toHaveAttribute(
    "data-full",
    "https://example.com/white-1.jpg"
  );

  await page.locator("#optionsPanelAddBtn").click();

  const cart = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("nrj_cart_v32") || "[]")
  );

  expect(cart).toHaveLength(1);
  expect(cart[0].productId).toBe(PRODUCT_ID);
  expect(cart[0].couleur).toBe("Blanc");
  expect(cart[0].variantId).toBe(WHITE_VARIANT_ID);

  await page.locator("#modalCloseBtn").click();
  await page.locator('a[data-nav="cart"]').click();
  await expect(page.locator("#cartPanel")).toHaveClass(/\\bopen\\b/);

  await page.locator(".cart-item-product-trigger").click();

  await expect(page.locator("#cartPanel")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#productModal")).toHaveClass(/\\bopen\\b/);

  await page.locator("#addToCartStickyBtn").click();
  await expect(page.locator("#optionsPanel")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator('[data-option-color="Blanc"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#modalCarouselScroll .carousel-item")).toHaveCount(17);
});
