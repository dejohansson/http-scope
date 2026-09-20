import { MAX_CAPTURE_HISTORY } from "../src/shared/config";

interface Chunk {
  number: number;
  elapsedMs: number;
  deltaMs: number;
  byteLength: number;
  text: string;
}

interface ChunkGroup {
  startIndex: number;
  endIndex: number;
  chunks: Chunk[];
  deltaMs: number;
  byteLength: number;
  text: string;
}

interface Capture {
  id: string;
  url: string;
  state: "running" | "complete" | "failed" | "aborted";
  status: number | null;
  contentType: string;
  headers: Record<string, string>;
  startedAt: string;
  completedAt: string | null;
  chunks: Chunk[];
  error: string | null;
}

interface StoredHistory {
  version: typeof historyStorageVersion;
  captures: Capture[];
}

// Bump this when the persisted capture shape changes incompatibly.
const historyStorageVersion = 1;
const historyStorageKey = "http-lens:capture-history:v1";

interface Shortcut {
  group: string;
  bindings: string[][];
  label: string;
  run: () => void;
}

const elements = {
  url: getElement<HTMLInputElement>("target-url"),
  captureAction: getElement<HTMLButtonElement>("capture-action"),
  history: getElement<HTMLButtonElement>("history-button"),
  historyDialog: getElement<HTMLDialogElement>("history-dialog"),
  historyList: getElement<HTMLElement>("history-list"),
  historyEmpty: getElement<HTMLElement>("history-empty"),
  clearHistory: getElement<HTMLButtonElement>("clear-history-button"),
  historyCount: getElement<HTMLElement>("history-count"),
  status: getElement<HTMLElement>("status"),
  count: getElement<HTMLElement>("chunk-count"),
  bytes: getElement<HTMLElement>("byte-count"),
  time: getElement<HTMLElement>("time"),
  contentType: getElement<HTMLElement>("content-type"),
  state: getElement<HTMLElement>("capture-state"),
  error: getElement<HTMLElement>("error"),
  list: getElement<HTMLOListElement>("chunk-list"),
  empty: getElement<HTMLElement>("empty-state"),
  title: getElement<HTMLElement>("detail-title"),
  meta: getElement<HTMLElement>("detail-meta"),
  output: getElement<HTMLElement>("chunk-output"),
  source: getElement<HTMLButtonElement>("source-button"),
  preview: getElement<HTMLButtonElement>("preview-button"),
  previewEmpty: getElement<HTMLElement>("preview-empty"),
  previewFrame: getElement<HTMLIFrameElement>("html-preview"),
  previous: getElement<HTMLButtonElement>("previous-button"),
  next: getElement<HTMLButtonElement>("next-button"),
  groupingWindow: getElement<HTMLInputElement>("grouping-window"),
  shortcuts: getElement<HTMLButtonElement>("shortcuts-button"),
  shortcutsDialog: getElement<HTMLDialogElement>("shortcuts-dialog"),
  shortcutList: getElement<HTMLElement>("shortcut-list"),
};

let capture: Capture | null = null;
let history: Capture[] = loadHistory();
let activeCaptureId: string | null = null;
let selectedCaptureId: string | null = null;
const selectedChunkByCapture = new Map<string, number>();
let selectedIndex = -1;
let followingLatest = true;
let groupingWindowMs = 0;
const maxGroupingWindowMs = 9999;
let detailView: "source" | "preview" = "source";
let previewObjectUrl: string | null = null;
let events: EventSource | null = null;
let pendingG = false;
let pendingGTimer: number | undefined;

