import { Handle, Position, type NodeProps } from "@xyflow/react";

export interface RoleNodeData extends Record<string, unknown> {
  label: string;
  roleKey?: string | null;
  stage?: string | null;
  semanticState: string;
  observedHealth?: string | null;
  attention: number;
  capacity: string;
}

const stateColor = (state: string, health?: string | null) => {
  if (health === "QUARANTINED" || health === "UNHEALTHY" || state === "BLOCKED") return "var(--error)";
  if (state === "ACTIVE" || health === "HEALTHY") return "var(--success)";
  if (state === "WAITING" || health === "DEGRADED") return "var(--warning)";
  return "var(--muted)";
};

export function RoleNode({ data, selected }: NodeProps) {
  const role = data as RoleNodeData;
  const color = stateColor(role.semanticState, role.observedHealth);
  return (
    <>
      <Handle type="target" position={Position.Top} />
      <article aria-label={`${role.roleKey ?? role.label} ${role.semanticState}`} style={{
        minWidth: 150, padding: "10px 12px", borderRadius: 9,
        border: `1px solid ${color}`, background: "var(--bg2)", color: "var(--text2)",
        boxShadow: selected ? `0 0 0 2px ${color}` : "0 5px 18px #0004",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
          <strong style={{ fontSize: 12 }}>{role.label}</strong>
        </div>
        {role.roleKey && <div style={{ marginTop: 3, fontSize: 9, color: "var(--muted)" }}>{role.roleKey}</div>}
        <div style={{ display: "flex", gap: 6, marginTop: 7, fontSize: 9, color: "var(--text3)" }}>
          <span>{role.stage ?? "ENTITY"}</span><span>·</span><span>{role.semanticState}</span>
          {role.attention > 0 && <span style={{ color: "var(--warning)", marginLeft: "auto" }}>{role.attention} needs you</span>}
        </div>
        <div style={{ marginTop: 3, fontSize: 9, color: "var(--muted)" }}>runtime {role.observedHealth ?? "UNKNOWN"} · capacity {role.capacity}</div>
      </article>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}
