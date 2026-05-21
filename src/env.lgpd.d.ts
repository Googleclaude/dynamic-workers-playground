// Manual supplement for LGPD-specific bindings until `npm run types` is
// re-run. LGPD_KV is optional — when absent, rights-request and consent-audit
// persistence are skipped (the handlers degrade gracefully). LgpdRateLimit
// is required for the LGPD endpoints; it is declared in wrangler.jsonc.
declare namespace Cloudflare {
	interface Env {
		LGPD_KV?: KVNamespace;
		LgpdRateLimit: DurableObjectNamespace<
			import("./lgpd-rate-limit").LgpdRateLimit
		>;
	}
}