const shortcuts: Shortcut[] = [
  {
    group: "Capture",
    bindings: [["Shift+Enter"]],
    label: "New capture",
    run: () => void startCapture(),
  },
  {
    group: "Capture",
    bindings: [["Escape"]],
    label: "Abort capture",
    run: () => void abortCapture(),
  },
  {
    group: "Interface",
    bindings: [["?"]],
    label: "Toggle help",
    run: toggleHelp,
  },
  {
    group: "Interface",
    bindings: [["i"], ["I"]],
    label: "Toggle history",
    run: toggleHistory,
  },
  {
    group: "Navigate",
    bindings: [["ArrowLeft"], ["ArrowUp"], ["h"], ["k"]],
    label: "Previous item",
    run: () => selectAdjacent(-1),
  },
  {
    group: "Navigate",
    bindings: [["ArrowRight"], ["ArrowDown"], ["j"], ["l"]],
    label: "Next item",
    run: () => selectAdjacent(1),
  },
  {
    group: "Navigate",
    bindings: [["g", "g"]],
    label: "First item",
    run: () => selectBoundary(false),
  },
  {
    group: "Navigate",
    bindings: [["G"]],
    label: "Last item",
    run: () => selectBoundary(true),
  },
];

elements.captureAction.addEventListener("click", () => {
  if (activeCaptureId) void abortCapture();
  else void startCapture();
});
elements.history.addEventListener("click", toggleHistory);
elements.historyDialog.addEventListener("click", (event) => {
  if (event.target === elements.historyDialog) elements.historyDialog.close();
});
elements.historyDialog.addEventListener("toggle", () => {
  if (elements.historyDialog.open) focusHistoryEntry(selectedCaptureId);
});
elements.clearHistory.addEventListener("click", clearHistory);
elements.previous.addEventListener("click", () => selectAdjacent(-1));
elements.next.addEventListener("click", () => selectAdjacent(1));
elements.groupingWindow.addEventListener("input", () => {
  groupingWindowMs = Math.min(
    maxGroupingWindowMs,
    Math.max(0, Number(elements.groupingWindow.value) || 0),
  );
  elements.groupingWindow.value = String(groupingWindowMs);
  renderSelectedCapture();
  if (capture?.chunks.length && selectedIndex >= 0) selectChunk(selectedIndex);
});
elements.source.addEventListener("click", () => setDetailView("source"));
elements.preview.addEventListener("click", () => setDetailView("preview"));
elements.shortcuts.addEventListener("click", toggleHelp);
elements.shortcutsDialog.addEventListener("click", (event) => {
  if (event.target === elements.shortcutsDialog) elements.shortcutsDialog.close();
});
renderShortcuts();
renderHistory();
renderDetail();
document.addEventListener("keydown", (event) => {
  if (elements.shortcutsDialog.open) {
    if (event.key === "?" || event.key === "i" || event.key === "I") {
      event.preventDefault();
      findShortcut([event.key])?.run();
    }
    return;
  }
  if (elements.historyDialog.open) {
    if (event.key === "?" || event.key === "i" || event.key === "I") {
      event.preventDefault();
      findShortcut([event.key])?.run();
      return;
    }
    handleHistoryNavigation(event);
    return;
  }

  if (event.key === "Enter" && (event.shiftKey || event.target === elements.url)) {
    event.preventDefault();
    if (capture?.state === "running") return;
    if (event.shiftKey) findShortcut(["Shift+Enter"])?.run();
    else void startCapture();
    return;
  }

  if (isEditableTarget(event.target)) return;

  if (event.key === "g" && pendingG) {
    event.preventDefault();
    clearPendingG();
    findShortcut(["g", "g"])?.run();
    return;
  }

  if (event.key === "g") {
    event.preventDefault();
    pendingG = true;
    pendingGTimer = window.setTimeout(clearPendingG, 500);
    return;
  }

  clearPendingG();

  const shortcut = findShortcut([event.key]);
  if (shortcut) {
    event.preventDefault();
    if (event.key === "Escape" && capture?.state !== "running") return;
    shortcut.run();
  }
});

