import { afterEach, describe, expect, test } from "bun:test";
import { scopeNeeded } from "../src/auth.ts";
import { handleQcrOsProxy, qcrOsRequiresTrustedCaller } from "../src/qcr-proxy.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("QCR semantic action proxy authorization", () => {
  test("classifies preflight as read, attention response as answer, and generic execute as full", () => {
    expect(scopeNeeded("POST", "/qcr-os/api/v1/actions/preflight")).toBe("read");
    expect(scopeNeeded("POST", "/qcr-os/api/v1/actions/attention/respond")).toBe("answer");
    expect(scopeNeeded("POST", "/qcr-os/api/v1/actions/execute")).toBe("full");
    expect(scopeNeeded("GET", "/qcr-os/api/v1/actions/capabilities")).toBe("read");
  });

  test("requires the strict origin gate for semantic writes", () => {
    expect(qcrOsRequiresTrustedCaller("POST", "/qcr-os/api/v1/actions/execute")).toBe(true);
    expect(qcrOsRequiresTrustedCaller("POST", "/qcr-os/api/v1/actions/attention/respond")).toBe(true);
    expect(qcrOsRequiresTrustedCaller("POST", "/qcr-os/api/v1/actions/preflight")).toBe(false);
    expect(qcrOsRequiresTrustedCaller("GET", "/qcr-os/api/v1/actions/capabilities")).toBe(false);
  });

  test("strips forged identity and service headers before server-side injection", async () => {
    let forwarded: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      forwarded = init;
      return new Response("{}", { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const response = await handleQcrOsProxy(
      new Request("http://localhost/qcr-os/api/v1/actions/capabilities", {
        headers: {
          authorization: "Bearer browser-secret",
          "x-qcr-service-token": "forged-service",
          "x-qcr-principal-id": "forged-principal",
        },
      }),
      "/qcr-os/api/v1/actions/capabilities",
    );
    expect(response?.status).toBe(200);
    const headers = forwarded?.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
    expect(headers["x-qcr-service-token"]).not.toBe("forged-service");
    expect(headers["x-qcr-principal-id"]).not.toBe("forged-principal");
  });
});
