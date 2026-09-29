import { useSyncExternalStore } from "react";
import {
  getQcrPortfolio,
  getQcrPortfolioError,
  subscribeQcrPortfolio,
} from "../lib/qcrPortfolio.ts";

export function QcrResourcePressure() {
  const portfolio = useSyncExternalStore(
    subscribeQcrPortfolio,
    getQcrPortfolio,
    getQcrPortfolio,
  );
  const error = useSyncExternalStore(
    subscribeQcrPortfolio,
    getQcrPortfolioError,
    getQcrPortfolioError,
  );
  if (!portfolio.active_lease_count && !portfolio.queued_lease_request_count) return null;
  return (
    <section
      aria-label="QCR resource pressure"
      data-stale={error ? "true" : "false"}
      className="flex items-center gap-2 px-3 py-1 text-[10px] overflow-x-auto"
      style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border2)" }}
    >
      <span className="uppercase tracking-wider shrink-0" style={{ color: "var(--text4)" }}>
        Resources
      </span>
      <span className="shrink-0" style={{ color: "var(--text2)" }}>
        {portfolio.active_lease_count} active · {portfolio.queued_lease_request_count} queued
      </span>
      {error ? (
        <span className="shrink-0" style={{ color: "var(--warning)" }} title={error}>
          reconnecting
        </span>
      ) : null}
      {portfolio.resource_pressure.map((resource) => (
        <span
          key={`${resource.resource_type}:${resource.display_locator}`}
          className="rounded-full px-2 py-0.5 shrink-0"
          style={{
            border: "1px solid var(--border2)",
            color: resource.capacity_state === "AVAILABLE" ? "var(--text3)" : "var(--warning)",
          }}
          title={`${resource.resource_type}: ${resource.active_leases} active, ${resource.queued_requests} queued`}
        >
          {resource.display_locator} · {resource.capacity_state.toLowerCase()}
          {resource.capacity_limit != null
            ? ` · ${resource.capacity_used ?? 0}/${resource.capacity_limit}`
            : ""}
        </span>
      ))}
    </section>
  );
}