function handleHistoryNavigation(event: KeyboardEvent): void {
  if (event.key === "Escape") return;

  if (event.key === "g" && pendingG) {
    event.preventDefault();
    clearPendingG();
    focusHistoryEntry(history[0]?.id ?? null);
    return;
  }

  if (event.key === "g") {
    event.preventDefault();
    pendingG = true;
    pendingGTimer = window.setTimeout(clearPendingG, 500);
    return;
  }

  if (event.key === "G") {
    event.preventDefault();
    clearPendingG();
    focusHistoryEntry(history.at(-1)?.id ?? null);
    return;
  }

  clearPendingG();
  const direction = ["ArrowLeft", "ArrowUp", "h", "k"].includes(event.key)
    ? -1
    : ["ArrowRight", "ArrowDown", "j", "l"].includes(event.key)
      ? 1
      : 0;
  if (direction) {
    event.preventDefault();
    moveHistoryFocus(direction);
  }
}

function toggleHelp(): void {
  if (elements.shortcutsDialog.open) {
    elements.shortcutsDialog.close();
    return;
  }
  elements.historyDialog.close();
  elements.shortcutsDialog.showModal();
}

function toggleHistory(): void {
  if (elements.historyDialog.open) {
    elements.historyDialog.close();
    return;
  }
  elements.shortcutsDialog.close();
  elements.historyDialog.showModal();
}

function findShortcut(binding: string[]): Shortcut | undefined {
  return shortcuts.find((shortcut) =>
    shortcut.bindings.some(
      (candidate) =>
        candidate.length === binding.length &&
        candidate.every((key, index) => key === binding[index]),
    ),
  );
}

function renderShortcuts(): void {
  const groups = new Map<string, Shortcut[]>();
  for (const shortcut of shortcuts) {
    const group = groups.get(shortcut.group) ?? [];
    group.push(shortcut);
    groups.set(shortcut.group, group);
  }

  for (const [groupName, groupShortcuts] of groups) {
    const section = document.createElement("section");
    section.className = "shortcut-group";
    section.innerHTML = `<h3>${groupName}</h3>`;
    for (const shortcut of groupShortcuts) {
      const row = document.createElement("div");
      row.className = "shortcut-row";
      row.innerHTML = `<span class="shortcut-keys">${shortcut.bindings.map(formatBinding).join(' <span class="shortcut-or">or</span> ')}</span><strong>${shortcut.label}</strong>`;
      section.append(row);
    }
    elements.shortcutList.append(section);
  }
}

function formatBinding(binding: string[]): string {
  return binding.map((key) => `<kbd>${formatShortcutKey(key)}</kbd>`).join(" ");
}

