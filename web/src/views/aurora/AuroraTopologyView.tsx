import { memo, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { QcrAttentionProjection, QcrInitiative, QcrPortfolio, QcrTopology, QcrTopologyNode } from "../../lib/qcr/contracts.ts";
import { getQcrProjection, getQcrState, refreshQcrState, subscribeQcrState } from "../../lib/qcr/store.ts";
import { AgentConversation } from "./AgentConversation.tsx";
import { RoleNode, type RoleNodeData } from "./RoleNode.tsx";

const nodeTypes: NodeTypes = { role: RoleNode };
const button = { border: "1px solid var(--border)", borderRadius: 5, background: "var(--bg3)", color: "var(--text2)", padding: "5px 8px", fontSize: 11, cursor: "pointer" } as const;
const modeButton = (active: boolean) => ({
  ...button,
  background: active ? "color-mix(in srgb, var(--primary) 18%, var(--bg3))" : button.background,
  borderColor: active ? "var(--primary)" : "var(--border)",
  color: active ? "var(--text)" : button.color,
});
const STAGE_ORDER = ["CONTROL", "PRODUCT", "ARCHITECTURE", "PLANNING", "DELIVERY", "ASSURANCE", "RELEASE"];
type ActionCard = { text: string; intent: Record<string, unknown>; executable: boolean };

function position(node: QcrTopologyNode, index: number) {
  if (node.node_type === "ROLE") {
    const stage = Math.max(0, STAGE_ORDER.indexOf(node.stage_class ?? ""));
    return { x: 70 + (stage % 4) * 230, y: 50 + Math.floor(stage / 4) * 190 };
  }
  return { x: 90 + (index % 4) * 220, y: 440 + Math.floor(index / 4) * 150 };
}

function graph(topology: QcrTopology | null): { nodes: Node[]; edges: Edge[]; signature: string } {
  if (!topology) return { nodes: [], edges: [], signature: "" };
  const nodes = topology.nodes.map((item, index): Node => ({
    id: item.node_id, type: "role", position: position(item, index),
    data: {
      label: item.label, roleKey: item.role_key, stage: item.stage_class,
      semanticState: item.semantic_state, observedHealth: item.observed_health,
      attention: Number(item.indicators.attention_count ?? 0),
      capacity: String(item.indicators.capacity_state ?? "UNKNOWN"),
    } satisfies RoleNodeData,
  }));
  const nodeIds = new Set(nodes.map((item) => item.id));
  const edges = topology.edges.filter((item) => nodeIds.has(item.source_node_id) && nodeIds.has(item.target_node_id)).map((item): Edge => ({
    id: item.edge_id, source: item.source_node_id, target: item.target_node_id,
    label: item.lifecycle_state ? `${item.relationship_type} · ${item.lifecycle_state}` : item.relationship_type,
    markerEnd: { type: MarkerType.ArrowClosed }, animated: false,
    style: { stroke: item.validity_state && item.validity_state !== "VALID" ? "var(--warning)" : "var(--muted)" },
    labelStyle: { fill: "var(--text3)", fontSize: 9 },
  }));
  return { nodes, edges, signature: JSON.stringify({ nodes, edges }) };
}

const TopologyGraph = memo(function TopologyGraph({ rendered, onSelect, onClear }: { rendered: ReturnType<typeof graph>; onSelect: (id: string) => void; onClear: () => void }) {
  return <ReactFlow nodes={rendered.nodes} edges={rendered.edges} nodeTypes={nodeTypes} fitView minZoom={0.3} nodesFocusable onNodeClick={(_, node) => onSelect(node.id)} onPaneClick={onClear}>
    <Background /><Controls />
  </ReactFlow>;
}, (previous, next) => previous.rendered.signature === next.rendered.signature && previous.onSelect === next.onSelect && previous.onClear === next.onClear);

export function AuroraTopologyView() {
  const state = useSyncExternalStore(subscribeQcrState, getQcrState, getQcrState);
  const portfolio = getQcrProjection<QcrPortfolio>("portfolio", "current");
  const attention = getQcrProjection<QcrAttentionProjection>("attention", "current");
  const [mode, setMode] = useState<"organization" | "initiative">("organization");
  const [initiativeId, setInitiativeId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [actionResult, setActionResult] = useState<ActionCard | null>(null);

  useEffect(() => {
    if (!initiativeId && portfolio?.initiatives[0]) setInitiativeId(portfolio.initiatives[0].initiative_id);
    if (initiativeId && !portfolio?.initiatives.some((item) => item.initiative_id === initiativeId)) {
      setInitiativeId(portfolio?.initiatives[0]?.initiative_id ?? ""); setSelectedId(null);
    }
  }, [initiativeId, portfolio]);

  const topology = mode === "organization"
    ? getQcrProjection<QcrTopology>("aurora_organization", "current")
    : initiativeId ? getQcrProjection<QcrTopology>("aurora_initiative", initiativeId) : null;
  useEffect(() => {
    if (selectedId && topology && !topology.nodes.some((item) => item.node_id === selectedId)) {
      setSelectedId(null);
      setConversationOpen(false);
    }
  }, [selectedId, topology]);
  const rendered = useMemo(() => graph(topology), [topology]);
  const selected = topology?.nodes.find((item) => item.node_id === selectedId) ?? null;
  const selectedAttention = attention?.items.filter((item) => item.actionable && (!item.initiative_id || item.initiative_id === initiativeId) && (!selected || item.owning_domain === selected.role_key || item.subject_ref?.id === selected.entity_ref.id)) ?? [];
  const selectedInitiative = portfolio?.initiatives.find((item) => item.initiative_id === initiativeId);
  const initiative = initiativeId ? getQcrProjection<QcrInitiative>("initiative", initiativeId) : null;
  const selectNode = useCallback((id: string) => setSelectedId(id), []);
  const clearNode = useCallback(() => setSelectedId(null), []);

  async function preflight(actionType: string) {
    setActionResult({ text: "Checking canonical capability…", intent: {}, executable: false });
    const target = selected?.entity_ref ?? (initiativeId ? { type: "INITIATIVE", id: initiativeId } : null);
    const transition = initiative?.next_legal_transitions.find((item) => item.action_type === actionType);
    const intent = { action_type: actionType, target_ref: transition?.target_ref ?? target, parameters: {}, idempotency_key: `aurora-action:${crypto.randomUUID()}` };
    const response = await fetch("/qcr-os/api/v1/actions/preflight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(intent) });
    const payload = await response.json().catch(() => ({}));
    const text = response.ok ? `${payload.legal ? "AVAILABLE" : "BLOCKED"} · ${String(payload.capability?.owner ?? payload.owner ?? "canonical owner")}${Array.isArray(payload.blockers) && payload.blockers.length ? ` · ${payload.blockers.join(" · ")}` : ""}` : String(payload?.detail?.code ?? payload?.error?.code ?? `Unavailable (${response.status})`);
    setActionResult({ text, intent: { ...intent, expected_state_version: payload.current_state_version }, executable: response.ok && payload.legal === true });
  }

  async function executePreflighted() {
    if (!actionResult) return;
    const result = actionResult;
    if (!result.executable) return;
    const response = await fetch("/qcr-os/api/v1/actions/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(result.intent) });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 409) { setActionResult({ text: "Canonical state changed. Refreshed; preflight again before executing.", intent: result.intent, executable: false }); await refreshQcrState("Action state conflict"); return; }
    setActionResult({ ...result, text: response.ok ? String(payload.status ?? "COMPLETED") : String(payload?.detail?.code ?? payload?.error?.code ?? `Execution failed (${response.status})`), executable: false });
    if (response.ok) await refreshQcrState();
  }

  const actionCard = actionResult;

  const freshness = topology?.metadata.freshness ?? "UNAVAILABLE";
  const unavailable = state.connection === "failed" || (!topology && state.connection === "live");
  return (
    <section className="aurora-topology" aria-label="Aurora operating topology" style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--text2)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: "1px solid var(--border)" }}>
        <strong style={{ fontSize: 13 }}>Aurora</strong>
        <button style={modeButton(mode === "organization")} aria-pressed={mode === "organization"} onClick={() => { setMode("organization"); setSelectedId(null); }}>Organization</button>
        <button style={modeButton(mode === "initiative")} aria-pressed={mode === "initiative"} onClick={() => { setMode("initiative"); setSelectedId(null); }}>Initiative</button>
        {mode === "initiative" && <select aria-label="Initiative" value={initiativeId} onChange={(event) => { setInitiativeId(event.target.value); setSelectedId(null); }} style={button}>
          {(portfolio?.initiatives ?? []).map((item) => <option key={item.initiative_id} value={item.initiative_id}>{item.title}</option>)}
        </select>}
        <span style={{ marginLeft: "auto", fontSize: 10, color: freshness === "FRESH" && state.connection === "live" ? "var(--success)" : "var(--warning)" }}>
          {state.connection} · {freshness} · cursor {state.cursor}
        </span>
        <button style={button} onClick={() => void refreshQcrState("Manual refresh")}>Refresh</button>
      </header>

      {unavailable ? <div role="alert" style={{ padding: 24 }}>Aurora is unavailable. {state.error}</div>
        : !topology ? <div style={{ padding: 24 }}>{state.connection === "bootstrapping" || state.connection === "idle" ? "Loading canonical topology…" : mode === "initiative" && !initiativeId ? "No Initiatives are available." : "Canonical topology is rebuilding…"}</div>
        : <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: conversationOpen ? "minmax(460px, 1fr) 280px 390px" : "minmax(460px, 1fr) 300px" }}>
          <div style={{ position: "relative", minHeight: 0 }}>
            {rendered.nodes.length ? <TopologyGraph rendered={rendered} onSelect={selectNode} onClear={clearNode} /> : <div style={{ padding: 24 }}>No canonical topology entities exist in this scope.</div>}
            <details style={{ position: "absolute", left: 12, bottom: 12, zIndex: 2, maxHeight: "45%", overflow: "auto", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, padding: 7, fontSize: 10 }}>
              <summary>Keyboard-accessible topology list</summary>
              {topology.nodes.map((node) => <button key={node.node_id} onClick={() => setSelectedId(node.node_id)} style={{ ...button, display: "block", width: "100%", marginTop: 5, textAlign: "left" }}>{node.role_key ?? node.label} · {node.semantic_state}</button>)}
            </details>
          </div>

          <aside aria-label="Aurora inspector" style={{ overflow: "auto", padding: 12, borderLeft: "1px solid var(--border)", background: "var(--bg2)", fontSize: 11 }}>
            <strong>Inspector</strong>
            {selected ? <>
              <h2 style={{ fontSize: 15, margin: "12px 0 2px" }}>{selected.label}</h2>
              <div style={{ color: "var(--muted)", overflowWrap: "anywhere" }}>{selected.role_key ?? `${selected.entity_ref.type}:${selected.entity_ref.id}`}</div>
              <dl style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 6, marginTop: 14 }}>
                <dt>Semantic</dt><dd>{selected.semantic_state} <small>derived</small></dd>
                <dt>Runtime</dt><dd>{selected.observed_health ?? "UNKNOWN"} <small>observed</small></dd>
                <dt>Stage</dt><dd>{selected.stage_class ?? "—"} <small>canonical</small></dd>
                {Object.entries(selected.indicators).map(([key, value]) => <div key={key} style={{ display: "contents" }}><dt>{key.replaceAll("_", " ")}</dt><dd>{String(value ?? "—")}</dd></div>)}
              </dl>
              {selectedAttention.length > 0 && <div style={{ marginTop: 14 }}><strong>Needs You</strong>{selectedAttention.map((item) => <div key={item.attention_id} style={{ color: "var(--warning)", marginTop: 5 }}>{item.summary}</div>)}</div>}
              {selected.role_key && <button style={{ ...button, width: "100%", marginTop: 14 }} onClick={() => setConversationOpen((value) => !value)}>{conversationOpen ? "Close conversation" : `Talk to ${selected.role_key}`}</button>}
              <div style={{ marginTop: 14 }}><strong>Canonical actions</strong>
                {(initiative?.next_legal_transitions.slice(0, 6) ?? []).map((item) => <button key={`${item.action_type}:${item.target_ref?.id ?? "scope"}`} style={{ ...button, width: "100%", marginTop: 5, textAlign: "left" }} onClick={() => void preflight(item.action_type)}>{item.action_type}{item.eligible ? "" : ` · ${item.reason_codes.join(", ")}`}</button>)}
                <button style={{ ...button, width: "100%", marginTop: 5, textAlign: "left" }} onClick={() => void preflight("workbench.open")}>workbench.open · capability check</button>
              </div>
              {actionCard && <div role="status" style={{ marginTop: 6, color: "var(--muted)" }}>{actionCard.text}{actionCard.executable && <button style={{ ...button, display: "block", marginTop: 6 }} onClick={() => void executePreflighted()}>Execute confirmed action</button>}</div>}
              <details style={{ marginTop: 14 }}><summary>Provenance</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(selected.provenance, null, 2)}</pre></details>
            </> : <div style={{ marginTop: 12, color: "var(--muted)" }}>Select a canonical node to inspect identity, state, health, evidence, and legal actions.</div>}
            {selectedInitiative && <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 10 }}><strong>{selectedInitiative.title}</strong><div>{selectedInitiative.lifecycle_state} · {selectedInitiative.risk_level}</div>{initiative?.resource_conflicts.map((conflict) => <div key={`${conflict.resource_type}:${conflict.display_locator}`} style={{ color: "var(--warning)", marginTop: 6 }}>Resource contention · {conflict.display_locator} · {conflict.reason}</div>)}</div>}
            <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 10 }}><strong>Health</strong><div>Agentglass → QCR: {state.connection}</div><div>Projection: {freshness} · generation {state.projectionGeneration.slice(0, 8)}</div><div>Runtime: {selected?.observed_health ?? "select a role"}</div></div>
            {topology.diagnostics.length > 0 && <details style={{ marginTop: 14 }}><summary>{topology.diagnostics.length} topology diagnostics</summary>{topology.diagnostics.map((item) => <div key={item}>{item}</div>)}</details>}
          </aside>
          {conversationOpen && <AgentConversation docked roleKey={selected?.role_key ?? "qcr-main"} initiativeRef={mode === "initiative" && initiativeId ? { id: initiativeId } : null} />}
        </div>}
    </section>
  );
}
