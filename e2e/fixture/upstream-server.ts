import { createServer, type ServerResponse } from "node:http";

export interface UpstreamServer {
  urls: Record<FixtureRoute, string>;
  close: () => Promise<void>;
}

export type FixtureRoute =
  | "plain"
  | "instant"
  | "plainMulti"
  | "plainGrouped"
  | "plainNoContentType"
  | "plainEmpty"
  | "plainUtf8Split"
  | "html"
  | "htmlDelayed"
  | "htmlLinks"
  | "htmlNextHistory"
  | "slowHeaders"
  | "slowBody"
  | "failBeforeHeaders"
  | "failAfterHeaders"
  | "status404"
  | "status500"
  | "large";

const routePaths: Record<FixtureRoute, string> = {
  plain: "/plain",
  instant: "/instant",
  plainMulti: "/plain-multi",
  plainGrouped: "/plain-grouped",
  plainNoContentType: "/plain-no-content-type",
  plainEmpty: "/plain-empty",
  plainUtf8Split: "/plain-utf8-split",
  html: "/html",
  htmlDelayed: "/html-delayed",
  htmlLinks: "/html-links",
  htmlNextHistory: "/html-next-history",
  slowHeaders: "/slow-headers",
  slowBody: "/slow-body",
  failBeforeHeaders: "/fail-before-headers",
  failAfterHeaders: "/fail-after-headers",
  status404: "/status-404",
  status500: "/status-500",
  large: "/large",
};

export async function startUpstreamServer(): Promise<UpstreamServer> {
  const server = createServer((request, response) => {
    switch (request.url) {
      case "/plain":
        writeChunks(response, ["first fixture chunk\n", "second fixture chunk\n"], 100);
        return;
      case "/instant":
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("instant fixture response\n");
        return;
      case "/plain-multi":
        writeChunks(
          response,
          ["chunk one a\n", "chunk two b\n", "chunk three c\n", "chunk four d\n"],
          250,
        );
        return;
      case "/plain-grouped":
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        response.write("group one\n");
        setTimeout(() => {
          response.write("group two a\n");
          setTimeout(() => response.end("group two b\n"), 100);
        }, 1_000);
        return;
      case "/plain-no-content-type":
        response.writeHead(200);
        response.end("content without a type");
        return;
      case "/plain-empty":
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        response.end();
        return;
      case "/plain-utf8-split":
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        response.write(Buffer.from([0x73, 0x6e, 0x6f, 0x77, 0x20, 0xf0]));
        setTimeout(() => response.end(Buffer.from([0x9f, 0x8c, 0xa8])), 100);
        return;
      case "/html":
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(
          "<!doctype html><html><body><h1>Fixture preview</h1><p>Complete HTML</p></body></html>",
        );
        return;
      case "/html-delayed":
        writeChunks(
          response,
          [
            "<!doctype html><html><body><h1>Delayed preview</h1>",
            "<p>First HTML section</p>",
            "<p>Final HTML section</p></body></html>",
          ],
          300,
          "text/html; charset=utf-8",
        );
        return;
      case "/html-links":
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(
          '<!doctype html><html><head><base href="https://fixture.example/base/"></head><body><a id="relative" href="page">relative</a><a id="absolute" href="https://example.com">absolute</a><a id="fragment" href="#part">fragment</a><a id="data" href="data:text/plain,ok">data</a><a id="javascript" href="javascript:void(0)">javascript</a></body></html>',
        );
        return;
      case "/html-next-history":
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(`<!doctype html><html><body>
          <h1>Next history fixture</h1>
          <p id="next-history-result"></p>
          <p id="replace-history-result"></p>
          <p id="push-history-result"></p>
          <script>
            const nextState = {
              __NA: true,
              __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ["", { children: ["__PAGE__"] }] },
            };
            history.replaceState(nextState, "", location.origin + "/next-init");
            document.querySelector("#next-history-result").textContent =
              history.state?.__NA === true && location.protocol === "blob:"
                ? "Next initialization preserved the blob URL"
                : "Next initialization changed the URL";

            const replaceState = { marker: "unrelated-replace" };
            history.replaceState(replaceState, "", location.href + "#replace");
            document.querySelector("#replace-history-result").textContent =
              history.state?.marker === "unrelated-replace" && location.hash === "#replace"
                ? "Unrelated replaceState passed through"
                : "Unrelated replaceState was changed";

            const pushState = { marker: "unrelated-push" };
            history.pushState(pushState, "", location.href);
            document.querySelector("#push-history-result").textContent =
              history.state?.marker === "unrelated-push"
                ? "pushState passed through"
                : "pushState was changed";
          </script>
        </body></html>`);
        return;
      case "/slow-headers":
        setTimeout(() => {
          response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("slow headers body");
        }, 1_000);
        return;
      case "/slow-body":
        writeChunks(response, ["slow first chunk\n", "slow second chunk\n"], 1_000);
        return;
      case "/fail-before-headers":
        request.socket.destroy();
        return;
      case "/fail-after-headers":
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        response.write("partial failure\n");
        setTimeout(() => response.destroy(), 100);
        return;
      case "/status-404":
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("not found body");
        return;
      case "/status-500":
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("server error body");
        return;
      case "/large":
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("x".repeat(10_000));
        return;
      default:
        response.writeHead(404);
        response.end("Not found");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Could not determine upstream server address");
  }
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    urls: Object.fromEntries(
      Object.entries(routePaths).map(([name, path]) => [name, `${origin}${path}`]),
    ) as Record<FixtureRoute, string>,
    close: () => closeServer(server),
  };
}

function writeChunks(
  response: ServerResponse,
  chunks: string[],
  delayMs: number,
  contentType = "text/plain; charset=utf-8",
): void {
  response.writeHead(200, { "Content-Type": contentType });
  response.flushHeaders();
  response.write(chunks[0]);
  let index = 1;
  const writeNext = () => {
    if (index >= chunks.length) return void response.end();
    response.write(chunks[index++]);
    setTimeout(writeNext, delayMs);
  };
  setTimeout(writeNext, delayMs);
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