function formatShortcutKey(key: string): string {
  return key === "ArrowLeft"
    ? "←"
    : key === "ArrowRight"
      ? "→"
      : key === "ArrowUp"
        ? "↑"
        : key === "ArrowDown"
          ? "↓"
          : key;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function clearPendingG(): void {
  if (pendingGTimer !== undefined) window.clearTimeout(pendingGTimer);
  pendingG = false;
  pendingGTimer = undefined;
}

async function startCapture(): Promise<void> {
  const url = elements.url.value.trim();
  if (!url) return showError("Enter a target URL first.");

  events?.close();
  resetView();
  setCaptureAction("running");
  try {
    const response = await fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const result = (await response.json()) as { captureId?: string; error?: string };
    if (!response.ok || !result.captureId)
      throw new Error(result.error ?? "Could not start capture");

    activeCaptureId = result.captureId;
    const next: Capture = {
      id: result.captureId,
      url,
      state: "running",
      status: null,
      contentType: "unknown",
      headers: {},
      startedAt: new Date().toISOString(),
      completedAt: null,
      chunks: [],
      error: null,
    };
    addToHistory(next);
    selectHistoryCapture(next.id);
    events = new EventSource(`/api/capture/${result.captureId}/events`);
    events.addEventListener("snapshot", receiveSnapshot);
    events.addEventListener("metadata", receiveSnapshot);
    events.addEventListener("chunk", receiveChunk);
    events.addEventListener("complete", receiveSnapshot);
    events.addEventListener("capture-error", receiveError);
    events.onerror = () => {
      if (capture?.state === "running")
        showError("The live capture connection closed unexpectedly.");
    };
  } catch (error) {
    activeCaptureId = null;
    setCaptureAction("idle");
    showError(error instanceof Error ? error.message : String(error));
  }
}

async function abortCapture(): Promise<void> {
  if (!activeCaptureId) return;
  await fetch(`/api/capture/${activeCaptureId}/abort`, { method: "POST" });
}

function setCaptureAction(state: "idle" | "running"): void {
  const running = state === "running";
  elements.captureAction.textContent = running ? "Abort capture" : "New capture";
  elements.captureAction.classList.toggle("destructive", running);
  elements.captureAction.setAttribute("aria-label", running ? "Abort capture" : "New capture");
}

function receiveSnapshot(event: Event): void {
  updateCapture(JSON.parse((event as MessageEvent).data) as Capture);
}

function receiveChunk(event: Event): void {
  const chunk = JSON.parse((event as MessageEvent).data) as Chunk;
  const active = getHistoryCapture(activeCaptureId);
  if (!active) return;
  active.chunks.push(chunk);
  if (selectedCaptureId === active.id) {
    renderSelectedCapture();
    if (followingLatest) selectChunk(chunk.number - 1);
  }
  renderHistory();
}

function receiveError(event: Event): void {
  const data = JSON.parse((event as MessageEvent).data) as Capture;
  updateCapture(data);
  showError(data.error ?? "The capture failed.");
}

function updateCapture(next: Capture): void {
  replaceHistoryCapture(next);
  if (selectedCaptureId === next.id) {
    const wasHtml = isHtmlCapture(capture);
    capture = next;
    if (!wasHtml && isHtmlCapture(next)) detailView = "preview";
    renderSelectedCapture();
    if (followingLatest && next.chunks.length) selectChunk(next.chunks.length - 1);
    if (next.state === "failed") showError(next.error ?? "The capture failed.");
  }
  renderHistory();
  if (next.state !== "running") {
    setCaptureAction("idle");
    events?.close();
    activeCaptureId = null;
    persistHistory();
  }
}

function addToHistory(next: Capture): void {
  history = [next, ...history.filter((item) => item.id !== next.id)];
  trimHistory();
  renderHistory();
}

function replaceHistoryCapture(next: Capture): void {
  const index = history.findIndex((item) => item.id === next.id);
  if (index === -1) addToHistory(next);
  else history[index] = next;
}

function trimHistory(): void {
  while (history.length > MAX_CAPTURE_HISTORY) {
    const index = [...history].reverse().findIndex((item) => item.state !== "running");
    if (index === -1) return;
    history.splice(history.length - 1 - index, 1);
  }
}

function clearHistory(): void {
  history = history.filter((item) => item.state === "running");
  persistHistory();
  if (selectedCaptureId && !getHistoryCapture(selectedCaptureId)) {
    if (activeCaptureId) selectHistoryCapture(activeCaptureId);
    else resetView();
  }
  renderHistory();
  elements.historyDialog.close();
}

function loadHistory(): Capture[] {
  try {
    const raw = localStorage.getItem(historyStorageKey);
    if (!raw) return [];

    const stored: unknown = JSON.parse(raw);
    if (!isStoredHistory(stored)) {
      clearStoredHistory();
      return [];
    }

    return stored.captures.slice(0, MAX_CAPTURE_HISTORY);
  } catch {
    clearStoredHistory();
    return [];
  }
}

function isStoredHistory(value: unknown): value is StoredHistory {
  if (!value || typeof value !== "object") return false;
  const stored = value as Partial<StoredHistory>;
  return (
    stored.version === historyStorageVersion &&
    Array.isArray(stored.captures) &&
    stored.captures.every(isCapture)
  );
}

function isCapture(value: unknown): value is Capture {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Capture>;
  return (
    typeof item.id === "string" &&
    typeof item.url === "string" &&
    ["complete", "failed", "aborted"].includes(item.state as string) &&
    (typeof item.status === "number" || item.status === null) &&
    typeof item.contentType === "string" &&
    item.headers !== null &&
    typeof item.headers === "object" &&
    typeof item.startedAt === "string" &&
    (typeof item.completedAt === "string" || item.completedAt === null) &&
    Array.isArray(item.chunks) &&
    item.chunks.every(isChunk) &&
    (typeof item.error === "string" || item.error === null)
  );
}

function isChunk(value: unknown): value is Chunk {
  if (!value || typeof value !== "object") return false;
  const chunk = value as Partial<Chunk>;
  return (
    typeof chunk.number === "number" &&
    typeof chunk.elapsedMs === "number" &&
    typeof chunk.deltaMs === "number" &&
    typeof chunk.byteLength === "number" &&
    typeof chunk.text === "string"
  );
}

function clearStoredHistory(): void {
  localStorage.removeItem(historyStorageKey);
}

function persistHistory(): void {
  const terminal = history.filter(isTerminalCapture).slice(0, MAX_CAPTURE_HISTORY);
  try {
    localStorage.setItem(
      historyStorageKey,
      JSON.stringify({ version: historyStorageVersion, captures: terminal }),
    );
  } catch {
    trimPersistedHistory(terminal);
  }
}

function trimPersistedHistory(captures: Capture[]): void {
  while (captures.length) {
    try {
      localStorage.setItem(
        historyStorageKey,
        JSON.stringify({ version: historyStorageVersion, captures }),
      );
      return;
    } catch {
      captures.pop();
    }
  }
  localStorage.removeItem(historyStorageKey);
}

function isTerminalCapture(item: Capture): boolean {
  return item.state !== "running";
}

function getHistoryCapture(id: string | null): Capture | null {
  return history.find((item) => item.id === id) ?? null;
}

function selectHistoryCapture(id: string): void {
  const next = getHistoryCapture(id);
  if (!next) return;
  selectedCaptureId = id;
  capture = next;
  elements.url.value = next.url;
  detailView = isHtmlCapture(next) ? "preview" : "source";
  followingLatest = id === activeCaptureId || !selectedChunkByCapture.has(id);
  renderSelectedCapture();
  const selectedIndex = followingLatest ? undefined : selectedChunkByCapture.get(id);
  if (selectedIndex !== undefined) selectChunk(selectedIndex);
  else if (next.chunks.length) selectChunk(next.chunks.length - 1);
  elements.historyDialog.close();
}

function renderHistory(): void {
  elements.historyList.replaceChildren();
  elements.historyEmpty.hidden = history.length > 0;
  elements.historyCount.textContent = "";
  if (history.length) elements.historyCount.dataset.count = String(history.length);
  else delete elements.historyCount.dataset.count;
  elements.clearHistory.disabled = !history.some((item) => item.state !== "running");
  for (const item of history) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.captureId = item.id;
    button.className = item.id === selectedCaptureId ? "history-entry selected" : "history-entry";
    button.innerHTML = `<span class="history-entry-heading"><strong data-state="${item.state}">${historyState(item.state)}</strong><small>${formatRelativeTime(item.completedAt ?? item.startedAt)}</small></span><span class="history-entry-url" title="${item.url}">${new URL(item.url).hostname}</span><span class="history-entry-meta">${item.status ?? "-"} · ${item.chunks.length} chunks · ${formatBytes(item.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))}</span>`;
    button.addEventListener("click", () => selectHistoryCapture(item.id));
    elements.historyList.append(button);
  }
}

