import { expect, test } from "@playwright/test";

const targetURL = "https://httpbin.org/drip?duration=2&numbytes=100&delay=0&code=200";

test("captures a delayed httpbin byte stream", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Target URL").fill(targetURL);
  await page.getByRole("button", { name: "New capture" }).click();

  await expect(page.locator("#capture-state")).toHaveText("Complete", {
    timeout: 30_000,
  });
  await expect(page.locator("#status")).toHaveText("200");
  await expect(page.locator("#content-type")).not.toContainText("text/html");
  await expect(page.locator("#byte-count")).toHaveText("100 B");
  await expect(page.locator("#chunk-count")).not.toHaveText("0");
  await expect(page.locator("#chunk-output")).not.toHaveText("");
  await expect(page.locator("#preview-button")).toBeDisabled();
});
