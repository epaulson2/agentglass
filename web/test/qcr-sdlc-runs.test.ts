/**
 * T-VIS-A-01..12 — Agentglass SDLC Runs view contract.
 *
 * Source-inspection tests: they read the shipped file as text so that any
 * divergence from the stated contract is a test failure rather than a silent
 * runtime surprise.  The approach mirrors view-chrome.test.ts.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VIEWS = join(import.meta.dir, "..", "src", "views", "aurora");
const CONTRACTS = join(import.meta.dir, "..", "src", "lib", "qcr");

const sdlcView = readFileSync(join(VIEWS, "SdlcRunsView.tsx"), "utf8");
const auroraView = readFileSync(join(VIEWS, "AuroraTopologyView.tsx"), "utf8");
const contracts = readFileSync(join(CONTRACTS, "contracts.ts"), "utf8");

// ---------------------------------------------------------------------------
// T-VIS-A-01 — endpoint path
// ---------------------------------------------------------------------------
describe("T-VIS-A-01 — endpoint path", () => {
  it("fetches exactly /qcr-os/api/v1/sdlc/tasks", () => {
    expect(sdlcView).toContain("/qcr-os/api/v1/sdlc/tasks");
  });
});

// ---------------------------------------------------------------------------
// T-VIS-A-02 — read-only: no POST or mutation requests
// ---------------------------------------------------------------------------
describe("T-VIS-A-02 — no POST in SdlcRunsView", () => {
  it("contains no POST method call", () => {
    // Allow the string in a comment but not as an actual method value
    const postCalls = [...sdlcView.matchAll(/method\s*:\s*["']POST["']/g)];
    expect(postCalls).toHaveLength(0);
  });

  it("contains no PUT method call", () => {
    const putCalls = [...sdlcView.matchAll(/method\s*:\s*["']PUT["']/g)];
    expect(putCalls).toHaveLength(0);
  });

  it("contains no PATCH method call", () => {
    const patchCalls = [...sdlcView.matchAll(/method\s*:\s*["']PATCH["']/g)];
    expect(patchCalls).toHaveLength(0);
  });

  it("contains no DELETE method call", () => {
    const deleteCalls = [...sdlcView.matchAll(/method\s*:\s*["']DELETE["']/g)];
    expect(deleteCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-VIS-A-03 — five stage labels in canonical order
// ---------------------------------------------------------------------------
describe("T-VIS-A-03 — five stage labels in order", () => {
  const STAGE_LABELS = ["Plan", "Plan Audit", "FL Plan", "FL Implement", "Review"];

  it("renders all five stage labels", () => {
    for (const label of STAGE_LABELS) {
      expect(sdlcView).toContain(label);
    }
  });

  it("renders stage labels in the canonical pipeline order", () => {
    const positions = STAGE_LABELS.map((label) => sdlcView.indexOf(label));
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]!);
    }
  });
});

// ---------------------------------------------------------------------------
// T-VIS-A-04 — physical and semantic status both rendered
// ---------------------------------------------------------------------------
describe("T-VIS-A-04 — physical and semantic status rendered", () => {
  it("renders physical_status field", () => {
    expect(sdlcView).toContain("physical_status");
  });

  it("renders semantic_status field", () => {
    expect(sdlcView).toContain("semantic_status");
  });
});

// ---------------------------------------------------------------------------
// T-VIS-A-05 — tmux session rendered
// ---------------------------------------------------------------------------
describe("T-VIS-A-05 — tmux session rendered", () => {
  it("renders tmux_session field", () => {
    expect(sdlcView).toContain("tmux_session");
  });
});

// ---------------------------------------------------------------------------
// T-VIS-A-06 — Claude UUID abbreviated to 8 chars
// ---------------------------------------------------------------------------
describe("T-VIS-A-06 — Claude UUID abbreviated", () => {
  it("slices claude_session_id to 8 characters", () => {
    // Must slice to 8 and append ellipsis indicator
    expect(sdlcView).toMatch(/claude_session_id[^)]*?\.slice\(0,\s*8\)/);
  });
});

// ---------------------------------------------------------------------------
// T-VIS-A-07 — JEV shadow state rendered
// ---------------------------------------------------------------------------
describe("T-VIS-A-07 — JEV shadow state rendered", () => {
  it("renders jev_shadow field", () => {
    expect(sdlcView).toContain("jev_shadow");
  });
});

// ---------------------------------------------------------------------------
// T-VIS-A-08 — COMPLETE and DEGRADED render distinctly by text label
// ---------------------------------------------------------------------------
describe("T-VIS-A-08 — overall_status text labels", () => {
  it("renders COMPLETE as a text label", () => {
    expect(sdlcView).toContain("COMPLETE");
  });

  it("renders DEGRADED as a text label", () => {
    expect(sdlcView).toContain("DEGRADED");
  });
});

// ---------------------------------------------------------------------------
// T-VIS-A-09 — empty response renders expected message
// ---------------------------------------------------------------------------
describe("T-VIS-A-09 — empty state message", () => {
  it("renders 'No split-session SDLC tasks are currently registered.'", () => {
    expect(sdlcView).toContain("No split-session SDLC tasks are currently registered.");
  });
});

// ---------------------------------------------------------------------------
// T-VIS-A-10 — fetch error renders expected message without crashing Aurora
// ---------------------------------------------------------------------------
describe("T-VIS-A-10 — fetch error message", () => {
  it("renders 'SDLC visibility unavailable.'", () => {
    expect(sdlcView).toContain("SDLC visibility unavailable.");
  });
});

// ---------------------------------------------------------------------------
// T-VIS-A-11 — polling interval is 2000 ms and cleanup aborts and clears
// ---------------------------------------------------------------------------
describe("T-VIS-A-11 — polling and cleanup", () => {
  it("uses a 2000 ms polling interval", () => {
    expect(sdlcView).toMatch(/setInterval[^)]*2000/);
  });

  it("creates an AbortController for fetch cancellation", () => {
    expect(sdlcView).toContain("AbortController");
  });

  it("calls clearInterval on cleanup", () => {
    expect(sdlcView).toContain("clearInterval");
  });

  it("calls abort on cleanup", () => {
    expect(sdlcView).toContain(".abort()");
  });
});

// ---------------------------------------------------------------------------
// T-VIS-A-12 — no control, mutation, or tmux authority
// ---------------------------------------------------------------------------
describe("T-VIS-A-12 — no write authority in source", () => {
  it("does not contain POST fetch in SdlcRunsView", () => {
    expect(sdlcView).not.toMatch(/method\s*:\s*["']POST["']/);
  });

  it("does not contain action execute endpoint", () => {
    expect(sdlcView).not.toContain("/api/v1/actions/execute");
  });

  it("does not contain S2 init or start commands", () => {
    expect(sdlcView).not.toContain("qcr-sdlc-session-manager");
  });

  it("does not contain S3 complete command", () => {
    expect(sdlcView).not.toContain("qcr-sdlc-orchestrator");
  });

  it("does not contain tmux send-keys or attach", () => {
    expect(sdlcView).not.toContain("send-keys");
    expect(sdlcView).not.toContain("tmux attach");
  });

  it("does not contain S4 coordinator begin command", () => {
    expect(sdlcView).not.toContain("qcr-sdlc-coordinator");
  });
});

// ---------------------------------------------------------------------------
// Additional contract checks: Aurora mode integration
// ---------------------------------------------------------------------------
describe("Aurora AuroraTopologyView.tsx integration", () => {
  it("declares sdlc as a valid mode type", () => {
    expect(auroraView).toContain('"sdlc"');
  });

  it("renders SDLC Runs button in header", () => {
    expect(auroraView).toContain("SDLC Runs");
  });

  it("imports SdlcRunsView", () => {
    expect(auroraView).toContain("SdlcRunsView");
  });

  it("renders SdlcRunsView when mode is sdlc", () => {
    // Should contain both the mode check and the component
    expect(auroraView).toMatch(/mode.*===.*"sdlc"/);
    expect(auroraView).toContain("<SdlcRunsView");
  });
});

// ---------------------------------------------------------------------------
// contracts.ts must export the SDLC types
// ---------------------------------------------------------------------------
describe("contracts.ts exports", () => {
  it("exports QcrSdlcTask", () => {
    expect(contracts).toContain("QcrSdlcTask");
  });

  it("exports QcrSdlcTasksResponse", () => {
    expect(contracts).toContain("QcrSdlcTasksResponse");
  });

  it("exports QcrSdlcStageName", () => {
    expect(contracts).toContain("QcrSdlcStageName");
  });
});