function focusHistoryEntry(id: string | null): void {
  if (!id) {
    const first = elements.historyList.querySelector<HTMLButtonElement>(".history-entry");
    first?.focus();
    first?.scrollIntoView({ block: "nearest" });
    return;
  }

  const entry = elements.historyList.querySelector(
    `[data-capture-id="${CSS.escape(id)}"]`,
  ) as HTMLButtonElement | null;
  entry?.focus();
  entry?.scrollIntoView({ block: "nearest" });
}

function moveHistoryFocus(direction: number): void {
  const entries = [...elements.historyList.querySelectorAll<HTMLButtonElement>(".history-entry")];
  if (!entries.length) return;
  const currentIndex = entries.indexOf(document.activeElement as HTMLButtonElement);
  const nextIndex =
    currentIndex === -1 ? 0 : Math.max(0, Math.min(entries.length - 1, currentIndex + direction));
  entries[nextIndex]?.focus();
  entries[nextIndex]?.scrollIntoView({ block: "nearest" });
}

function historyState(state: Capture["state"]): string {
  return capitalize(state);
}

function formatRelativeTime(value: string): string {
  const elapsed = Math.max(0, Date.now() - Date.parse(value));
  if (elapsed < 60_000) return "just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function renderSelectedCapture(): void {
  if (!capture) return;
  renderSummary();
  renderChunkList();
  renderDetail();
}

