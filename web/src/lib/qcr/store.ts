import type { QcrBootstrap, QcrProjectionEntry, QcrStreamEnvelope } from "./contracts.ts";
import { MAX_SSE_BUFFER, parseSseFrames } from "./sse.ts";

export type QcrConnection = "idle" | "bootstrapping" | "live" | "reconnecting" | "resyncing" | "stale" | "failed";
export type QcrState = {
  connection: QcrConnection;
  protocolVersion: string;
  streamId: string;
  cursor: number;
  projectionGeneration: string;
  projectionVersion: string;
  reducerVersion: string;
  projections: ReadonlyMap<string, unknown>;
  epoch: number;
  lastSemanticUpdate: number | null;
  lastTransportActivity: number | null;
  error: string | null;
};

const emptyState = (): QcrState => ({
  connection: "idle", protocolVersion: "", streamId: "", cursor: 0,
  projectionGeneration: "", projectionVersion: "", reducerVersion: "",
  projections: new Map(), epoch: 0, lastSemanticUpdate: null,
  lastTransportActivity: null, error: null,
});

let state = emptyState();
let controller: AbortController | null = null;
let subscribers = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
const listeners = new Set<() => void>();
const semanticListeners = new Set<() => void>();

export const projectionKey = (kind: string, key: string) => `${kind}\u0000${key}`;
export const getQcrState = (): QcrState => state;
export const getQcrProjection = <T>(kind: string, key: string): T | null =>
  (state.projections.get(projectionKey(kind, key)) as T | undefined) ?? null;

function emit(semantic = false) {
  for (const listener of listeners) listener();
  if (semantic) for (const listener of semanticListeners) listener();
}

function projectionMap(entries: QcrProjectionEntry[], tuple?: { generation: string; projectionVersion: string; reducerVersion: string }): ReadonlyMap<string, unknown> {
  const next = new Map<string, unknown>();
  for (const entry of entries) {
    if (!entry || typeof entry.kind !== "string" || typeof entry.key !== "string" || !("value" in entry)) {
      throw new Error("Malformed QCR projection entry");
    }
    const id = projectionKey(entry.kind, entry.key);
    if (next.has(id)) throw new Error(`Duplicate QCR projection ${entry.kind}/${entry.key}`);
    const metadata = typeof entry.value === "object" && entry.value !== null
      ? (entry.value as { metadata?: Record<string, unknown> }).metadata : undefined;
    if (tuple && (!metadata || metadata.projection_generation !== tuple.generation ||
        metadata.projection_version !== tuple.projectionVersion || metadata.reducer_version !== tuple.reducerVersion)) {
      throw new Error(`Inconsistent QCR projection metadata for ${entry.kind}/${entry.key}`);
    }
    next.set(id, entry.value);
  }
  return next;
}

function validateBootstrap(value: unknown): QcrBootstrap {
  const b = value as Partial<QcrBootstrap>;
  if (!b || b.protocol_version !== "1.0.0" || b.replacement !== true ||
      typeof b.stream_id !== "string" || typeof b.cursor !== "number" ||
      typeof b.projection_generation !== "string" || b.projection_version !== "1.0.0" ||
      b.reducer_version !== "1.0.0" || !Array.isArray(b.projections)) {
    throw new Error("Unsupported or malformed QCR bootstrap");
  }
  projectionMap(b.projections, { generation: b.projection_generation, projectionVersion: b.projection_version, reducerVersion: b.reducer_version });
  return b as QcrBootstrap;
}

export function acceptBootstrap(value: unknown): QcrState {
  const b = validateBootstrap(value);
  const now = Date.now();
  state = {
    connection: "live", protocolVersion: b.protocol_version, streamId: b.stream_id,
    cursor: b.cursor, projectionGeneration: b.projection_generation,
    projectionVersion: b.projection_version, reducerVersion: b.reducer_version,
    projections: projectionMap(b.projections, { generation: b.projection_generation, projectionVersion: b.projection_version, reducerVersion: b.reducer_version }), epoch: state.epoch + 1,
    lastSemanticUpdate: now, lastTransportActivity: now, error: null,
  };
  emit(true);
  return state;
}

export type EnvelopeResult = "ignored" | "event-only" | "replaced" | "resync";
export function acceptEnvelope(value: unknown, epoch = state.epoch): EnvelopeResult {
  if (epoch !== state.epoch) return "ignored";
  const e = value as Partial<QcrStreamEnvelope>;
  if (!e || typeof e.cursor !== "number" || typeof e.stream_id !== "string" ||
      typeof e.projection_generation !== "string" || typeof e.reducer_version !== "string" ||
      typeof e.protocol_version !== "string" || !e.payload || typeof e.payload !== "object") return "resync";
  if (e.cursor <= state.cursor) return "ignored";
  if (e.cursor !== state.cursor + 1 || e.stream_id !== state.streamId ||
      e.projection_generation !== state.projectionGeneration ||
      e.reducer_version !== state.reducerVersion || e.protocol_version !== state.protocolVersion) return "resync";
  if (e.event_type === "RESYNC_REQUIRED") return "resync";
  const now = Date.now();
  if (e.payload.operation === "EVENT_ONLY") {
    state = { ...state, cursor: e.cursor, lastTransportActivity: now };
    emit(false);
    return "event-only";
  }
  if (e.payload.operation === "REPLACE_PROJECTIONS" && Array.isArray(e.payload.projections)) {
    let next: ReadonlyMap<string, unknown>;
    try { next = projectionMap(e.payload.projections, { generation: state.projectionGeneration, projectionVersion: state.projectionVersion, reducerVersion: state.reducerVersion }); } catch { return "resync"; }
    state = { ...state, cursor: e.cursor, projections: next, lastSemanticUpdate: now, lastTransportActivity: now };
    emit(true);
    return "replaced";
  }
  return "resync";
}

