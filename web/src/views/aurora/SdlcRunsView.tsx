import { useEffect, useState } from "react";
import type { QcrSdlcTask, QcrSdlcTasksResponse } from "../../lib/qcr/contracts.ts";

const STAGE_ORDER = ["plan", "plan-audit", "fl-plan", "fl-implement", "review"] as const;
const STAGE_LABELS: Record<string, string> = {
  plan: "Plan",
  "plan-audit": "Plan Audit",
  "fl-plan": "FL Plan",
  "fl-implement": "FL Implement",
  review: "Review",
};

function OverallBadge({ status }: { status: QcrSdlcTask["overall_status"] }) {
  const color = status === "COMPLETE" ? "var(--success)" : status === "RUNNING" ? "var(--primary)" : status === "DEGRADED" ? "var(--error)" : "var(--text3)";
  return <span style={{ fontWeight: 600, color }}>{status}</span>;
}

function JevLabel({ value }: { value: boolean | null | undefined }) {
  if (value === true) return <span>JEV on</span>;
  if (value === false) return <span>JEV off</span>;
  return <span style={{ color: "var(--muted)" }}>JEV unknown</span>;
}

function TaskCard({ task }: { task: QcrSdlcTask }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 6, marginBottom: 14, background: "var(--bg2)" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13 }}>{task.task_id}</strong>
        <span style={{ fontSize: 11, color: "var(--text3)" }}>{task.branch}</span>
        <span style={{ fontSize: 11, color: "var(--text3)" }}>HEAD: {task.branch_head ? task.branch_head.slice(0, 10) : "unavailable"}</span>
        <OverallBadge status={task.overall_status} />
        {task.observer_status === "DEGRADED" && <span style={{ color: "var(--warning)", fontSize: 11 }}>observer degraded</span>}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)" }}>{task.created_at_utc}</span>
      </div>

      {task.errors.length > 0 && (
        <div style={{ padding: "6px 14px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--error)" }}>
          {task.errors.map((e) => <div key={e}>{e}</div>)}
        </div>
      )}

      <div style={{ padding: "10px 14px", display: "flex", gap: 0, alignItems: "stretch", overflowX: "auto" }}>
        {STAGE_ORDER.map((stageName, index) => {
          const stage = task.stages.find((s) => s.stage === stageName);
          return (
            <div key={stageName} style={{ display: "flex", alignItems: "center" }}>
              <div style={{
                border: "1px solid var(--border)",
                borderRadius: 5,
                padding: "8px 10px",
                minWidth: 110,
                background: "var(--bg3)",
                fontSize: 10,
              }}>
                <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, color: "var(--text)" }}>{STAGE_LABELS[stageName]}</div>
                {stage ? (
                  <>
                    <div>Phys: <span style={{ color: "var(--text2)" }}>{stage.physical_status}</span></div>
                    <div>Sem: <span style={{ color: "var(--text2)" }}>{stage.semantic_status}</span></div>
                    <div style={{ color: "var(--muted)" }}>{stage.tmux_session ?? "no session"}</div>
                    <div style={{ color: "var(--muted)", fontFamily: "monospace" }}>
                      {stage.claude_session_id ? stage.claude_session_id.slice(0, 8) + "…" : "—"}
                    </div>
                    <div><JevLabel value={stage.jev_shadow} /></div>
                  </>
                ) : (
                  <div style={{ color: "var(--muted)" }}>no data</div>
                )}
              </div>
              {index < STAGE_ORDER.length - 1 && (
                <span style={{ padding: "0 4px", color: "var(--muted)", fontSize: 13 }}>→</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SdlcRunsView() {
  const [data, setData] = useState<QcrSdlcTasksResponse | null>(null);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch("/qcr-os/api/v1/sdlc/tasks", { signal: controller.signal });
        if (!response.ok) { setFetchError(true); return; }
        const json = (await response.json()) as QcrSdlcTasksResponse;
        setFetchError(false);
        setData(json);
      } catch {
        if (!controller.signal.aborted) setFetchError(true);
      }
    }

    void load();
    intervalId = setInterval(load, 2000);

    return () => {
      clearInterval(intervalId);
      controller.abort();
    };
  }, []);

  if (fetchError) {
    return (
      <div style={{ padding: 24, color: "var(--error)" }}>SDLC visibility unavailable.</div>
    );
  }

  if (!data) {
    return <div style={{ padding: 24, color: "var(--muted)" }}>Loading…</div>;
  }

  const topErrors = data.errors ?? [];

  return (
    <section aria-label="SDLC split-session runs" style={{ padding: "14px 18px", overflowY: "auto", height: "100%", background: "var(--bg)", color: "var(--text)" }}>
      {topErrors.length > 0 && (
        <div style={{ marginBottom: 12, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg2)", fontSize: 11 }}>
          <strong style={{ color: "var(--warning)" }}>Visibility warnings</strong>
          {topErrors.map((e) => <div key={`${e.source}:${e.code}`} style={{ color: "var(--text3)" }}>{e.source}: {e.code}</div>)}
        </div>
      )}

      {data.tasks.length === 0 ? (
        <div style={{ color: "var(--muted)" }}>No split-session SDLC tasks are currently registered.</div>
      ) : (
        data.tasks.map((task) => <TaskCard key={task.task_id} task={task} />)
      )}
    </section>
  );
}
