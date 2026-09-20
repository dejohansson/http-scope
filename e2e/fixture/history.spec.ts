import { expect, openFreshPage, startCapture, test, waitForComplete } from "./test.js";

const storageKey = "http-lens:capture-history:v1";

test("persists, selects, orders, and clears capture history", async ({ page, fixture }) => {
  await openFreshPage(page);
  await startCapture(page, fixture.urls.plain);
  await waitForComplete(page);
  await startCapture(page, fixture.urls.status404);
  await waitForComplete(page);

  await page.getByRole("button", { name: "Open capture history" }).click();
  await expect(page.locator("#history-list .history-entry")).toHaveCount(2);
  await expect(page.locator("#history-list .history-entry").first()).toContainText("404");
  await expect(page.locator("#history-count")).toHaveAttribute("data-count", "2");

  await page.locator("#history-list .history-entry").last().click();
  await expect(page.getByLabel("Target URL")).toHaveValue(fixture.urls.plain);
  await expect(page.locator("#status")).toHaveText("200");
  await page.reload();
  await page.getByRole("button", { name: "Open capture history" }).click();
  await expect(page.locator("#history-list .history-entry")).toHaveCount(2);
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.locator("#history-list .history-entry")).toHaveCount(0);
  await expect(page.locator("#history-dialog")).toBeHidden();
});

test("keeps a running capture when clearing completed history", async ({ page, fixture }) => {
  await openFreshPage(page);
  await startCapture(page, fixture.urls.plain);
  await waitForComplete(page);
  await startCapture(page, fixture.urls.slowBody);
  await page.getByRole("button", { name: "Open capture history" }).click();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.locator("#history-list .history-entry")).toHaveCount(1);
  await expect(page.locator("#history-list .history-entry")).toContainText("Running");
  await expect(page.locator("#history-dialog")).toBeHidden();
});

test("discards malformed and version-mismatched persisted history", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((key) => localStorage.setItem(key, "not-json"), storageKey);
  await page.reload();
  await page.getByRole("button", { name: "Open capture history" }).click();
  await expect(page.locator("#history-empty")).toBeVisible();
  await page.getByRole("button", { name: "Close history" }).click();
  await page.evaluate(
    (key) => localStorage.setItem(key, JSON.stringify({ version: 999, captures: [] })),
    storageKey,
  );
  await page.reload();
  await page.getByRole("button", { name: "Open capture history" }).click();
  await expect(page.locator("#history-empty")).toBeVisible();
});

test("trims browser history to twenty completed captures", async ({ page, fixture }) => {
  await openFreshPage(page);
  const url = page.getByLabel("Target URL");
  const captureButton = page.getByRole("button", { name: "New capture" });

  for (let index = 1; index <= 21; index += 1) {
    await url.fill(`${fixture.urls.instant}?capture=${index}`);
    await captureButton.click();
    await expect(page.locator("#capture-state")).toHaveText("Complete", { timeout: 5_000 });
  }

  await page.getByRole("button", { name: "Open capture history" }).click();
  const entries = page.locator("#history-list .history-entry");
  await expect(entries).toHaveCount(20);
  await entries.first().click();
  await expect(url).toHaveValue(`${fixture.urls.instant}?capture=21`);
  await page.getByRole("button", { name: "Open capture history" }).click();
  await entries.last().click();
  await expect(url).toHaveValue(`${fixture.urls.instant}?capture=2`);
  await page.reload();
  await page.getByRole("button", { name: "Open capture history" }).click();
  await expect(page.locator("#history-list .history-entry")).toHaveCount(20);
});
