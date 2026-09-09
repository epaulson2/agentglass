import type { QcrPortfolio, QcrResourcePressure } from "./qcr/contracts.ts";
import { getQcrProjection, getQcrState, refreshQcrState, subscribeQcrSemantic, subscribeQcrState } from "./qcr/store.ts";

export type { QcrResourcePressure };
export type QcrPortfolioConcurrency = Pick<QcrPortfolio, "active_lease_count" | "queued_lease_request_count" | "resource_pressure">;

const EMPTY: QcrPortfolioConcurrency = { active_lease_count: 0, queued_lease_request_count: 0, resource_pressure: [] };

export const getQcrPortfolioModel = (): QcrPortfolio | null => getQcrProjection<QcrPortfolio>("portfolio", "current");
const derive = (): QcrPortfolioConcurrency => {
  const model = getQcrPortfolioModel();
  if (!model) return EMPTY;
  return {
    active_lease_count: model.active_lease_count ?? 0,
    queued_lease_request_count: model.queued_lease_request_count ?? 0,
    resource_pressure: model.resource_pressure ?? [],
  };
};
let cached = EMPTY;
export const getQcrPortfolio = (): QcrPortfolioConcurrency => cached;
export const getQcrPortfolioError = (): string | null => getQcrState().error;
export async function refreshQcrPortfolio(): Promise<void> { await refreshQcrState(); cached = derive(); }

export function subscribeQcrPortfolio(listener: () => void): () => void {
  const semantic = subscribeQcrSemantic(() => { cached = derive(); listener(); });
  const transport = subscribeQcrState(() => {});
  return () => { semantic(); transport(); };
}
