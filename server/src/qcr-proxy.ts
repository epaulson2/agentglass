/**
 * FIXTURE: QCR OS same-origin proxy for Agentglass M1A PoC.
 * Forwards /qcr-os/* → http://127.0.0.1:4020/* (loopback, no public port needed).
 *
 * Wiring: call handleQcrOsProxy(req, pathname) from the main fetch handler
 * before the existing route switch, guarded by pathname.startsWith("/qcr-os/").
 *
 * SSE streams are forwarded transparently — ReadableStream passthrough preserves
 * chunked encoding so AG-UI event-by-event streaming works end-to-end.
 *
 * Identity boundary: run_id is transport only; qcr_conversation_id and
 * qcr_session_id live in the request body and are owned by QCR OS — this proxy
 * never inspects or strips them.
 *
 * ponytail: no auth on this path in PoC — add token forwarding for prod.
 */

const QCR_OS_ORIGIN = "http://127.0.0.1:4020";

export async function handleQcrOsProxy(req: Request, pathname: string): Promise<Response | null> {
  if (!pathname.startsWith("/qcr-os/")) return null;

  const downstream = pathname.slice("/qcr-os".length); // e.g. /health, /poc/run
  const target = `${QCR_OS_ORIGIN}${downstream}`;

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: forwardableHeaders(req.headers),
      body: req.body,
      // ponytail: duplex required for streaming request body in Bun
      // @ts-ignore — Bun supports duplex but TS lib doesn't know yet
      duplex: "half",
    });

    // Pass SSE and regular responses through verbatim
    return new Response(upstream.body, {
      status: upstream.status,
      headers: corsHeaders(upstream.headers),
    });
  } catch (err) {
    // QCR OS not running — expected in PoC when service is stopped
    return new Response(
      JSON.stringify({ ok: false, error: "qcr-os unreachable", detail: String(err) }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
}

function forwardableHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of h.entries()) {
    const lower = k.toLowerCase();
    // strip hop-by-hop headers
    if (["host", "connection", "transfer-encoding", "upgrade"].includes(lower)) continue;
    out[k] = v;
  }
  return out;
}

function corsHeaders(upstream: Headers): Headers {
  const out = new Headers(upstream);
  // Allow Agentglass web client (same server, different port in dev) to read SSE
  out.set("access-control-allow-origin", "http://localhost:4010");
  out.set("access-control-allow-credentials", "true");
  return out;
}
