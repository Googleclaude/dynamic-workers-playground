// Security-incident instrumentation (L-02 audit fix — LGPD art. 48 detection).
//
// Emits a high-severity structured event that Cloudflare Logpush / Workers
// Analytics can pick up, and optionally fires a real-time webhook when
// LGPD_ALERT_WEBHOOK is provisioned. Threshold aggregation is intentionally
// NOT done here — it belongs in the log destination (see
// docs/lgpd-incident-response.md) so we don't carry per-window state in the
// Worker.
//
// Every payload must already be pseudonymised (hashes only). Never pass raw
// PII into a security event — the webhook leaves our trust boundary.

export type SecurityAlertKind =
  | "secret-in-source"
  | "lgpd-validation-burst"
  | "forbidden-origin-burst"
  | "admin-auth-failure";

export interface SecurityAlert {
  kind: SecurityAlertKind;
  /** Free-form, MUST contain no raw PII — hashes/counts/ids only. */
  detail: Record<string, string | number | boolean>;
}

interface SecurityEventEnv {
  LGPD_ALERT_WEBHOOK?: string;
}

// `ctx` lets the webhook POST run after the response is returned, so alerting
// never adds latency to the request path.
interface WaitUntilCtx {
  waitUntil(promise: Promise<unknown>): void;
}

export function reportSecurityEvent(
  env: SecurityEventEnv,
  alert: SecurityAlert,
  ctx?: WaitUntilCtx
): void {
  const event = {
    source: "lgpd-security-alert",
    kind: "security-alert" as const,
    alertKind: alert.kind,
    ts: new Date().toISOString(),
    ...alert.detail,
  };

  // High-severity channel: console.error is what Logpush/Analytics filter on.
  console.error(JSON.stringify(event));

  const webhook = env.LGPD_ALERT_WEBHOOK;
  if (webhook) {
    const post = fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      // Don't follow redirects to an attacker-chosen host.
      redirect: "manual",
    })
      .then(() => undefined)
      .catch((err) => {
        // A failing webhook must never break the request — log and move on.
        console.error(
          JSON.stringify({
            source: "lgpd-security-alert",
            kind: "webhook-delivery-failed",
            ts: new Date().toISOString(),
            error: err instanceof Error ? err.message : String(err),
          })
        );
      });
    if (ctx) {
      ctx.waitUntil(post);
    } else {
      void post;
    }
  }
}
