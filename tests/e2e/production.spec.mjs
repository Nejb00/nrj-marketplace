import { test, expect } from "@playwright/test";

const BASE_URL =
  process.env.E2E_BASE_URL ?? "https://nrj-marketplace.vercel.app";

test.describe("NRJ Marketplace — critical browser flows", () => {
  let pageErrors = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];

    page.on("pageerror", (error) => {
      pageErrors.push(error);
    });

    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#tapToSearch")).toBeVisible({ timeout: 30_000 });
    // Le bouton est présent avant le bootstrap asynchrone. #filterBar est rempli
    // seulement après fetchCategories(), juste avant le binding de la recherche.
    await expect(page.locator("#filterBar .filter-btn").first()).toBeVisible({ timeout: 30_000 });
  });

  test.afterEach(() => {
    if (pageErrors.length) {
      throw new Error(
        "Erreurs JavaScript non gérées: " +
          pageErrors.map((error) => error.message).join(" | "),
      );
    }
  });

  test("accueil et navigation principale", async ({ page }) => {
    await expect(page).toHaveTitle(/NRJ Marketplace/i);

    for (const nav of ["home", "categories", "cart", "favorites", "profile"]) {
      await expect(page.locator(`a[data-nav="${nav}"]`)).toBeVisible();
    }
  });

  test("navigation catalogue ↔ catégories", async ({ page }) => {
    await page.locator('a[data-nav="categories"]').click();
    await expect(page.locator("#categoriesView")).toBeVisible({ timeout: 10_000 });

    await page.locator('a[data-nav="home"]').click();
    await expect(page.locator("#homeSection")).toBeVisible({ timeout: 10_000 });
  });

  test("ouverture et fermeture de la recherche", async ({ page }) => {
    await page.locator("#tapToSearch").click();
    await expect(page.locator("#searchView")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#searchViewInput")).toBeVisible();

    await page.locator("#searchViewInput").fill("chaussure");
    await expect(page.locator("#searchViewInput")).toHaveValue("chaussure");

    await page.locator("#backFromSearchBtn").click();
    await expect(page.locator("#searchView")).toBeHidden({ timeout: 10_000 });
    await expect(page.locator("#tapToSearch")).toBeVisible();
  });

  test("ouverture et fermeture du panier", async ({ page }) => {
    await page.locator('a[data-nav="cart"]').click();

    await expect(page.locator("#cartPanel")).toHaveClass(/\bopen\b/, {
      timeout: 10_000,
    });
    await expect(page.locator("#cartOverlay")).toHaveClass(/\bopen\b/);

    await page.locator("#cartCloseBtn").click();
    await expect(page.locator("#cartPanel")).not.toHaveClass(/\bopen\b/);
    await expect(page.locator("#cartOverlay")).not.toHaveClass(/\bopen\b/);
  });

  test("ajout au panier → confirmation → panneau panier", async ({ page }) => {
    const productCard = page.locator(".product-card").first();
    await expect(productCard).toBeVisible({ timeout: 30_000 });
    await productCard.click();

    await expect(page.locator("#productModal")).toHaveClass(/\bopen\b/, {
      timeout: 10_000,
    });
    await expect(page.locator("#addToCartStickyBtn")).toBeVisible();

    const colorGroup = page.locator("#modalCouleurGroup");
    if (await colorGroup.isVisible()) {
      const moqText = await page.locator("#modalMoq").textContent();
      const moq = Number(moqText?.match(/\d+/)?.[0] ?? 1);
      const plus = page.locator('.mini-qty-btn[data-action="plus"]').first();
      await expect(plus).toBeVisible();
      await plus.click({ clickCount: Math.max(1, Math.min(moq, 120)) });
      if (moq > 120) {
        throw new Error(`MOQ trop élevé pour ce test E2E: ${moq}`);
      }
    }

    await page.locator("#addToCartStickyBtn").click();

    const confirmation = page.locator("#cartAddConfirmation");
    await expect(confirmation).toHaveClass(/\bis-open\b/, { timeout: 10_000 });
    await expect(confirmation.locator("h2")).toHaveText("Ajouté au panier");
    await expect(
      confirmation.locator('[data-cart-add-action="cart"]'),
    ).toBeVisible();
    await expect(
      confirmation.locator('[data-cart-add-action="continue"]'),
    ).toBeVisible();

    await confirmation.locator('[data-cart-add-action="cart"]').click();

    await expect(page.locator("#cartAddConfirmation")).not.toHaveClass(/\bis-open\b/);
    await expect(page.locator("#productModal")).not.toHaveClass(/\bopen\b/);
    await expect(page.locator("#cartPanel")).toHaveClass(/\bopen\b/, {
      timeout: 10_000,
    });
    await expect(page.locator(".cart-item").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
