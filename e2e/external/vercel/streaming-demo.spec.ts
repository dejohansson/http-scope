import { expect, test } from "@playwright/test";

test("captures Vercel Suspense HTML streaming and previews the streamed page", async ({ page }) => {
  const historyErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("replaceState")) {
      historyErrors.push(message.text());
    }
  });

  await page.goto("/");
  await page.getByLabel("Target URL").fill("https://streaming-demo.labs.vercel.dev/suspense-demo");
  await page.locator("#grouping-window").fill("30");
  await page.getByRole("button", { name: "New capture" }).click();

  await expect(page.locator("#capture-state")).toHaveText("Complete", {
    timeout: 30_000,
  });
  await expect(page.locator("#status")).toHaveText("200");
  await expect(page.locator("#grouping-window")).toHaveValue("30");
  await expect(page.locator("#chunk-count")).not.toHaveText("0");
  await expect(page.locator("#chunk-list .chunk-row")).toHaveCount(4);
  await expect(page.locator("#chunk-list .chunk-row").nth(0)).toContainText("Chunks 1-3");
  await expect(page.locator("#chunk-list .chunk-row").nth(1)).toContainText("Chunks 4-5");
  await expect(page.locator("#chunk-list .chunk-row").nth(2)).toContainText("Chunks 6-7");
  await expect(page.locator("#chunk-list .chunk-row").nth(3)).toContainText(/Chunks? 8(?:-9)?/);
  await expect(page.locator("#chunk-output")).toContainText("Analytics Dashboard");
  await expect(page.locator("#preview-button")).toBeEnabled();
  await expect(page.locator("#source-button")).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("#preview-button")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#chunk-output")).toBeHidden();
  await expect(page.locator("#html-preview")).toBeVisible();

  const groups = page.locator("#chunk-list .chunk-row");
  const groupDetails = [
    { title: "Chunks 1-3", text: '<template id="B:0">' },
    { title: "Chunks 4-5", text: "self.__next_f.push" },
    { title: "Chunks 6-7", text: "Weather:" },
    { title: /Chunks? 8(?:-9)?/, text: "Analytics Dashboard" },
  ];

  for (let index = 0; index < 4; index += 1) {
    await groups.nth(index).click();
    await expect(groups.nth(index)).toHaveClass(/selected/);
    await expect(page.locator("#detail-title")).toHaveText(groupDetails[index].title);
    await expect(page.locator("#chunk-output")).toContainText(groupDetails[index].text);
    await expect(page.locator("#preview-button")).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("#html-preview")).toBeVisible();
  }

  await page.locator("#source-button").click();
  await expect(page.locator("#source-button")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#preview-button")).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("#chunk-output")).toBeVisible();
  await expect(page.locator("#html-preview")).toBeHidden();

  await page.locator("#preview-button").click();
  await expect(page.locator("#source-button")).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("#preview-button")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#chunk-output")).toBeHidden();
  await expect(page.locator("#html-preview")).toBeVisible();
  const preview = page.frameLocator("#html-preview");
  await expect(preview.locator("h1")).toHaveText("Granular Streaming with Suspense");
  await expect(preview.getByRole("heading", { name: "Weather: San Francisco" })).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Analytics Dashboard" })).toBeVisible();
  expect(historyErrors).toEqual([]);
});
