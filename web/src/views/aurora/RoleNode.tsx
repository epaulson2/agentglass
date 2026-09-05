/**
 * FIXTURE: Custom React Flow node for QCR role display.
 * Status styling proves Aurora halo concept — not final design.
 * No semantic state stored here — status comes from QCR OS stream.
 */
import { Handle, Position, type NodeProps } from "@xyflow/react";

export type RoleStatus = "idle" | "active" | "blocked";

export interface RoleNodeData extends Record<string, unknown> {
  label: string;
  status: RoleStatus;
}

const STATUS_COLOR: Record<RoleStatus, string> = {
  idle:    "#4a4a6a",
  active:  "#2ecc71",
  blocked: "#e74c3c",
};

export function RoleNode({ data, selected }: NodeProps) {
  const roleData = data as RoleNodeData;
  const haloColor = STATUS_COLOR[roleData.status];

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div
        data-fixture-role={roleData.label}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          background: "#1e1e3e",
          color: "#eee",
          fontSize: 13,
          fontWeight: 600,
          border: `2px solid ${haloColor}`,
          boxShadow: selected ? `0 0 12px ${haloColor}` : `0 0 6px ${haloColor}88`,
          minWidth: 110,
          textAlign: "center",
        }}
      >
        <div style={{ color: haloColor, fontSize: 9, marginBottom: 2, textTransform: "uppercase" }}>
          {roleData.status}
        </div>
        {roleData.label}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </>
  );
}
