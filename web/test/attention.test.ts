import { afterEach, test, expect } from "bun:test";
import { collectAttention, type AttentionInput } from "../src/lib/attention.ts";
import {
  listQcrAttention,
  refreshQcrAttention,
  respondToQcrAttention,
  type QcrAttention,
} from "../src/lib/qcrActions.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const NOW = 1_700_000_000_000;
const input = (over: Partial<AttentionInput> = {}): AttentionInput =>
  ({ gates: [], insights: [], alerts: [], chats: [], agents: [], ...over } as AttentionInput);

const gate = (id: string, over = {}) =>
  ({ id, source_app: "orbit", session_id: "s-" + id, tool_name: "Bash", summary: "", created: NOW, ...over }) as any;
const chat = (id: string, over = {}) =>
  ({ id, title: "chat " + id, attention: "blocked", blockedTool: "Write", messages: [], createdAt: NOW, ...over }) as any;
const agent = (key: string, over = {}) =>
  ({ key, session_id: "sess-" + key, source_app: "orbit", status: "idle", outcome: "unanswered", lastSeen: NOW, ...over }) as any;

test("nothing pending is an empty list, not a zero-length lie", () => {
  expect(collectAttention(input())).toEqual([]);
});

test("a held tool call is collected as blocking", () => {
  const [item] = collectAttention(input({ gates: [gate("g1")] }));
  expect(item.level).toBe("blocking");
  expect(item.source).toBe("gate");
  expect(item.target).toEqual({ kind: "session", id: "s-g1", app: "orbit" });
});

// The gap this whole module exists to close: the panel named "What needs you"
// had no idea a chat could be blocked.
test("a blocked chat appears, and names the tool that was refused", () => {
  const [item] = collectAttention(input({ chats: [chat("c1")] }));
  expect(item.source).toBe("chat");
  expect(item.level).toBe("blocking");
  expect(item.text).toContain("Write");
});

test("a chat that isn't blocked is not collected", () => {
  expect(collectAttention(input({ chats: [chat("c1", { attention: "done" })] }))).toEqual([]);
  expect(collectAttention(input({ chats: [chat("c1", { attention: "none" })] }))).toEqual([]);
});

test("a session that stopped on an unanswered question is collected", () => {
  const [item] = collectAttention(input({ agents: [agent("orbit:a1")] }));
  expect(item.source).toBe("agent");
  expect(item.text).toContain("nobody answered");
});

test("a settled session is not", () => {
  expect(collectAttention(input({ agents: [agent("orbit:a1", { outcome: "settled" })] }))).toEqual([]);
});

test("info insights are commentary and never counted", () => {
  const insights = [{ id: "i1", severity: "info", kind: "spend", title: "spend is up", detail: "", session: null, ts: NOW }] as any;
  expect(collectAttention(input({ insights }))).toEqual([]);
});

// The inversion the merge fixes: deriveAlerts sorts by time alone, so an hour-old
// error outranked something that just stopped to ask you a question.
test("severity beats recency", () => {
  const items = collectAttention(input({
    alerts: [{ id: "old", level: "error", agent: "orbit:x", text: "boom", ts: NOW }] as any,
    gates: [gate("g1", { created: NOW - 60 * 60_000 })],
  }));
  expect(items[0].source).toBe("gate");     // an hour older, still first
  expect(items[1].source).toBe("agent");
});

test("recency breaks ties within a severity", () => {
  const items = collectAttention(input({ gates: [gate("old", { created: NOW - 5000 }), gate("new", { created: NOW })] }));
  expect(items[0].id).toBe("gate:new");
});

// Two detectors describing one stuck session is one problem, not two — the count
// has to reflect problems.
test("the same session raised twice collapses to the more severe", () => {
  const items = collectAttention(input({
    gates: [gate("g1", { session_id: "dup" })],
    agents: [agent("orbit:a1", { session_id: "dup" })],
  }));
  expect(items).toHaveLength(1);
  expect(items[0].level).toBe("blocking");
});

test("items with no target are never merged together", () => {
  const alerts = [
    { id: "a", level: "error", agent: "x", text: "one", ts: NOW },
    { id: "b", level: "error", agent: "y", text: "two", ts: NOW },
  ] as any;
  expect(collectAttention(input({ alerts }))).toHaveLength(2);
});

test("canonical QCR attention is namespaced and preserves legal responses", () => {
  const [item] = collectAttention(input({
    qcr: [{
      attention_id: "01990000-0000-7000-8000-000000000801",
      initiative_id: "01990000-0000-7000-8000-000000000001",
      attention_type: "APPROVAL_REQUIRED",
      owning_domain: "PRODUCT",
      priority: "HIGH",
      reason_code: "SCOPE_APPROVAL",
      summary: "Approve Product scope",
      blocking: true,
      lifecycle_state: "OPEN",
      legal_responses: [{ option_id: "approve", label: "Approve" }],
      actionable: true,
      state_version: 1,
      created_at: new Date(NOW).toISOString(),
    }],
  }));
  expect(item.id).toBe("qcr:01990000-0000-7000-8000-000000000801");
  expect(item.source).toBe("qcr");
  expect(item.qcr?.responses[0]?.label).toBe("Approve");
});

test("a stale QCR response refreshes canonical state and reports the typed conflict", async () => {
  const item: QcrAttention = {
    attention_id: "01990000-0000-7000-8000-000000000802",
    initiative_id: "01990000-0000-7000-8000-000000000001",
    attention_type: "QUESTION",
    owning_domain: "CONTROL",
    priority: "NORMAL",
    reason_code: "CONFIRM",
    summary: "Confirm priority",
    blocking: false,
    lifecycle_state: "OPEN",
    legal_responses: [{ option_id: "yes", label: "Yes" }],
    actionable: true,
    state_version: 1,
    created_at: new Date(NOW).toISOString(),
  };
  const refreshed = { ...item, state_version: 2, summary: "Canonical state changed" };
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  let reads = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ error: { code: "STATE_VERSION_CONFLICT" } }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    }
    reads += 1;
    return Response.json({ items: [reads === 1 ? item : refreshed] });
  }) as typeof fetch;

  await refreshQcrAttention();
  await expect(respondToQcrAttention(item, item.legal_responses[0]!)).rejects.toThrow(
    "STATE_VERSION_CONFLICT",
  );
  expect(listQcrAttention()[0]?.state_version).toBe(2);
  const submitted = JSON.parse(String(requests.find((request) => request.init?.method === "POST")?.init?.body));
  expect(submitted.expected_state_version).toBe(1);
  expect(submitted.target_ref.id).toBe(item.attention_id);
  expect(submitted.parameters).toEqual({ option_id: "yes", response: {} });
});
