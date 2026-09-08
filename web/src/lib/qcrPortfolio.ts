export type QcrResourcePressure = {
  resource_type: string;
  display_locator: string;
  active_leases: number;
  queued_requests: number;
  capacity_used?: number | null;
  capacity_limit?: number | null;
  capacity_state: "AVAILABLE" | "CONTESTED" | "EXHAUSTED";
};

export type QcrPortfolioConcurrency = {
  active_lease_count: number;
  queued_lease_request_count: number;
  resource_pressure: QcrResourcePressure[];
};

const EMPTY: QcrPortfolioConcurrency = {
  active_lease_count: 0,
  queued_lease_request_count: 0,
  resource_pressure: [],
};

let current = EMPTY;
let currentError: string | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

const notify = () => { for (const listener of listeners) listener(); };

export async function refreshQcrPortfolio(): Promise<void> {
  try {
    const response = await fetch("/qcr-os/api/v1/portfolio");
    if (!response.ok) throw new Error(`QCR portfolio refresh failed (${response.status})`);
    const payload = await response.json() as Partial<QcrPortfolioConcurrency>;
    const next = {
      active_lease_count: payload.active_lease_count ?? 0,
      queued_lease_request_count: payload.queued_lease_request_count ?? 0,
      resource_pressure: payload.resource_pressure ?? [],
    };
    const changed = JSON.stringify(next) !== JSON.stringify(current) || currentError !== null;
    current = next;
    currentError = null;
    if (changed) notify();
  } catch (error) {
    currentError = error instanceof Error ? error.message : "QCR portfolio refresh failed";
    notify();
    throw error;
  }
}

export function subscribeQcrPortfolio(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refreshQcrPortfolio().catch(() => {});
    timer = setInterval(() => { void refreshQcrPortfolio().catch(() => {}); }, 5_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) { clearInterval(timer); timer = null; }
  };
}

export const getQcrPortfolio = (): QcrPortfolioConcurrency => current;
export const getQcrPortfolioError = (): string | null => currentError;
