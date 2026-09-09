import type { QcrAttention, QcrAttentionProjection, QcrResponseOption, QcrTypedRef } from "./qcr/contracts.ts";
import { getQcrProjection, getQcrState, refreshQcrState, subscribeQcrSemantic, subscribeQcrState } from "./qcr/store.ts";

export type { QcrAttention, QcrResponseOption, QcrTypedRef };

const derive = (): QcrAttention[] =>
  (getQcrProjection<QcrAttentionProjection>("attention", "current")?.items ?? []).filter((item) => item.actionable);
let cached: QcrAttention[] = [];
export const listQcrAttention = (): QcrAttention[] => cached;
export const getQcrAttentionError = (): string | null => getQcrState().error;
export async function refreshQcrAttention(): Promise<void> { await refreshQcrState(); cached = derive(); }

export function subscribeQcrAttention(listener: () => void): () => void {
  const semantic = subscribeQcrSemantic(() => { cached = derive(); listener(); });
  const transport = subscribeQcrState(() => {});
  return () => { semantic(); transport(); };
}

export async function respondToQcrAttention(item: QcrAttention, option: QcrResponseOption): Promise<void> {
  const response = await fetch("/qcr-os/api/v1/actions/attention/respond", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action_type: "attention.respond",
      target_ref: { type: "HUMAN_ATTENTION", id: item.attention_id },
      expected_state_version: item.state_version,
      parameters: { option_id: option.option_id, response: option.action_type ? {} : (option.parameters ?? {}) },
      reason: `Agentglass response: ${option.label}`,
      idempotency_key: `agentglass-attention:${item.attention_id}:${item.state_version}:${option.option_id}`,
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { code?: string }; detail?: { code?: string } } | null;
    await refreshQcrState("Attention state changed while responding").then(() => { cached = derive(); }).catch(() => {});
    throw new Error(payload?.error?.code ?? payload?.detail?.code ?? `QCR attention response failed (${response.status})`);
  }
  await refreshQcrState(); cached = derive();
}