function setDetailView(view: "source" | "preview"): void {
  detailView = view;
  renderDetail();
}

function renderDetail(): void {
  const canPreview = isHtmlCapture(capture);
  if (!canPreview) detailView = "source";
  elements.groupingWindow.value = String(groupingWindowMs);
  const groupingEnabled = isGroupingEnabled();
  const groups = capture ? getChunkGroups(capture.chunks) : [];
  const selectedGroupIndex = groups.findIndex(
    (group) => selectedIndex >= group.startIndex && selectedIndex <= group.endIndex,
  );
  elements.previous.disabled =
    !capture ||
    selectedIndex < 0 ||
    (groupingEnabled ? selectedGroupIndex <= 0 : selectedIndex <= 0);
  elements.next.disabled =
    !capture ||
    selectedIndex < 0 ||
    (groupingEnabled
      ? selectedGroupIndex === -1 || selectedGroupIndex >= groups.length - 1
      : selectedIndex >= capture.chunks.length - 1);
  elements.preview.disabled = !canPreview;
  elements.source.classList.toggle("selected", detailView === "source");
  elements.preview.classList.toggle("selected", detailView === "preview");
  elements.source.setAttribute("aria-checked", String(detailView === "source"));
  elements.preview.setAttribute("aria-checked", String(detailView === "preview"));
  elements.output.hidden = detailView !== "source";
  elements.previewEmpty.hidden = true;
  elements.previewFrame.hidden = true;
  revokePreviewObjectUrl();

  if (detailView === "preview" && canPreview) {
    const selectedGroup = capture
      ? getChunkGroups(capture.chunks).find(
          (group) => selectedIndex >= group.startIndex && selectedIndex <= group.endIndex,
        )
      : null;
    const chunkLimit = selectedGroup
      ? selectedGroup.endIndex + 1
      : selectedIndex >= 0
        ? selectedIndex + 1
        : (capture?.chunks.length ?? 0);
    const html =
      capture?.chunks
        .slice(0, chunkLimit)
        .map((chunk) => chunk.text)
        .join("") ?? "";
    if (!html) {
      elements.previewEmpty.textContent = "Waiting for HTML content.";
      elements.previewEmpty.hidden = false;
      return;
    }
    const previewHtml = preparePreviewHtml(html, capture?.url ?? "");
    previewObjectUrl = URL.createObjectURL(new Blob([previewHtml], { type: "text/html" }));
    elements.previewFrame.src = previewObjectUrl;
    elements.previewFrame.hidden = false;
  }
}

function preparePreviewHtml(html: string, url: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  if (!document.head.querySelector("base")) {
    const base = document.createElement("base");
    base.href = url;
    document.head.prepend(base);
  }
  const historyGuard = document.createElement("script");
  historyGuard.textContent = `
    (() => {
      const originalReplaceState = history.replaceState;
      history.replaceState = function (state, title, url) {
        const isNextInitialization =
          location.protocol === "blob:" &&
          title === "" &&
          state &&
          typeof state === "object" &&
          state.__NA === true &&
          state.__PRIVATE_NEXTJS_INTERNALS_TREE &&
          typeof url === "string" &&
          new URL(url, location.href).origin === location.origin;

        if (isNextInitialization) {
          return originalReplaceState.call(this, state, title, location.href);
        }

        return originalReplaceState.call(this, state, title, url);
      };
    })();
  `;
  document.head.prepend(historyGuard);
  rewritePreviewUrls(document, url);
  return `<!doctype html>${document.documentElement.outerHTML}`;
}

