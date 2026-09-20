import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { startCapture } from "./capture.js";
import { MAX_CAPTURE_HISTORY } from "./shared/config.js";
import type { CaptureSnapshot, CapturedChunk } from "./types.js";

const port = Number(process.env.PORT ?? 3000);
const maxCaptures = positiveInteger(process.env.MAX_CAPTURES, MAX_CAPTURE_HISTORY);
const maxMemoryBytes = positiveInteger(process.env.MAX_MEMORY_MB, 500) * 1_000_000;
const workingDirectory = process.cwd();
const publicDirectory = existsSync(join(workingDirectory, "dist", "public"))
  ? join(workingDirectory, "dist", "public")
  : join(workingDirectory, "web");
const captures = new Map<string, CaptureRecord>();

interface CaptureRecord {
  capture: CaptureSnapshot;
  abort: () => void;
  clients: Set<ServerResponse>;
  retainedBytes: number;
  nextEventId: number;
}

const server = createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`HTTP Scope server listening on http://localhost:${port}`);
});

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean);

  if (request.method === "POST" && url.pathname === "/api/capture") {
    await createCapture(request, response);
    return;
  }

  if (parts[0] === "api" && parts[1] === "capture" && parts[2]) {
    const record = captures.get(parts[2]);
    if (!record) {
      sendJson(response, 404, { error: "Capture not found" });
      return;
    }

    if (request.method === "GET" && parts[3] === "events") {
      streamEvents(record, response);
      return;
    }

    if (request.method === "GET" && parts.length === 3) {
      sendJson(response, 200, record.capture);
      return;
    }

    if (request.method === "POST" && parts[3] === "abort") {
      record.abort();
      sendJson(response, 202, { state: "aborting" });
      return;
    }
  }

  await serveStatic(url.pathname, response);
}

async function createCapture(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJson(request);
  const target = typeof body.url === "string" ? body.url : "";
  let parsed: URL;

  try {
    parsed = new URL(target);
  } catch {
    sendJson(response, 400, { error: "A valid target URL is required" });
    return;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    sendJson(response, 400, { error: "Only http and https URLs are supported" });
    return;
  }

  if (!makeRoomForCapture()) {
    sendJson(response, 409, {
      error: `Capture limits reached (${maxCaptures} captures or ${maxMemoryBytes / 1_000_000} MB of active data)`,
    });
    return;
  }

  let record!: CaptureRecord;
  const callbacks = {
    onMetadata: (capture: CaptureSnapshot) => broadcast(record, "metadata", capture),
    onChunk: (capture: CaptureSnapshot, chunk: CapturedChunk) => {
      const chunkBytes = Buffer.byteLength(chunk.text, "utf8");
      if (totalRetainedBytes() + chunkBytes > maxMemoryBytes) {
        capture.chunks.pop();
        throw new Error(`Capture memory limit reached (${maxMemoryBytes / 1_000_000} MB)`);
      }
      record.retainedBytes += chunkBytes;
      broadcast(record, "chunk", chunk);
    },
    onComplete: (capture: CaptureSnapshot) => {
      broadcast(record, capture.state === "failed" ? "capture-error" : "complete", capture);
      closeClients(record);
    },
  };
  const handle = startCapture(parsed.href, callbacks);
  record = {
    capture: handle.capture,
    abort: handle.abort,
    clients: new Set(),
    retainedBytes: 0,
    nextEventId: 1,
  };
  captures.set(record.capture.id, record);

  // Capture starts immediately; callbacks can only fire after the record exists in normal fetch timing.
  void handle.finished;
  sendJson(response, 202, { captureId: record.capture.id });
}

function streamEvents(record: CaptureRecord, response: ServerResponse): void {
  response.writeHead(200, {
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
  });
  response.flushHeaders();
  record.clients.add(response);
  const lastEventId = Number(response.req.headers["last-event-id"] ?? NaN);
  if (Number.isInteger(lastEventId) && lastEventId >= 0) {
    replayEvents(record, response, lastEventId);
  } else {
    writeEvent(response, undefined, "snapshot", record.capture);
  }

  response.on("close", () => record.clients.delete(response));
  if (record.capture.state !== "running") {
    closeClient(response);
  }
}

function replayEvents(record: CaptureRecord, response: ServerResponse, lastEventId: number): void {
  if (lastEventId < 1) writeEvent(response, 1, "metadata", record.capture);
  for (const chunk of record.capture.chunks) {
    const eventId = chunk.number + 1;
    if (eventId > lastEventId) writeEvent(response, eventId, "chunk", chunk);
  }

  const terminalEventId = record.capture.chunks.length + 2;
  if (record.capture.state !== "running" && terminalEventId > lastEventId) {
    writeEvent(
      response,
      terminalEventId,
      record.capture.state === "failed" ? "capture-error" : "complete",
      record.capture,
    );
  }
}

function broadcast(record: CaptureRecord, event: string, data: unknown): void {
  const id = record.nextEventId++;
  for (const client of record.clients) writeEvent(client, id, event, data);
}

function writeEvent(
  response: ServerResponse,
  id: number | undefined,
  event: string,
  data: unknown,
): void {
  const eventId = id === undefined ? "" : `id: ${id}\n`;
  response.write(`${eventId}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function closeClients(record: CaptureRecord): void {
  for (const client of record.clients) closeClient(client);
  record.clients.clear();
}

function closeClient(response: ServerResponse): void {
  response.end();
}

async function serveStatic(pathname: string, response: ServerResponse): Promise<void> {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDirectory, requested));
  if (!filePath.startsWith(publicDirectory)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    await stat(filePath);
  } catch {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  const contentTypes: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
  };
  response.writeHead(200, {
    "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}

function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("Request body is too large"));
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body) as Record<string, unknown>);
      } catch {
        reject(new Error("Request body must be valid JSON"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function makeRoomForCapture(): boolean {
  evictInactiveCaptures();
  if (captures.size < maxCaptures && totalRetainedBytes() < maxMemoryBytes) return true;
  return false;
}

function evictInactiveCaptures(): void {
  for (const [id, record] of captures) {
    if (captures.size < maxCaptures && totalRetainedBytes() <= maxMemoryBytes) break;
    if (record.capture.state === "running") continue;
    closeClients(record);
    captures.delete(id);
  }
}

function totalRetainedBytes(): number {
  let bytes = 0;
  for (const record of captures.values()) {
    bytes += record.retainedBytes;
  }
  return bytes;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
