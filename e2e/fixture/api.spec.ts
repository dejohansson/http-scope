import { expect, test } from "./test.js";

async function createCapture(request: import("@playwright/test").APIRequestContext, url: string) {
  return request.post("/api/capture", { data: { url } });
}

test("exposes the capture API lifecycle", async ({ request, fixture }) => {
  const fixtureResponse = await request.get("/");
  expect(fixtureResponse.ok()).toBe(true);

  const invalid = await createCapture(request, "not-a-url");
  expect(invalid.status()).toBe(400);
  await expect(invalid.json()).resolves.toEqual({ error: "A valid target URL is required" });

  const response = await createCapture(request, fixture.urls.plain);
  expect(response.status()).toBe(202);
  const { captureId } = (await response.json()) as { captureId: string };
  expect(captureId).toMatch(/^[0-9a-f-]{36}$/);

  const unknown = await request.get("/api/capture/does-not-exist");
  expect(unknown.status()).toBe(404);
  await expect(unknown.json()).resolves.toEqual({ error: "Capture not found" });
});

test("rejects unsupported protocols and supports abort requests", async ({ request, fixture }) => {
  const unsupported = await createCapture(request, "ftp://example.test/resource");
  expect(unsupported.status()).toBe(400);
  await expect(unsupported.json()).resolves.toEqual({
    error: "Only http and https URLs are supported",
  });

  const response = await createCapture(request, fixture.urls.slowBody);
  const { captureId } = (await response.json()) as { captureId: string };
  const abort = await request.post(`/api/capture/${captureId}/abort`);
  expect(abort.status()).toBe(202);
  await expect(abort.json()).resolves.toEqual({ state: "aborting" });
});

test("rejects malformed and incomplete API requests", async ({ request }) => {
  const malformed = await request.post("/api/capture", {
    data: "not-json",
    headers: { "Content-Type": "application/json" },
  });
  expect(malformed.status()).toBe(400);

  const missingURL = await request.post("/api/capture", { data: {} });
  expect(missingURL.status()).toBe(400);
  await expect(missingURL.json()).resolves.toEqual({ error: "A valid target URL is required" });
});
