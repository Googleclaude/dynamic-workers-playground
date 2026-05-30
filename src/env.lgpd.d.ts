// Manual supplement for LGPD-specific bindings until `npm run types` is
// re-run. LGPD_KV is optional — when absent, rights-request and consent-audit
// persistence are skipped (the handlers degrade gracefully). LgpdRateLimit
// is required for the LGPD endpoints; it is declared in wrangler.jsonc.
// LGPD_HASH_SECRET is required: without it the endpoints return 503 rather
// than persist weakly-pseudonymised data. Provision via:
//   wrangler secret put LGPD_HASH_SECRET
// LGPD_KV_ENCRYPTION_KEY is optional: when set, a rights request's free-text
// `details` is AES-256-GCM encrypted at rest. When absent, details are stored
// in plaintext and a details-unencrypted event is logged. Provision via:
//   wrangler secret put LGPD_KV_ENCRYPTION_KEY
declare namespace Cloudflare {
	interface Env {
		LGPD_KV?: KVNamespace;
		LGPD_HASH_SECRET?: string;
		LGPD_KV_ENCRYPTION_KEY?: string;
		LgpdRateLimit: DurableObjectNamespace<
			import("./lgpd-rate-limit").LgpdRateLimit
		>;
	}
}
