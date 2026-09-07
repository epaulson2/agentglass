import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

type ThreadType = "MASTER_PORTFOLIO" | "MASTER_INITIATIVE" | "ROLE_INITIATIVE" | "ROLE_SUBJECT";
type Thread = { conversation_thread_id: string; thread_type: ThreadType; initiative_id: string | null };
type Focus = { focus_version: number; mode: string; initiative_id: string | null };
type Entry = { entry_id: string; entry_type: string; content: string | null; position: number; action_request_ref?: { id: string }; command_receipt_ref?: { id: string } };
type Activity = { cursor: number; type: string; payload: Record<string, unknown>; interaction_id: string };
type ReplayActivity = { cursor: number; event_type: string; payload: Record<string, unknown>; interaction_id: string };
type ResumeState = { threadId: string; interactionId: string; cursor: number };

const ROLES = ["qcr-main", "qcr-product", "qcr-architecture", "qcr-planning", "qcr-delivery", "qcr-assurance", "qcr-release"];
const TERMINAL = new Set(["TURN_COMPLETED", "TURN_CANCELLED", "TURN_FAILED"]);
const panel: CSSProperties = { position: "fixed", right: 16, bottom: 16, zIndex: 35, width: 430, maxHeight: "72vh", display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg2)", boxShadow: "0 16px 48px #0008", overflow: "hidden" };
const control: CSSProperties = { border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg3)", color: "var(--text2)", padding: "5px 8px", fontSize: 11 };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/qcr-os${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
}

