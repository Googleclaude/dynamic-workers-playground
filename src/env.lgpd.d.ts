// Manual supplement for LGPD-specific bindings until `npm run types` is
// re-run. LGPD_KV is optional — when absent, rights-request and consent-audit
// persistence are skipped (the handlers degrade gracefully). LgpdRateLimit
// is required for the LGPD endpoints; it is declared in wrangler.jsonc.
// LGPD_HASH_SECRET is required: without it the endpoints return 503 rather
// than persist weakly-pseudonymised data. Provision via:
//   wrangler secret put LGPD_HASH_SECRET
declare namespace Cloudflare {
	interface Env {
		LGPD_KV?: KVNamespace;
		LGPD_HASH_SECRET?: string;
		LgpdRateLimit: DurableObjectNamespace<
			import("./lgpd-rate-limit").LgpdRateLimit
		>;
	}
}
