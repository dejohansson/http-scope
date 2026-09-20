import { expect, test } from "@playwright/test";

const targetURL = "https://httpbin.org/stream/5";

test("captures the httpbin newline-delimited JSON stream", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Target URL").fill(targetURL);
  await page.locator("#grouping-window").fill("0");
  await page.getByRole("button", { name: "New capture" }).click();

  await expect(page.locator("#capture-state")).toHaveText("Complete", {
    timeout: 30_000,
  });
  await expect(page.locator("#status")).toHaveText("200");
  await expect(page.locator("#content-type")).toContainText("application/json");
  await expect(page.locator("#grouping-window")).toHaveValue("0");
  await expect(page.locator("#chunk-count")).not.toHaveText("0");
  const chunks = page.locator("#chunk-list .chunk-row");
  const output: string[] = [];
  for (let index = 0; index < (await chunks.count()); index += 1) {
    await chunks.nth(index).click();
    output.push(await page.locator("#chunk-output").innerText());
  }
  expect(output.join("\n")).toContain('"id": 0');
  expect(output.join("\n")).toContain('"id": 4');
  expect(output.join("\n")).toContain('"url": "https://httpbin.org/stream/5"');
  await expect(page.locator("#preview-button")).toBeDisabled();
});
