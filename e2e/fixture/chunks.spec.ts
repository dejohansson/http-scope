import { expect, openFreshPage, startCapture, test, waitForComplete } from "./test.js";

test("navigates through individual chunks with controls and shortcuts", async ({
  page,
  fixture,
}) => {
  await openFreshPage(page);
  await page.locator("#grouping-window").fill("0");
  await startCapture(page, fixture.urls.plainMulti);
  await waitForComplete(page);
  const rows = page.locator("#chunk-list .chunk-row");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("Chunk 1");
  await expect(rows.nth(3)).toContainText("Chunk 4");
  await expect(rows.nth(3)).toHaveClass(/selected/);
  await expect(page.locator("#previous-button")).toBeEnabled();
  await expect(page.locator("#next-button")).toBeDisabled();
  await page.locator("#previous-button").click();
  await expect(page.locator("#detail-title")).toHaveText("Chunk 3");
  await page.locator("#next-button").click();
  await page.keyboard.press("g");
  await page.keyboard.press("g");
  await expect(page.locator("#detail-title")).toHaveText("Chunk 1");
  await page.keyboard.press("G");
  await expect(page.locator("#detail-title")).toHaveText("Chunk 4");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("j");
  await expect(page.locator("#detail-title")).toHaveText("Chunk 4");
});

test("does not navigate chunks while editing inputs", async ({ page, fixture }) => {
  await openFreshPage(page);
  await page.locator("#grouping-window").fill("0");
  await startCapture(page, fixture.urls.plainMulti);
  await waitForComplete(page);
  await page.getByLabel("Target URL").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#detail-title")).toHaveText("Chunk 4");
  await page.locator("#grouping-window").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#detail-title")).toHaveText("Chunk 4");
});

test("keeps threshold focus while arrow keys adjust its value", async ({ page, fixture }) => {
  await openFreshPage(page);
  await page.locator("#grouping-window").fill("10");
  await startCapture(page, fixture.urls.plainMulti);
  await waitForComplete(page);

  const threshold = page.locator("#grouping-window");
  await threshold.focus();
  await threshold.press("ArrowUp");
  await expect(threshold).toHaveValue("11");
  await expect(threshold).toBeFocused();

  await threshold.press("ArrowDown");
  await expect(threshold).toHaveValue("10");
  await expect(threshold).toBeFocused();
});

test("regroups captured chunks and applies threshold bounds", async ({ page, fixture }) => {
  await openFreshPage(page);
  await page.locator("#grouping-window").fill("0");
  await startCapture(page, fixture.urls.plainMulti);
  await waitForComplete(page);
  await page.locator("#grouping-window").fill("100");
  const groups = page.locator("#chunk-list .chunk-row");
  await expect(groups).toHaveCount(4);
  await page.locator("#grouping-window").fill("9999");
  await expect(groups).toHaveCount(1);
  await expect(groups.first()).toContainText("Chunks 1-4");
  await expect(page.locator("#detail-title")).toHaveText("Chunks 1-4");
  await page.locator("#grouping-window").fill("-5");
  await expect(page.locator("#grouping-window")).toHaveValue("0");
  await page.locator("#grouping-window").fill("10000");
  await expect(page.locator("#grouping-window")).toHaveValue("9999");
});

test("disables next when paging to the final chunk group", async ({ page, fixture }) => {
  await openFreshPage(page);
  await page.locator("#grouping-window").fill("0");
  await startCapture(page, fixture.urls.plainGrouped);
  await waitForComplete(page);
  await page.locator("#grouping-window").fill("300");

  const groups = page.locator("#chunk-list .chunk-row");
  await expect(groups).toHaveCount(2);
  await groups.first().click();
  await expect(page.locator("#previous-button")).toBeDisabled();
  await expect(page.locator("#next-button")).toBeEnabled();

  await page.locator("#next-button").click();
  await expect(page.locator("#detail-title")).toHaveText("Chunks 2-3");
  await expect(page.locator("#previous-button")).toBeEnabled();
  await expect(page.locator("#next-button")).toBeDisabled();
});

test("reports UTF-8 bytes and chunk detail metrics", async ({ page, fixture }) => {
  await openFreshPage(page);
  await startCapture(page, fixture.urls.plainUtf8Split);
  await waitForComplete(page);
  const chunks = page.locator("#chunk-list .chunk-row");
  await chunks.first().click();
  await expect(page.locator("#chunk-output")).toHaveText("snow ");
  await chunks.nth(1).click();
  await expect(page.locator("#chunk-output")).toHaveText("🌨");
  await expect(page.locator("#byte-count")).toHaveText("9 B");
  await expect(page.locator("#chunk-count")).toHaveText("2");
  await expect(page.locator("#detail-meta")).toContainText("ms");
  await expect(page.locator("#detail-meta")).toContainText("B");
});

test("keeps selection and focus usable while regrouping", async ({ page, fixture }) => {
  await openFreshPage(page);
  await page.locator("#grouping-window").fill("0");
  await startCapture(page, fixture.urls.plainMulti);
  await waitForComplete(page);
  const rows = page.locator("#chunk-list .chunk-row");
  await rows.nth(0).click();
  await expect(rows.nth(0)).toHaveClass(/selected/);
  await page.locator("#grouping-window").fill("9999");
  await expect(page.locator("#grouping-window")).toBeFocused();
});
