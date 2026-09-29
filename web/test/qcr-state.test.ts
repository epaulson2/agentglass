import { afterEach, expect, test } from "bun:test";
import { acceptBootstrap, acceptEnvelope, acceptHeartbeat, getQcrProjection, getQcrState, resetQcrStateForTest, subscribeQcrSemantic } from "../src/lib/qcr/store.ts";
import { MAX_SSE_FRAME, parseSseFrames } from "../src/lib/qcr/sse.ts";

afterEach(resetQcrStateForTest);

const metadata = { projection_generation: "01990000-0000-7000-8000-000000000099", projection_version: "1.0.0", reducer_version: "1.0.0" };
const entry = (kind: string, key: string, value: Record<string, unknown>) => ({ kind, key, value: { ...value, metadata } });
const bootstrap = (projections = [entry("portfolio", "current", { value: 1 })]) => ({
  protocol_version: "1.0.0", stream_id: "operating", cursor: 4,
  projection_generation: "01990000-0000-7000-8000-000000000099",
  projection_version: "1.0.0", reducer_version: "1.0.0", replacement: true as const, projections,
});
const envelope = (over: Record<string, unknown> = {}) => ({
  protocol_version: "1.0.0", stream_id: "operating", cursor: 5,
  event_type: "projection.batch_replaced",
  projection_generation: "01990000-0000-7000-8000-000000000099",
  projection_version: "1.0.0", reducer_version: "1.0.0",
  payload: { operation: "REPLACE_PROJECTIONS", projections: [entry("portfolio", "current", { value: 2 })] }, ...over,
});

test("bootstrap is an atomic replacement and duplicate keys fail closed", () => {
  acceptBootstrap(bootstrap());
  expect(getQcrProjection<{ value: number }>("portfolio", "current")?.value).toBe(1);
  expect(() => acceptBootstrap(bootstrap([entry("x", "y", { value: 1 }), entry("x", "y", { value: 2 })]))).toThrow("Duplicate");
  expect(getQcrProjection<{ value: number }>("portfolio", "current")?.value).toBe(1);
  expect(() => acceptBootstrap(bootstrap([{ kind: "x", key: "y", value: { metadata: { ...metadata, reducer_version: "2.0.0" } } }]))).toThrow("Inconsistent");
});

test("replacement notifies semantic consumers; event-only and heartbeat do not", () => {
  acceptBootstrap(bootstrap());
  let semantic = 0;
  const unsubscribe = subscribeQcrSemantic(() => { semantic += 1; });
  expect(acceptEnvelope(envelope({ payload: { operation: "EVENT_ONLY", event: {} } }))).toBe("event-only");
  acceptHeartbeat();
  expect(semantic).toBe(0);
  expect(acceptEnvelope(envelope({ cursor: 6 }))).toBe("replaced");
  expect(semantic).toBe(1);
  expect(getQcrProjection<{ value: number }>("portfolio", "current")?.value).toBe(2);
  unsubscribe();
});

test("duplicates are ignored and gaps or tuple changes demand resync", () => {
  acceptBootstrap(bootstrap());
  expect(acceptEnvelope(envelope({ cursor: 4 }))).toBe("ignored");
  expect(acceptEnvelope(envelope({ cursor: 7 }))).toBe("resync");
  expect(acceptEnvelope(envelope({ stream_id: "other" }))).toBe("resync");
  expect(acceptEnvelope(envelope({ projection_generation: "changed" }))).toBe("resync");
  expect(acceptEnvelope(envelope({ reducer_version: "2.0.0" }))).toBe("resync");
  expect(acceptEnvelope({ malformed: true })).toBe("resync");
});

test("late envelopes from retired epochs cannot apply", () => {
  const first = acceptBootstrap(bootstrap()).epoch;
  acceptBootstrap({ ...bootstrap(), cursor: 10 });
  expect(acceptEnvelope(envelope({ cursor: 11 }), first)).toBe("ignored");
  expect(getQcrState().cursor).toBe(10);
});

test("SSE parser handles comments and bounded frames", () => {
  const parsed = parseSseFrames(": heartbeat\n\nevent: changed\nid: 5\ndata: {\"ok\":true}\n\npartial");
  expect(parsed.frames[0]?.comment).toBe("heartbeat");
  expect(parsed.frames[1]).toEqual({ event: "changed", id: "5", data: "{\"ok\":true}" });
  expect(parsed.remainder).toBe("partial");
  expect(() => parseSseFrames(`data: ${"x".repeat(MAX_SSE_FRAME)}\n\n`)).toThrow("frame exceeded");
});
