import { expect, openFreshPage, startCapture, test, waitForComplete } from "./test.js";

test("previews HTML and keeps preview disabled for text", async ({ page, fixture }) => {
  await openFreshPage(page);
  await startCapture(page, fixture.urls.html);
  await waitForComplete(page);
  await expect(page.locator("#preview-button")).toBeEnabled();
  await expect(page.locator("#preview-button")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#html-preview")).toBeVisible();
  await expect(page.frameLocator("#html-preview").locator("h1")).toHaveText("Fixture preview");
  await page.locator("#source-button").click();
  await expect(page.locator("#chunk-output")).toBeVisible();
  await expect(page.locator("#html-preview")).toBeHidden();

  await startCapture(page, fixture.urls.plain);
  await waitForComplete(page);
  await expect(page.locator("#preview-button")).toBeDisabled();
  await expect(page.locator("#source-button")).toHaveAttribute("aria-checked", "true");
});

test("updates a delayed HTML preview as chunks arrive", async ({ page, fixture }) => {
  await openFreshPage(page);
  await startCapture(page, fixture.urls.htmlDelayed);
  await waitForComplete(page);
  const preview = page.frameLocator("#html-preview");
  await expect(preview.locator("h1")).toHaveText("Delayed preview");
  await expect(preview.getByText("Final HTML section")).toBeVisible();
});

test("rewrites safe HTML preview URLs without changing special schemes", async ({
  page,
  fixture,
}) => {
  await openFreshPage(page);
  await startCapture(page, fixture.urls.htmlLinks);
  await waitForComplete(page);
  const preview = page.frameLocator("#html-preview");
  await expect(preview.locator("#relative")).toHaveAttribute("href", /\/page$/);
  await expect(preview.locator("#absolute")).toHaveAttribute("href", "https://example.com/");
  await expect(preview.locator("#fragment")).toHaveAttribute("href", "#part");
  await expect(preview.locator("#data")).toHaveAttribute("href", "data:text/plain,ok");
  await expect(preview.locator("#javascript")).toHaveAttribute("href", "javascript:void(0)");
});

test("rewrites only the Next.js initialization history call", async ({ page, fixture }) => {
  await openFreshPage(page);
  await startCapture(page, fixture.urls.htmlNextHistory);
  await waitForComplete(page);
  const preview = page.frameLocator("#html-preview");

  await expect(preview.locator("#next-history-result")).toHaveText(
    "Next initialization preserved the blob URL",
  );
  await expect(preview.locator("#replace-history-result")).toHaveText(
    "Unrelated replaceState passed through",
  );
  await expect(preview.locator("#push-history-result")).toHaveText("pushState passed through");
});

test("previews HTML through the selected chunk", async ({ page, fixture }) => {
  await openFreshPage(page);
  await page.locator("#grouping-window").fill("0");
  await startCapture(page, fixture.urls.htmlDelayed);
  await waitForComplete(page);
  const rows = page.locator("#chunk-list .chunk-row");
  await expect(rows).toHaveCount(3);
  await rows.nth(0).click();
  const preview = page.frameLocator("#html-preview");
  await expect(preview.locator("h1")).toHaveText("Delayed preview");
  await expect(preview.getByText("Final HTML section")).toHaveCount(0);
  await rows.nth(2).click();
  await expect(preview.getByText("Final HTML section")).toBeVisible();
});
