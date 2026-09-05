/**
 * FIXTURE: Aurora topology PoC for QCR Agentic OS M1A.
 * Proves React Flow can host QCR role nodes inside Agentglass.
 * No semantic state stored in React Flow — QCR identity stays server-side.
 * All data is hardcoded fixture — real data comes from QCR OS at runtime.
 */
import { ReactFlow, Background, Controls, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { RoleNode, type RoleNodeData } from "./RoleNode";

// ponytail: fixture node list — real roles stream from QCR Session
const FIXTURE_NODES = [
  { id: "product",      position: { x: 300, y: 50  }, data: { label: "Product",      status: "idle"    } },
  { id: "architecture", position: { x: 600, y: 50  }, data: { label: "Architecture", status: "idle"    } },
  { id: "planning",     position: { x: 150, y: 200 }, data: { label: "Planning",     status: "active"  } },
  { id: "delivery",     position: { x: 450, y: 200 }, data: { label: "Delivery",     status: "active"  } },
  { id: "assurance",    position: { x: 750, y: 200 }, data: { label: "Assurance",    status: "idle"    } },
  { id: "release",      position: { x: 300, y: 350 }, data: { label: "Release",      status: "blocked" } },
  { id: "coordinator",  position: { x: 600, y: 350 }, data: { label: "Coordinator",  status: "active"  } },
] satisfies Array<{ id: string; position: { x: number; y: number }; data: RoleNodeData }>;

const FIXTURE_EDGES = [
  { id: "e1", source: "product",      target: "planning"     },
  { id: "e2", source: "architecture", target: "delivery"     },
  { id: "e3", source: "planning",     target: "release"      },
  { id: "e4", source: "delivery",     target: "assurance"    },
  { id: "e5", source: "assurance",    target: "release"      },
  { id: "e6", source: "coordinator",  target: "release"      },
];

const nodeTypes: NodeTypes = { role: RoleNode };

const typedNodes = FIXTURE_NODES.map(n => ({ ...n, type: "role" as const }));

export function AuroraTopologyView() {
  return (
    <div
      data-fixture="qcr-aurora-topology-poc"
      style={{ width: "100%", height: "500px", border: "1px dashed #666" }}
    >
      <div style={{ padding: "4px 8px", background: "#1a1a2e", color: "#aaa", fontSize: 11 }}>
        [FIXTURE] Aurora Topology PoC — QCR Agentic OS M1A — data is hardcoded
      </div>
      <ReactFlow
        nodes={typedNodes}
        edges={FIXTURE_EDGES}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: false }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
