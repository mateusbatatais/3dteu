import { expect, test } from "@playwright/test";

test("home mostra a chamada principal e leva ao catálogo", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Fidgets sob encomenda" })).toBeVisible();

  await page.getByRole("link", { name: "Ver catálogo" }).click();

  await expect(page).toHaveURL("/produtos");
  await expect(page.getByRole("heading", { name: "Catálogo" })).toBeVisible();
});