function rewritePreviewUrls(document: Document, baseUrl: string): void {
  for (const element of document.querySelectorAll<HTMLElement>(
    "[href], [src], [poster], form[action]",
  )) {
    for (const attribute of ["href", "src", "poster", "action"]) {
      const value = element.getAttribute(attribute);
      if (value) element.setAttribute(attribute, resolvePreviewUrl(value, baseUrl));
    }
  }
}

function resolvePreviewUrl(value: string, baseUrl: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#") || /^(data|blob|javascript|mailto|tel):/i.test(trimmed)) {
    return value;
  }
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return value;
  }
}

function revokePreviewObjectUrl(): void {
  if (!previewObjectUrl) return;
  URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = null;
}

function isHtmlCapture(item: Capture | null): boolean {
  if (!item) return false;
  return ["text/html", "application/xhtml+xml"].includes(
    item.contentType.split(";", 1)[0].trim().toLowerCase(),
  );
}

function selectChunk(index: number): void {
  if (!capture || index < 0 || index >= capture.chunks.length) return;
  selectedIndex = index;
  if (capture) selectedChunkByCapture.set(capture.id, index);
  const chunk = capture.chunks[index];
  const group = getChunkGroups(capture.chunks).find(
    (candidate) => index >= candidate.startIndex && index <= candidate.endIndex,
  );
  const detail =
    isGroupingEnabled() && group ? group : createChunkGroup(capture.chunks, index, index);
  followingLatest = detail.endIndex === capture.chunks.length - 1;
  const totalBytes = getCumulativeBytes(capture.chunks, detail.endIndex);
  elements.title.textContent = `Chunk ${chunk.number}`;
  if (isGroupingEnabled() && group) {
    elements.title.textContent = formatChunkRange(group);
  }
  elements.meta.textContent = `${capture.chunks[detail.endIndex].elapsedMs} ms · ${formatBytes(totalBytes)} | +${detail.deltaMs} ms · +${formatBytes(detail.byteLength)}`;
  elements.output.textContent = detail.text || "(empty decoded chunk)";
  renderDetail();
  renderChunkList();
  elements.list
    .querySelector<HTMLButtonElement>(`.chunk-row.selected`)
    ?.scrollIntoView({ block: "nearest" });
}

function selectAdjacent(direction: number): void {
  if (!capture || selectedIndex < 0) return;
  if (!isGroupingEnabled()) {
    selectChunk(selectedIndex + direction);
    return;
  }
  const groups = getChunkGroups(capture.chunks);
  const groupIndex = groups.findIndex(
    (group) => selectedIndex >= group.startIndex && selectedIndex <= group.endIndex,
  );
  const nextGroup = groups[groupIndex + direction];
  if (nextGroup) selectChunk(nextGroup.startIndex);
}

function selectBoundary(last: boolean): void {
  if (!capture?.chunks.length) return;
  if (!isGroupingEnabled()) {
    selectChunk(last ? capture.chunks.length - 1 : 0);
    return;
  }
  const groups = getChunkGroups(capture.chunks);
  selectChunk((last ? groups.at(-1) : groups[0])?.startIndex ?? -1);
}

function renderSummary(): void {
  if (!capture) return;
  const bytes = capture.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const time = capture.chunks.at(-1)?.elapsedMs ?? 0;
  renderSummaryLink(
    elements.status,
    capture.status ? String(capture.status) : "",
    capture.status && capture.status >= 100 && capture.status <= 599
      ? `https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/${capture.status}`
      : "",
  );
  elements.count.textContent = String(capture.chunks.length);
  elements.bytes.textContent = formatBytes(bytes);
  elements.time.textContent = `${time} ms`;
  renderSummaryLink(
    elements.contentType,
    capture.contentType,
    "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Type",
  );
  elements.state.textContent = capitalize(capture.state);
  elements.state.dataset.state = capture.state;
  elements.state.previousElementSibling?.setAttribute("data-state", capture.state);
}