export function acceptHeartbeat(epoch = state.epoch): void {
  if (epoch !== state.epoch) return;
  state = { ...state, lastTransportActivity: Date.now() };
  emit(false);
}

async function openStream(epoch: number): Promise<void> {
  const params = new URLSearchParams({ cursor: String(state.cursor), stream_id: state.streamId,
    projection_generation: state.projectionGeneration, reducer_version: state.reducerVersion });
  controller = new AbortController();
  const response = await fetch(`/qcr-os/stream/v1/operating-state?${params}`, { signal: controller.signal });
  if (!response.ok || !response.body) throw new Error(`QCR live stream failed (${response.status})`);
  state = { ...state, connection: "live", error: null };
  emit();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamConfirmed = false;
  while (epoch === state.epoch && subscribers > 0) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    if (buffer.length > MAX_SSE_BUFFER) throw new Error("QCR SSE buffer exceeded its limit");
    const parsed = parseSseFrames(buffer);
    buffer = parsed.remainder;
    for (const frame of parsed.frames) {
      if (!streamConfirmed) {
        reconnectAttempt = 0;
        streamConfirmed = true;
      }
      if (frame.comment !== undefined && frame.data === undefined) { acceptHeartbeat(epoch); continue; }
      if (!frame.data) continue;
      let envelope: unknown;
      try { envelope = JSON.parse(frame.data); } catch { await refreshQcrState("Malformed QCR stream event"); return; }
      if (acceptEnvelope(envelope, epoch) === "resync") { await refreshQcrState("QCR stream requested resync"); return; }
    }
  }
}

function scheduleReconnect(cause: unknown) {
  if (!subscribers || (cause as Error)?.name === "AbortError") return;
  const message = cause instanceof Error ? cause.message : "QCR stream disconnected";
  state = { ...state, connection: "reconnecting", error: message };
  emit();
  const wait = Math.min(5_000, 250 * 2 ** reconnectAttempt++);
  reconnectTimer = setTimeout(() => { void connect().catch(scheduleReconnect); }, wait);
}

async function connect(): Promise<void> {
  if (!state.streamId) { await refreshQcrState(); return; }
  await openStream(state.epoch);
  if (subscribers) scheduleReconnect(new Error("QCR stream ended"));
}

export async function refreshQcrState(reason?: string): Promise<void> {
  controller?.abort();
  state = { ...state, connection: reason ? "resyncing" : "bootstrapping", error: reason ?? null, epoch: state.epoch + 1 };
  emit();
  try {
    const response = await fetch("/qcr-os/api/v1/bootstrap");
    if (response.status === 409) {
      state = { ...state, connection: "stale", error: "QCR projections are rebuilding" };
      emit();
      if (subscribers) reconnectTimer = setTimeout(() => { void refreshQcrState().catch(scheduleReconnect); }, 1_000);
      return;
    }
    if (!response.ok) throw new Error(`QCR bootstrap failed (${response.status})`);
    acceptBootstrap(await response.json());
    reconnectAttempt = 0;
    if (subscribers) void openStream(state.epoch).catch(scheduleReconnect);
  } catch (cause) {
    state = { ...state, connection: "failed", error: cause instanceof Error ? cause.message : "QCR bootstrap failed" };
    emit();
    throw cause;
  }
}

export function subscribeQcrState(listener: () => void): () => void {
  listeners.add(listener); subscribers += 1;
  if (subscribers === 1) void refreshQcrState().catch(scheduleReconnect);
  return () => {
    listeners.delete(listener); subscribers = Math.max(0, subscribers - 1);
    if (!subscribers) { controller?.abort(); controller = null; if (reconnectTimer) clearTimeout(reconnectTimer); reconnectTimer = null; }
  };
}

export function subscribeQcrSemantic(listener: () => void): () => void {
  semanticListeners.add(listener);
  return () => semanticListeners.delete(listener);
}

export function resetQcrStateForTest(): void {
  controller?.abort(); if (reconnectTimer) clearTimeout(reconnectTimer);
  controller = null; reconnectTimer = null; reconnectAttempt = 0; subscribers = 0;
  listeners.clear(); semanticListeners.clear(); state = emptyState();
}
