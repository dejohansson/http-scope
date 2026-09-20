import { test as base, expect, type Page } from "@playwright/test";
import { startUpstreamServer, type UpstreamServer } from "./upstream-server.js";

export const test = base.extend<{ fixture: UpstreamServer }>({
  fixture: async ({ baseURL: _baseURL }, use) => {
    void _baseURL;
    const upstream = await startUpstreamServer();
    try {
      await use(upstream);
    } finally {
      await upstream.close();
    }
  },
});

export { expect };

export async function openFreshPage(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

export async function startCapture(page: Page, url: string): Promise<void> {
  await page.getByLabel("Target URL").fill(url);
  await page.getByRole("button", { name: "New capture" }).click();
}

export async function waitForComplete(page: Page): Promise<void> {
  await expect(page.locator("#capture-state")).toHaveText("Complete", { timeout: 10_000 });
}
