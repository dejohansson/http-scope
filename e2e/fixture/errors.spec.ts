import { expect, openFreshPage, startCapture, test, waitForComplete } from "./test.js";

test("shows upstream failure and recovers with a valid capture", async ({ page, fixture }) => {
  await openFreshPage(page);
  await startCapture(page, fixture.urls.failBeforeHeaders);
  await expect(page.locator("#capture-state")).toHaveText("Failed", { timeout: 10_000 });
  await expect(page.locator("#error")).not.toBeEmpty();
  await startCapture(page, fixture.urls.plain);
  await waitForComplete(page);
  await expect(page.locator("#error")).toBeHidden();
  await expect(page.locator("#chunk-output")).toContainText("fixture chunk");
});

test("captures a response with no content type", async ({ page, fixture }) => {
  await openFreshPage(page);
  await startCapture(page, fixture.urls.plainNoContentType);
  await waitForComplete(page);
  await expect(page.locator("#content-type")).toHaveText("unknown");
  await expect(page.locator("#chunk-output")).toContainText("content without a type");
});

test("validates empty, malformed, and unsupported URLs", async ({ page }) => {
  await openFreshPage(page);
  await page.getByLabel("Target URL").fill("");
  await page.getByRole("button", { name: "New capture" }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter a target URL first.");
  await page.getByLabel("Target URL").fill("not-a-url");
  await page.getByRole("button", { name: "New capture" }).click();
  await expect(page.getByRole("alert")).toHaveText("A valid target URL is required");
  await page.getByLabel("Target URL").fill("ftp://example.test/resource");
  await page.getByRole("button", { name: "New capture" }).click();
  await expect(page.getByRole("alert")).toHaveText("Only http and https URLs are supported");
});
