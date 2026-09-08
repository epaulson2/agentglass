import { afterEach, expect, test } from "bun:test";

import {
  getQcrPortfolio,
  refreshQcrPortfolio,
} from "../src/lib/qcrPortfolio.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("portfolio store keeps only redacted resource pressure fields", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    active_lease_count: 2,
    queued_lease_request_count: 1,
    resource_pressure: [{
      resource_type: "GIT_WORKTREE",
      display_locator: "queen-city-redline",
      active_leases: 1,
      queued_requests: 1,
      capacity_used: null,
      capacity_limit: null,
      capacity_state: "CONTESTED",
    }],
    fencing_token: "must-not-be-read",
  }), { status: 200 })) as unknown as typeof fetch;

  await refreshQcrPortfolio();
  expect(getQcrPortfolio()).toEqual({
    active_lease_count: 2,
    queued_lease_request_count: 1,
    resource_pressure: [{
      resource_type: "GIT_WORKTREE",
      display_locator: "queen-city-redline",
      active_leases: 1,
      queued_requests: 1,
      capacity_used: null,
      capacity_limit: null,
      capacity_state: "CONTESTED",
    }],
  });
  expect(JSON.stringify(getQcrPortfolio())).not.toContain("must-not-be-read");
});
