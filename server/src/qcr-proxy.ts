/**
 * QCR OS same-origin proxy for Agentglass M1A Phase 1 closeout.
 * Forwards /qcr-os/* → QCR_OS_ORIGIN/* (loopback, no public port).
 *
 * Trust model (Workstream C):
 * - Agentglass server authenticates the browser request via its own auth gate.
 * - This module injects a server-side-only service-channel token into the
 *   upstream request. The browser never sees or supplies this token.
 * - QCR OS verifies the service-channel token before processing.
 * - Semantic principal binding (who is the operator) is Phase 3.
 *
 * Identity boundary:
 * - AG-UI run_id = transport only
 * - qcr_conversation_id / qcr_session_id = QCR-owned, opaque passthrough
 * - Browser may hold QCR IDs as opaque transient references for routing;
 *   browser MUST NOT mint, redefine, persist as authority, or treat as auth.
 */

const QCR_OS_ORIGIN = process.env.QCR_OS_ORIGIN ?? "http://127.0.0.1:4020";
const QCR_OS_SERVICE_TOKEN = process.env.QCR_OS_SERVICE_TOKEN ?? "m1a-poc-service-token";
const QCR_OS_OPERATOR_PRINCIPAL_ID = process.env.QCR_OS_OPERATOR_PRINCIPAL_ID ?? "";

// Prevent caller-controlled upstream host selection
const ALLOWED_ORIGIN = new URL(QCR_OS_ORIGIN);
if (ALLOWED_ORIGIN.hostname !== "127.0.0.1" && ALLOWED_ORIGIN.hostname !== "localhost") {
  throw new Error(`QCR_OS_ORIGIN must be loopback, got: ${ALLOWED_ORIGIN.hostname}`);
}

export async function handleQcrOsProxy(req: Request, pathname: string): Promise<Response | null> {
  if (!pathname.startsWith("/qcr-os/")) return null;

  if (pathname.startsWith("/qcr-os/api/v1/conversations/") && !QCR_OS_OPERATOR_PRINCIPAL_ID) {
    return new Response(
      JSON.stringify({ error: { code: "CONVERSATION_UNAVAILABLE", message: "Operator mapping is not configured", retryable: false } }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const downstream = pathname.slice("/qcr-os".length); // e.g. /health, /poc/run
  const url = new URL(req.url);
  const qs = url.search; // preserve query string
  const target = `${QCR_OS_ORIGIN}${downstream}${qs}`;

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: forwardableHeaders(req.headers),
      body: req.body,
      signal: req.signal,
      // @ts-ignore — Bun supports duplex but TS lib doesn't declare it
      duplex: "half",
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: sseSafeHeaders(upstream.headers),
    });
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "qcr-os unreachable" }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
}

/** QCR POSTs are treated as mutations except the explicitly pure preflight query. */
export function qcrOsRequiresTrustedCaller(method: string, pathname: string): boolean {
  if (!pathname.startsWith("/qcr-os/")) return false;
  if (method === "GET" || method === "HEAD") return false;
  return pathname !== "/qcr-os/api/v1/actions/preflight";
}

function forwardableHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of h.entries()) {
    const lower = k.toLowerCase();
    if (["host", "connection", "transfer-encoding", "upgrade", "authorization", "x-qcr-service-token", "x-qcr-principal-id", "x-forwarded-user", "x-forwarded-email"].includes(lower)) continue;
    out[k] = v;
  }
  // Inject server-side-only service-channel token — browser never supplies this
  out["x-qcr-service-token"] = QCR_OS_SERVICE_TOKEN;
  if (QCR_OS_OPERATOR_PRINCIPAL_ID) out["x-qcr-principal-id"] = QCR_OS_OPERATOR_PRINCIPAL_ID;
  return out;
}

function sseSafeHeaders(upstream: Headers): Headers {
  const out = new Headers();
  // Preserve content-type (critical for SSE: text/event-stream)
  const ct = upstream.get("content-type");
  if (ct) out.set("content-type", ct);
  // Preserve cache-control for SSE
  const cc = upstream.get("cache-control");
  if (cc) out.set("cache-control", cc);
  if (ct?.startsWith("text/event-stream")) out.set("x-accel-buffering", "no");
  return out;
}
