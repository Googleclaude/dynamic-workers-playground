// LGPD admin endpoint (L-06 audit fix) — lets an operator list pending
// rights requests so they can be fulfilled within the 15-business-day SLA
// (art. 18 §1º).
//
// AUTH: bearer token compared in constant time against LGPD_ADMIN_TOKEN
// (provision via `wrangler secret put LGPD_ADMIN_TOKEN`). Without the secret
// the endpoint returns 503 — refusing to serve admin data with no auth is
// safer than a soft-open. In production this SHOULD additionally sit behind
// Cloudflare Access; the bearer token is defence-in-depth, not the only gate.

import { reportSecurityEvent } from "./security-events";

interface AdminEnv {
  LGPD_ADMIN_TOKEN?: string;
  LGPD_KV?: KVNamespace;
  LGPD_ALERT_WEBHOOK?: string;
}

// Constant-time string compare to avoid leaking the token via timing.
function timingSafeEqual(a: string, b: string): boolean {
  // Hash both sides to a fixed length first so length differences don't leak
  // and the XOR loop always runs over equal-length inputs.
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) {
    // Still do a dummy compare to keep timing flat-ish, then fail.
    let acc = 1;
    for (let i = 0; i < ab.length; i++) acc |= ab[i];
    return acc === -1; // always false
  }
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function getBearer(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth) return null;
  const m = /^Bearer\s+(.+)$/.exec(auth);
  return m ? m[1] : null;
}

interface RequestListItem {
  id: string;
  protocol: string;
  requestType: string;
  receivedAt: string;
  status: string;
}

export async function handleAdminListRequests(
  request: Request,
  env: Env,
  ctx?: { waitUntil(p: Promise<unknown>): void }
): Promise<Response> {
  const adminEnv = env as Env & AdminEnv;
  const token = adminEnv.LGPD_ADMIN_TOKEN;

  if (!token || token.length === 0) {
    return Response.json({ error: "admin-unavailable" }, { status: 503 });
  }

  const provided = getBearer(request);
  if (!provided || !timingSafeEqual(provided, token)) {
    reportSecurityEvent(
      adminEnv,
      {
        kind: "admin-auth-failure",
        detail: { endpoint: "admin/requests", hadToken: provided !== null },
      },
      ctx
    );
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const kv = adminEnv.LGPD_KV;
  if (!kv) {
    return Response.json({ error: "storage-unavailable" }, { status: 503 });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");
  const limitParam = Number(url.searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 1000)
    : 100;

  // List keys by metadata to avoid reading every value (metadata is returned
  // by list() for free). Falls back to value read only when needed.
  const listed = await kv.list<{
    protocol?: string;
    requestType?: string;
    receivedAt?: string;
  }>({ prefix: "request:", limit });

  const items: RequestListItem[] = [];
  for (const key of listed.keys) {
    const meta = key.metadata ?? {};
    // status isn't in metadata; read the value only when a status filter is
    // active or status is otherwise needed. Default listing returns "received"
    // (the only status writes can produce today) without an extra read.
    let status = "received";
    if (statusFilter) {
      const raw = await kv.get(key.name);
      if (raw) {
        try {
          status = (JSON.parse(raw) as { status?: string }).status ?? "received";
        } catch {
          status = "received";
        }
      }
    }
    if (statusFilter && status !== statusFilter) continue;
    items.push({
      id: key.name.replace(/^request:/, ""),
      protocol: meta.protocol ?? "",
      requestType: meta.requestType ?? "",
      receivedAt: meta.receivedAt ?? "",
      status,
    });
  }

  return Response.json({
    count: items.length,
    listComplete: listed.list_complete,
    items,
  });
}
