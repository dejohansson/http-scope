import { expect, openFreshPage, startCapture, test, waitForComplete } from "./test.js";

test("captures a controlled streaming response", async ({ page, fixture }) => {
  await page.goto("/");
  await startCapture(page, fixture.urls.plain);
  await waitForComplete(page);
  await expect(page).toHaveTitle("HTTP Scope");
  await expect(page.locator("#status")).toHaveText("200");
  await expect(page.locator("#content-type")).toContainText("text/plain");
  await expect(page.locator("#chunk-count")).not.toHaveText("0");
  await expect(page.locator("#byte-count")).not.toHaveText("0 B");
  await expect(page.locator("#chunk-output")).toContainText("fixture chunk");
  await expect(page.locator("#error")).toBeHidden();
});

test("renders the empty initial state", async ({ page }) => {
  await openFreshPage(page);
  await expect(page.locator("#capture-state")).toHaveText("Waiting");
  await expect(page.locator("#status")).toHaveText("-");
  await expect(page.locator("#chunk-count")).toHaveText("0");
  await expect(page.locator("#byte-count")).toHaveText("0 B");
  await expect(page.locator("#time")).toHaveText("0 ms");
  await expect(page.locator("#content-type")).toHaveText("-");
  await expect(page.locator("#empty-state")).toBeVisible();
  await expect(page.locator("#detail-title")).toHaveText("No chunk selected");
  await expect(page.locator("#previous-button")).toBeDisabled();
  await expect(page.locator("#next-button")).toBeDisabled();
  await expect(page.locator("#preview-button")).toBeDisabled();
  await expect(page.locator("#error")).toBeHidden();
});

test("shows running state and completes", async ({ page, fixture }) => {
  await openFreshPage(page);
  await startCapture(page, fixture.urls.slowBody);
  await expect(page.getByRole("button", { name: "Abort capture" })).toBeVisible();
  await expect(page.locator("#capture-state")).toHaveText("Running");
  await expect(page.locator(".chunk-skeleton")).toBeVisible();
  await expect(page.locator("#status")).toHaveText("200");
  await waitForComplete(page);
  await expect(page.getByRole("button", { name: "New capture" })).toBeVisible();
  await expect(page.locator(".chunk-skeleton")).toHaveCount(0);
});

test("aborts a partial capture and retains its data", async ({ page, fixture }) => {
  await openFreshPage(page);
  await startCapture(page, fixture.urls.slowBody);
  await expect(page.locator("#chunk-output")).toContainText("slow first chunk", { timeout: 5_000 });
  await page.getByRole("button", { name: "Abort capture" }).click();
  await expect(page.locator("#capture-state")).toHaveText("Aborted", { timeout: 5_000 });
  await expect(page.locator("#chunk-output")).toContainText("slow first chunk");
  await expect(page.locator("#error")).toBeHidden();
});

test("captures empty, HTTP error, missing type, and UTF-8 responses", async ({ page, fixture }) => {
  await openFreshPage(page);
  await startCapture(page, fixture.urls.plainEmpty);
  await waitForComplete(page);
  await expect(page.locator("#chunk-count")).toHaveText("0");
  await startCapture(page, fixture.urls.status500);
  await waitForComplete(page);
  await expect(page.locator("#status")).toHaveText("500");
  await expect(page.locator("#chunk-output")).toContainText("server error body");
  await startCapture(page, fixture.urls.plainNoContentType);
  await waitForComplete(page);
  await expect(page.locator("#content-type")).toHaveText("unknown");
  await startCapture(page, fixture.urls.plainUtf8Split);
  await waitForComplete(page);
  await expect(page.locator("#chunk-output")).toHaveText("🌨");
  await expect(page.locator("#chunk-output")).not.toContainText("�");
});

test("treats HTTP errors as complete captures", async ({ page, fixture }) => {
  await openFreshPage(page);
  await startCapture(page, fixture.urls.status404);
  await waitForComplete(page);
  await expect(page.locator("#status")).toHaveText("404");
  await expect(page.locator("#chunk-output")).toContainText("not found body");
  await expect(page.locator("#error")).toBeHidden();
});
