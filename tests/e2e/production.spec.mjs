import { test, expect } from "@playwright/test";

const BASE_URL =
  process.env.E2E_BASE_URL ?? "https://nrj-marketplace.vercel.app";

test.describe("NRJ Marketplace — production browser smoke", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
      throw new Error(`Erreur JavaScript non gérée: ${error.message}`);
    });

    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#tapToSearch")).toBeVisible({ timeout: 30_000 });
  });

  test("accueil et navigation principale", async ({ page }) => {
    await expect(page).toHaveTitle(/NRJ Marketplace/i);
    await expect(page.locator('a[data-nav="home"]')).toBeVisible();
    await expect(page.locator('a[data-nav="categories"]')).toBeVisible();
    await expect(page.locator('a[data-nav="cart"]')).toBeVisible();
    await expect(page.locator('a[data-nav="favorites"]')).toBeVisible();
    await expect(page.locator('a[data-nav="profile"]')).toBeVisible();
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
});
