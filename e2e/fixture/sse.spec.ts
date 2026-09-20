import { expect, test } from "./test.js";

const backendURL = `http://localhost:${process.env.E2E_API_PORT ?? "4000"}`;

test("streams snapshot, metadata, chunks, and completion events", async ({ page, fixture }) => {
  await page.goto("/");
  const events = await page.evaluate(async (targetURL) => {
    const start = await fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetURL }),
    });
    const { captureId } = (await start.json()) as { captureId: string };
    return new Promise<Array<{ event: string; id: string; data: string }>>((resolve, reject) => {
      const received: Array<{ event: string; id: string; data: string }> = [];
      const source = new EventSource(`/api/capture/${captureId}/events`);
      for (const name of ["snapshot", "metadata", "chunk", "complete", "capture-error"]) {
        source.addEventListener(name, (event) => {
          received.push({
            event: name,
            id: (event as MessageEvent).lastEventId,
            data: (event as MessageEvent).data,
          });
          if (name === "complete" || name === "capture-error") {
            source.close();
            resolve(received);
          }
        });
      }
      source.onerror = () => {
        source.close();
        reject(new Error("SSE connection failed"));
      };
    });
  }, fixture.urls.slowHeaders);

  expect(events.map((event) => event.event)).toEqual(["snapshot", "metadata", "chunk", "complete"]);
  expect(events[0].id).toBe("");
  expect(JSON.parse(events[1].data)).toMatchObject({ status: 200 });
  expect(JSON.parse(events[2].data)).toMatchObject({ number: 1 });
  expect(JSON.parse(events[3].data)).toMatchObject({ state: "complete" });
  expect(Number(events[2].id)).toBeLessThan(Number(events[3].id));
});

test("replays a completed capture to a late subscriber", async ({ request, fixture }) => {
  const start = await request.post("/api/capture", { data: { url: fixture.urls.plain } });
  const { captureId } = (await start.json()) as { captureId: string };
  let snapshot: { state: string; chunks: unknown[] } | null = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await request.get(`/api/capture/${captureId}`);
    snapshot = (await response.json()) as { state: string; chunks: unknown[] };
    if (snapshot.state !== "running") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(snapshot?.state).toBe("complete");
  expect(snapshot?.chunks).toHaveLength(2);

  const events = await request.get(`/api/capture/${captureId}/events`, {
    headers: { "Last-Event-ID": "2" },
  });
  expect(events.status()).toBe(200);
  const body = await events.text();
  expect(body).toContain("event: chunk");
  expect(body).toContain('event: chunk\ndata: {"number":2');
  expect(body).toContain("event: complete");
  expect(body).not.toContain('event: chunk\ndata: {"number":1');
});

test("serves the runtime application and protects static paths", async ({ request }) => {
  const root = await request.get(`${backendURL}/`);
  expect(root.status()).toBe(200);
  const html = await root.text();
  expect(root.headers()["content-type"]).toContain("text/html");
  expect(html).toContain("HTTP Scope");
  const assetPath = html.match(/(?:src|href)="([^"]+\.(?:css|js)(?:\?[^"]*)?)"/)?.[1];
  expect(assetPath).toBeTruthy();
  const asset = await request.get(`${backendURL}${assetPath}`);
  expect(asset.status()).toBe(200);
  expect(asset.headers()["content-type"]).toMatch(/text\/(css|javascript)/);
  expect((await request.get(`${backendURL}/missing-file.js`)).status()).toBe(404);
  expect([403, 404]).toContain((await request.get(`${backendURL}/../package.json`)).status());
});