function renderSummaryLink(element: HTMLElement, value: string, href: string): void {
  element.replaceChildren();
  if (!value) {
    element.textContent = "-";
    return;
  }

  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = value;
  element.append(link);
}

function renderChunkList(): void {
  elements.list.replaceChildren();
  elements.empty.hidden = Boolean(capture?.chunks.length);
  const chunks = capture?.chunks ?? [];
  const groups = isGroupingEnabled()
    ? getChunkGroups(chunks)
    : chunks.map((_, index) => createChunkGroup(chunks, index, index));
  for (const group of groups) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const totalBytes = getCumulativeBytes(chunks, group.endIndex);
    button.type = "button";
    const selected = selectedIndex >= group.startIndex && selectedIndex <= group.endIndex;
    button.className = selected ? "chunk-row selected" : "chunk-row";
    button.innerHTML = `<span>${formatChunkRange(group)}</span><small><span class="chunk-metric"><span>+${group.deltaMs} ms</span><span>·</span><span>+${formatBytes(group.byteLength)}</span></span><span class="chunk-metric"><span>${chunks[group.endIndex].elapsedMs} ms</span><span>·</span><span>${formatBytes(totalBytes)}</span></span></small>`;
    button.addEventListener("click", () => selectChunk(group.startIndex));
    item.append(button);
    elements.list.append(item);
  }
  if (capture?.state === "running") {
    const item = document.createElement("li");
    item.className = "chunk-skeleton";
    item.setAttribute("aria-label", "Waiting for next chunk");
    item.innerHTML =
      '<span class="packet-dot"></span><span class="packet-dot"></span><span class="packet-dot"></span>';
    elements.list.append(item);
  }
}

function isGroupingEnabled(): boolean {
  return groupingWindowMs > 0;
}

function getChunkGroups(chunks: Chunk[]): ChunkGroup[] {
  const groups: ChunkGroup[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const previous = groups.at(-1);
    if (previous && chunks[index].deltaMs <= groupingWindowMs) {
      previous.endIndex = index;
      previous.chunks.push(chunks[index]);
      previous.deltaMs += chunks[index].deltaMs;
      previous.byteLength += chunks[index].byteLength;
      previous.text += chunks[index].text;
    } else {
      groups.push(createChunkGroup(chunks, index, index));
    }
  }
  return groups;
}

function createChunkGroup(chunks: Chunk[], startIndex: number, endIndex: number): ChunkGroup {
  const groupChunks = chunks.slice(startIndex, endIndex + 1);
  return {
    startIndex,
    endIndex,
    chunks: groupChunks,
    deltaMs: groupChunks.reduce((sum, chunk) => sum + chunk.deltaMs, 0),
    byteLength: groupChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
    text: groupChunks.map((chunk) => chunk.text).join(""),
  };
}

function formatChunkRange(group: ChunkGroup): string {
  const first = group.chunks[0].number;
  const last = group.chunks.at(-1)?.number ?? first;
  return first === last ? `Chunk ${first}` : `Chunks ${first}-${last}`;
}

function resetView(): void {
  capture = null;
  selectedCaptureId = null;
  selectedIndex = -1;
  followingLatest = true;
  elements.list.replaceChildren();
  elements.empty.hidden = false;
  elements.output.textContent = "Chunk details will appear here.";
  detailView = "source";
  elements.source.classList.add("selected");
  elements.preview.classList.remove("selected");
  renderDetail();
  elements.title.textContent = "No chunk selected";
  elements.meta.textContent = "The selected transport chunk will appear here.";
  elements.status.textContent = "-";
  elements.count.textContent = "0";
  elements.bytes.textContent = "0 B";
  elements.time.textContent = "0 ms";
  elements.contentType.textContent = "-";
  clearError();
}

function showError(message: string): void {
  elements.error.textContent = message;
  elements.error.hidden = false;
}

function clearError(): void {
  elements.error.textContent = "";
  elements.error.hidden = true;
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function getCumulativeBytes(chunks: Chunk[], index: number): number {
  return chunks.slice(0, index + 1).reduce((sum, chunk) => sum + chunk.byteLength, 0);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
