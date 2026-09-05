/**
 * FIXTURE: AgentConversation PoC for QCR Agentic OS M1A.
 * Tests: does @assistant-ui/react-ag-ui wire into React 18 cleanly?
 * Decision criteria: typecheck clean, thread model works, React 18 compat.
 * All data is fixture — no real QCR OS service needed for this PoC.
 *
 * ponytail: skipped real stream integration — fixture proves API surface only.
 */
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAgUiRuntime } from "@assistant-ui/react-ag-ui";
import { HttpAgent } from "@ag-ui/client";
import { useMemo } from "react";

// ponytail: proves HttpAgent + useAgUiRuntime + AssistantRuntimeProvider types are React 18 compat.
// No rendered UI — runtime instantiation is sufficient for the M1A ADOPT decision.
function FixtureAgentConversation() {
  const agent = useMemo(
    () => new HttpAgent({ url: "http://127.0.0.1:4020/poc/run" }),
    [],
  );
  const runtime = useAgUiRuntime({ agent });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div
        data-fixture="qcr-agent-conversation-poc"
        style={{ fontSize: 11, color: "#aaa", padding: 8, border: "1px dashed #666" }}
      >
        [FIXTURE] AgentConversation — HttpAgent + useAgUiRuntime wired (no UI rendered in PoC)
      </div>
    </AssistantRuntimeProvider>
  );
}

export { FixtureAgentConversation };
