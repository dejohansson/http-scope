export type CaptureState = "running" | "complete" | "failed" | "aborted";

export interface CapturedChunk {
  number: number;
  elapsedMs: number;
  deltaMs: number;
  byteLength: number;
  text: string;
}

export interface CaptureSnapshot {
  id: string;
  url: string;
  state: CaptureState;
  status: number | null;
  contentType: string;
  headers: Record<string, string>;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  chunks: CapturedChunk[];
}
