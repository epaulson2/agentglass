export type QcrTypedRef = { type: string; id: string; revision?: number };
export type QcrResponseOption = {
  option_id: string;
  label: string;
  action_type?: string | null;
  parameters?: Record<string, unknown> | null;
};
export type QcrAttention = {
  attention_id: string;
  initiative_id: string;
  attention_type: string;
  subject_ref?: QcrTypedRef | null;
  owning_domain: string;
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  severity?: string | null;
  reason_code: string;
  summary: string;
  blocking: boolean;
  lifecycle_state: string;
  legal_responses: QcrResponseOption[];
  actionable: boolean;
  state_version: number;
  created_at: string;
};

let current: QcrAttention[] = [];
let currentError: string | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

const notify = () => { for (const listener of listeners) listener(); };

export async function refreshQcrAttention(): Promise<void> {
  try {
    const response = await fetch("/qcr-os/api/v1/human-attention");
    if (!response.ok) throw new Error(`QCR attention refresh failed (${response.status})`);
    const payload = await response.json() as { items?: QcrAttention[] };
    const next = (payload.items ?? []).filter((item) => item.actionable);
    const changed = JSON.stringify(next) !== JSON.stringify(current) || currentError !== null;
    current = next;
    currentError = null;
    if (changed) notify();
  } catch (error) {
    currentError = error instanceof Error ? error.message : "QCR attention refresh failed";
    notify();
    throw error;
  }
}

export function subscribeQcrAttention(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refreshQcrAttention().catch(() => {});
    timer = setInterval(() => { void refreshQcrAttention().catch(() => {}); }, 5_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) { clearInterval(timer); timer = null; }
  };
}

export const listQcrAttention = (): QcrAttention[] => current;
export const getQcrAttentionError = (): string | null => currentError;

export async function respondToQcrAttention(
  item: QcrAttention,
  option: QcrResponseOption,
): Promise<void> {
  const response = await fetch("/qcr-os/api/v1/actions/attention/respond", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action_type: "attention.respond",
      target_ref: { type: "HUMAN_ATTENTION", id: item.attention_id },
      expected_state_version: item.state_version,
      parameters: {
        option_id: option.option_id,
        response: option.action_type ? {} : (option.parameters ?? {}),
      },
      reason: `Agentglass response: ${option.label}`,
      idempotency_key: `agentglass-attention:${item.attention_id}:${item.state_version}:${option.option_id}`,
    }),
  });
  if (!response.ok) {
    await refreshQcrAttention().catch(() => {});
    const payload = await response.json().catch(() => null) as {
      error?: { code?: string };
      detail?: { code?: string };
    } | null;
    const error = new Error(
      payload?.error?.code
        ?? payload?.detail?.code
        ?? `QCR attention response failed (${response.status})`,
    );
    currentError = error.message;
    notify();
    throw error;
  }
  currentError = null;
  await refreshQcrAttention();
}
