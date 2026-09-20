import { expect, test } from "./test.js";

test("evicts the oldest completed backend capture at capacity", async ({ request, fixture }) => {
  const ids: string[] = [];
  for (let index = 0; index < 21; index += 1) {
    const response = await request.post("/api/capture", { data: { url: fixture.urls.instant } });
    expect(response.status()).toBe(202);
    const id = ((await response.json()) as { captureId: string }).captureId;
    ids.push(id);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const snapshot = await request.get(`/api/capture/${id}`);
      const capture = (await snapshot.json()) as { state: string };
      if (capture.state !== "running") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  expect((await request.get(`/api/capture/${ids[0]}`)).status()).toBe(404);
  expect((await request.get(`/api/capture/${ids[20]}`)).status()).toBe(200);
});
