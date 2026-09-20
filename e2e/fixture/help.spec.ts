import { expect, openFreshPage, test } from "./test.js";

test("opens, closes, and switches the help dialog", async ({ page }) => {
  await openFreshPage(page);
  await page.getByRole("button", { name: "Open help" }).click();
  await expect(page.locator("#shortcuts-dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Help & shortcuts" })).toBeVisible();
  await page.keyboard.press("i");
  await expect(page.locator("#shortcuts-dialog")).toBeHidden();
  await expect(page.locator("#history-dialog")).toBeVisible();
  await page.keyboard.press("?");
  await expect(page.locator("#history-dialog")).toBeHidden();
  await expect(page.locator("#shortcuts-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close shortcuts" }).click();
});

test("exposes the help and capture controls accessibly", async ({ page }) => {
  await openFreshPage(page);
  await expect(page.getByLabel("Target URL")).toBeVisible();
  await expect(page.getByRole("button", { name: "New capture" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open capture history" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open help" })).toBeVisible();
  await expect(page.getByRole("alert")).toBeHidden();
  await expect(page.getByRole("radio", { name: "Raw" })).toHaveAttribute("aria-checked", "true");
});