export function AuroraConversationWrapper() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("qcr-main");
  const [initiative, setInitiative] = useState("");
  const [subjectType, setSubjectType] = useState("FINDING");
  const [subjectId, setSubjectId] = useState("");
  const [subjectRevision, setSubjectRevision] = useState("1");
  const [thread, setThread] = useState<Thread | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [message, setMessage] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [interactionId, setInteractionId] = useState<string | null>(null);
  const [resume, setResume] = useState<ResumeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stream = useRef<AbortController | null>(null);
  const currentThread = useRef<string | null>(null);
  const streamGeneration = useRef(0);

  const history = useCallback(async (id: string) => {
    const result = await api<{ entries: Entry[] }>(`/api/v1/conversations/threads/${id}/entries`);
    if (currentThread.current === id) setEntries(result.entries);
  }, []);

  const applyActivity = useCallback((id: string, generation: number, event: Activity) => {
    if (currentThread.current !== id || streamGeneration.current !== generation) return;
    sessionStorage.setItem(`qcr-conversation-cursor:${id}`, String(event.cursor));
    if (event.type === "TURN_ACCEPTED") {
      sessionStorage.setItem(`qcr-conversation-interaction:${id}`, event.interaction_id);
      setInteractionId(event.interaction_id);
    }
    if (event.type === "TEXT_DELTA") {
      setStreaming((value) => (value ?? "") + String(event.payload.text ?? ""));
    } else {
      setActivities((value) => [...value.slice(-49), event]);
    }
    if (TERMINAL.has(event.type)) {
      setStreaming(null);
      setInteractionId(null);
      setResume(null);
      sessionStorage.removeItem(`qcr-conversation-interaction:${id}`);
    }
  }, []);

  const selectThread = useCallback(async (selected: Thread) => {
    stream.current?.abort();
    streamGeneration.current += 1;
    currentThread.current = selected.conversation_thread_id;
    setThread(selected);
    setStreaming(null);
    setInteractionId(null);
    const savedInteraction = sessionStorage.getItem(`qcr-conversation-interaction:${selected.conversation_thread_id}`);
    const savedCursor = Number(sessionStorage.getItem(`qcr-conversation-cursor:${selected.conversation_thread_id}`) ?? 0);
    setResume(savedInteraction ? { threadId: selected.conversation_thread_id, interactionId: savedInteraction, cursor: savedCursor } : null);
    setActivities([]);
    const state = await api<{ thread: Thread; focus: Focus | null }>(`/api/v1/conversations/threads/${selected.conversation_thread_id}`);
    if (currentThread.current === selected.conversation_thread_id) setFocus(state.focus);
    await history(selected.conversation_thread_id);
  }, [history]);

  const ensure = useCallback(async () => {
    setError(null);
    const master = role === "qcr-main";
    const subjectScoped = !master && Boolean(subjectId);
    const thread_type: ThreadType = master ? (initiative ? "MASTER_INITIATIVE" : "MASTER_PORTFOLIO") : (subjectScoped ? "ROLE_SUBJECT" : "ROLE_INITIATIVE");
    if (!master && !initiative) { setError("Choose an Initiative for a direct role."); return; }
    try {
      const result = await api<Thread>("/api/v1/conversations/threads", {
        method: "POST",
        body: JSON.stringify({ thread_type, role_key: role, initiative_id: initiative || null, subject_ref: subjectScoped ? { type: subjectType, id: subjectId, ...(subjectType === "CONTRACT_REVISION" ? { revision: Number(subjectRevision) } : {}) } : null }),
      });
      await selectThread(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open conversation");
    }
  }, [initiative, role, selectThread, subjectId, subjectRevision, subjectType]);

  const updateFocus = useCallback(async () => {
    if (!thread || thread.thread_type !== "MASTER_PORTFOLIO") return;
    try {
      const updated = await api<Focus>(`/api/v1/conversations/threads/${thread.conversation_thread_id}/focus`, {
        method: "PUT",
        body: JSON.stringify({ expected_focus_version: focus?.focus_version ?? 0, mode: initiative ? "INITIATIVE" : "PORTFOLIO", initiative_id: initiative || null }),
      });
      setFocus(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change focus");
    }
  }, [focus, initiative, thread]);

  useEffect(() => () => stream.current?.abort(), []);

  const send = useCallback(async () => {
    if (!thread || !message.trim()) return;
    const id = thread.conversation_thread_id;
    const generation = ++streamGeneration.current;
    setError(null);
    setStreaming("");
    const controller = new AbortController();
    stream.current = controller;
    const submitted = message.trim();
    const idempotencyKey = crypto.randomUUID();
    let acceptedInteraction = interactionId ?? "";
    sessionStorage.setItem(`qcr-conversation-idempotency:${id}`, idempotencyKey);
    setMessage("");
    try {
      const response = await fetch(`/qcr-os/api/v1/conversations/threads/${id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: submitted, idempotency_key: idempotencyKey, expected_focus_version: focus?.focus_version ?? null }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Send failed (${response.status})`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffered += decoder.decode(chunk.value, { stream: true });
        const frames = buffered.split("\n\n");
        buffered = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
          if (!data) continue;
          const event = JSON.parse(data) as Activity;
          if (event.type === "TURN_ACCEPTED") acceptedInteraction = event.interaction_id;
          applyActivity(id, generation, event);
        }
      }
      await history(id);
      if (currentThread.current === id && streamGeneration.current === generation) {
        setStreaming(null);
        setInteractionId(null);
        setResume(null);
      }
    } catch (cause) {
      if ((cause as Error).name === "AbortError") {
        const savedInteraction = acceptedInteraction;
        if (savedInteraction && currentThread.current === id) {
          setResume({ threadId: id, interactionId: savedInteraction, cursor: Number(sessionStorage.getItem(`qcr-conversation-cursor:${id}`) ?? 0) });
        }
        if (currentThread.current === id) { setStreaming(null); setInteractionId(null); }
      } else if (currentThread.current === id && streamGeneration.current === generation) {
        setError(cause instanceof Error ? cause.message : "Conversation failed");
        setStreaming(null);
      }
    }
  }, [applyActivity, focus, history, interactionId, message, thread]);

  const reconnect = useCallback(async () => {
    if (!resume || currentThread.current !== resume.threadId) return;
    const generation = ++streamGeneration.current;
    let cursor = resume.cursor;
    setStreaming("");
    setInteractionId(resume.interactionId);
    try {
      for (let attempt = 0; attempt < 600; attempt += 1) {
        const result = await api<{ events: ReplayActivity[] }>(`/api/v1/conversations/threads/${resume.threadId}/replay?after=${cursor}`);
        for (const replayed of result.events) {
          cursor = replayed.cursor;
          if (replayed.interaction_id !== resume.interactionId) continue;
          const event: Activity = { ...replayed, type: replayed.event_type };
          applyActivity(resume.threadId, generation, event);
          if (TERMINAL.has(event.type)) { await history(resume.threadId); return; }
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Replay timed out");
    } catch (cause) {
      if (currentThread.current === resume.threadId) {
        setError(cause instanceof Error ? cause.message : "Could not resume conversation");
        setStreaming(null);
      }
    }
  }, [applyActivity, history, resume]);

  const cancel = useCallback(async () => {
    if (!thread || !interactionId) return;
    try {
      await api(`/api/v1/conversations/threads/${thread.conversation_thread_id}/interactions/${interactionId}/cancel`, { method: "POST" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Cancel failed");
    }
  }, [interactionId, thread]);

  const disconnect = useCallback(() => stream.current?.abort(), []);

  if (!open) return <button onClick={() => setOpen(true)} style={{ ...control, position: "fixed", right: 16, bottom: 16, zIndex: 35, cursor: "pointer" }}>QCR roles</button>;

  return (
    <section style={panel} aria-label="QCR role conversations">
      <header style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, borderBottom: "1px solid var(--border)" }}><strong style={{ color: "var(--text)", fontSize: 12 }}>QCR role conversation</strong><button style={{ ...control, marginLeft: "auto", cursor: "pointer" }} onClick={() => setOpen(false)}>Close</button></header>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, padding: 10 }}><select value={role} onChange={(event) => setRole(event.target.value)} style={control}>{ROLES.map((item) => <option key={item}>{item}</option>)}</select><input value={initiative} onChange={(event) => setInitiative(event.target.value)} placeholder="Initiative UUID" style={{ ...control, minWidth: 0 }} /><button style={{ ...control, cursor: "pointer" }} onClick={ensure}>Open</button></div>
      {thread?.thread_type === "MASTER_PORTFOLIO" && <div style={{ display: "flex", gap: 6, padding: "0 10px 10px" }}><button style={{ ...control, cursor: "pointer" }} onClick={updateFocus}>{initiative ? "Focus Initiative" : "Portfolio focus"}</button><span style={{ color: "var(--muted)", fontSize: 10 }}>v{focus?.focus_version ?? 0} · {focus?.mode ?? "PORTFOLIO"}{focus?.initiative_id ? ` · ${focus.initiative_id}` : ""}</span></div>}
      {(role === "qcr-assurance" || role === "qcr-release") && <div style={{ display: "grid", gridTemplateColumns: subjectType === "CONTRACT_REVISION" ? "1fr 2fr 60px" : "1fr 2fr", gap: 6, padding: "0 10px 10px" }}><select value={subjectType} onChange={(event) => setSubjectType(event.target.value)} style={control}><option>FINDING</option><option>CERTIFICATION</option><option>RUN</option><option>CONTRACT_REVISION</option></select><input value={subjectId} onChange={(event) => setSubjectId(event.target.value)} placeholder="Optional subject UUID" style={{ ...control, minWidth: 0 }} />{subjectType === "CONTRACT_REVISION" && <input value={subjectRevision} onChange={(event) => setSubjectRevision(event.target.value)} aria-label="Subject revision" style={{ ...control, minWidth: 0 }} />}</div>}
      <div style={{ flex: 1, overflow: "auto", padding: "0 10px 10px", minHeight: 180 }}>
        {thread && <div style={{ color: "var(--muted)", fontSize: 9, marginBottom: 6 }}>{thread.thread_type} · {thread.conversation_thread_id}</div>}
        {entries.map((entry) => <div key={entry.entry_id} style={{ margin: "5px 0", padding: 7, borderRadius: 6, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12, color: "var(--text2)", background: entry.entry_type === "USER_MESSAGE" ? "var(--accent-dim)" : "var(--bg3)", textAlign: entry.entry_type === "USER_MESSAGE" ? "right" : "left" }}>{entry.entry_type === "ACTION_REF" ? `Action ${entry.action_request_ref?.id ?? "unknown"} · Receipt ${entry.command_receipt_ref?.id ?? "pending"}` : entry.content}</div>)}
        {streaming !== null && <div style={{ margin: "5px 0", padding: 7, borderRadius: 6, whiteSpace: "pre-wrap", color: "var(--text2)", background: "var(--bg3)", fontSize: 12 }}>{streaming || "Waiting for model…"}</div>}
        {activities.map((activity) => <details key={`${activity.cursor}-${activity.interaction_id}`} style={{ fontSize: 10, color: "var(--muted)" }}><summary>{activity.type}{typeof activity.payload.owner === "string" ? ` · ${activity.payload.owner}` : ""}</summary><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(activity.payload, null, 2)}</pre></details>)}
        {resume && thread?.conversation_thread_id === resume.threadId && <button style={{ ...control, cursor: "pointer" }} onClick={reconnect}>Reconnect turn</button>}
        {error && <div role="alert" style={{ color: "var(--error)", fontSize: 11 }}>{error}</div>}
      </div>
      <footer style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid var(--border)" }}><textarea value={message} onChange={(event) => setMessage(event.target.value)} disabled={!thread || streaming !== null} placeholder={thread ? "Ask this role…" : "Open a thread first"} rows={2} style={{ ...control, resize: "none", flex: 1 }} />{streaming !== null ? <><button style={{ ...control, cursor: "pointer" }} onClick={cancel} disabled={!interactionId}>Cancel</button><button style={{ ...control, cursor: "pointer" }} onClick={disconnect}>Disconnect</button></> : <button style={{ ...control, cursor: "pointer" }} onClick={send} disabled={!thread}>Send</button>}</footer>
    </section>
  );
}
