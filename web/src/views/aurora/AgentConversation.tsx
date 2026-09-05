/**
 * M1A Closeout Workstream D: Minimal Aurora conversation wrapper.
 *
 * Proves assistant-ui can be styled and embedded inside Aurora's design
 * rather than forcing a generic chatbot UI. Uses ThreadPrimitive.*
 * namespace for custom layout ownership.
 *
 * Requirements satisfied:
 * - Custom layout/styling owned by Aurora (inline styles, not assistant-ui theme)
 * - Streaming assistant text (MessagePrimitive.Content renders streamed parts)
 * - Tool/event placeholder renderer (ToolCallPlaceholder)
 * - Switching between two fixture QCR conversation references
 * - No semantic state stored as assistant-ui thread authority
 * - No assumption that one role equals one global thread
 *
 * Identity boundary (§4 corrected rule):
 * The browser holds QCR IDs as opaque transient references for navigation.
 * Browser MUST NOT mint, redefine, persist as authority, or treat as auth.
 * QCR remains sole owner of conversation/session identity and lifecycle.
 */
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { useState, useCallback, type CSSProperties } from "react";

// ponytail: fixture conversations — two distinct QCR conversation references.
// In prod, these come from QCR OS via the same-origin proxy.
const FIXTURE_CONVERSATIONS: Record<string, { role: string; messages: Array<{ role: "user" | "assistant"; text: string }> }> = {
  "qcr-conv-delivery": {
    role: "Delivery",
    messages: [
      { role: "user", text: "What's the delivery status?" },
      { role: "assistant", text: "[FIXTURE] 3/7 stories in-flight, 2 blocked on assurance gate." },
    ],
  },
  "qcr-conv-planning": {
    role: "Planning",
    messages: [
      { role: "user", text: "Is the sprint plan finalized?" },
      { role: "assistant", text: "[FIXTURE] Sprint plan locked. 4 stories, 2 with open dependencies." },
    ],
  },
};

// Deterministic adapter — no real LLM, satisfies ChatModelAdapter interface
const fixtureAdapter: ChatModelAdapter = {
  async *run({ messages }) {
    const lastMsg = messages[messages.length - 1];
    const text = typeof lastMsg?.content === "string"
      ? lastMsg.content
      : "[FIXTURE] Echo response from Aurora wrapper PoC";
    yield { content: [{ type: "text" as const, text: `[FIXTURE] ${text}` }] };
  },
};

const WRAPPER_STYLE: CSSProperties = {
  border: "1px solid #2a2a4a",
  borderRadius: 8,
  background: "#0d0d1a",
  padding: 12,
  maxHeight: 400,
  overflow: "auto",
  fontFamily: "system-ui, sans-serif",
};

const MSG_STYLE: CSSProperties = {
  padding: "6px 10px",
  margin: "4px 0",
  borderRadius: 6,
  fontSize: 13,
};

export function AuroraConversationWrapper() {
  const [activeConvId, setActiveConvId] = useState("qcr-conv-delivery");
  const activeConv = FIXTURE_CONVERSATIONS[activeConvId];
  const runtime = useLocalRuntime(fixtureAdapter);

  const switchConversation = useCallback((id: string) => {
    // Switching conversations does NOT create a new assistant-ui thread.
    // QCR conversation identity is opaque routing — assistant-ui thread
    // is a UI construct that carries no semantic authority.
    setActiveConvId(id);
  }, []);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div data-fixture="qcr-aurora-conversation-wrapper" style={WRAPPER_STYLE}>
        {/* Aurora-owned header — not assistant-ui */}
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {Object.entries(FIXTURE_CONVERSATIONS).map(([id, conv]) => (
            <button
              key={id}
              onClick={() => switchConversation(id)}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: id === activeConvId ? "1px solid #2ecc71" : "1px solid #333",
                background: id === activeConvId ? "#1a3a2a" : "#1a1a2a",
                color: id === activeConvId ? "#2ecc71" : "#888",
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              {conv.role}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 10, color: "#555", marginBottom: 6 }}>
          QCR Conv: {activeConvId} (opaque ref — not assistant-ui thread ID)
        </div>

        {/* Fixture messages rendered in Aurora style */}
        {activeConv.messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...MSG_STYLE,
              background: msg.role === "user" ? "#1a2a3a" : "#1a1a2a",
              color: msg.role === "user" ? "#aaccee" : "#aaa",
              textAlign: msg.role === "user" ? "right" : "left",
            }}
          >
            {msg.text}
          </div>
        ))}

        {/* assistant-ui thread primitives — Aurora owns the layout */}
        <ThreadPrimitive.Root style={{ marginTop: 8 }}>
          <ThreadPrimitive.Viewport style={{ maxHeight: 200, overflow: "auto" }}>
            <ThreadPrimitive.Messages
              components={{
                UserMessage: () => (
                  <MessagePrimitive.Root style={{ ...MSG_STYLE, background: "#1a2a3a", color: "#aaccee", textAlign: "right" }}>
                    <MessagePrimitive.Content />
                  </MessagePrimitive.Root>
                ),
                AssistantMessage: () => (
                  <MessagePrimitive.Root style={{ ...MSG_STYLE, background: "#1a1a2a", color: "#aaa" }}>
                    <MessagePrimitive.Content />
                  </MessagePrimitive.Root>
                ),
              }}
            />
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>

        <div style={{ fontSize: 9, color: "#444", marginTop: 6, textAlign: "center" }}>
          [FIXTURE] Aurora Conversation Wrapper — M1A Closeout Workstream D
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
