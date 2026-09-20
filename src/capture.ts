import { randomUUID } from "node:crypto";
import type { CapturedChunk, CaptureSnapshot } from "./types.js";

export interface CaptureCallbacks {
  onMetadata?: (capture: CaptureSnapshot) => void;
  onChunk?: (capture: CaptureSnapshot, chunk: CapturedChunk) => void;
  onComplete?: (capture: CaptureSnapshot) => void;
}

export interface CaptureHandle {
  capture: CaptureSnapshot;
  abort: () => void;
  finished: Promise<void>;
}

export function startCapture(url: string, callbacks: CaptureCallbacks = {}): CaptureHandle {
  const controller = new AbortController();
  const capture: CaptureSnapshot = {
    id: randomUUID(),
    url,
    state: "running",
    status: null,
    contentType: "unknown",
    headers: {},
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    chunks: [],
  };

  const finished = readResponse(capture, controller.signal, callbacks);
  return { capture, abort: () => controller.abort(), finished };
}

async function readResponse(
  capture: CaptureSnapshot,
  signal: AbortSignal,
  callbacks: CaptureCallbacks,
): Promise<void> {
  try {
    const response = await fetch(capture.url, {
      signal,
      headers: { "Accept-Encoding": "identity" },
    });

    capture.status = response.status;
    capture.contentType = response.headers.get("content-type") ?? "unknown";
    capture.headers = Object.fromEntries(response.headers.entries());
    callbacks.onMetadata?.(capture);

    if (!response.body) {
      throw new Error("The response did not contain a readable body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const startedAt = Date.now();
    let previousElapsed = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const elapsedMs = Date.now() - startedAt;
      const chunk: CapturedChunk = {
        number: capture.chunks.length + 1,
        elapsedMs,
        deltaMs: elapsedMs - previousElapsed,
        byteLength: value.byteLength,
        text: decoder.decode(value, { stream: true }),
      };
      previousElapsed = elapsedMs;
      capture.chunks.push(chunk);
      callbacks.onChunk?.(capture, chunk);
    }

    const remainder = decoder.decode();
    if (remainder) {
      const elapsedMs = Date.now() - startedAt;
      const chunk: CapturedChunk = {
        number: capture.chunks.length + 1,
        elapsedMs,
        deltaMs: elapsedMs - previousElapsed,
        byteLength: new TextEncoder().encode(remainder).byteLength,
        text: remainder,
      };
      capture.chunks.push(chunk);
      callbacks.onChunk?.(capture, chunk);
    }

    capture.state = "complete";
  } catch (error) {
    if (signal.aborted) {
      capture.state = "aborted";
    } else {
      capture.state = "failed";
      capture.error = error instanceof Error ? error.message : String(error);
    }
  } finally {
    capture.completedAt = new Date().toISOString();
    callbacks.onComplete?.(capture);
  }
}
