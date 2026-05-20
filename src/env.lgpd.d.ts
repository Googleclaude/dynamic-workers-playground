// Manual supplement until `npm run types` is re-run with the KV binding.
// Once regenerated, env.d.ts will already include LGPD_KV and this file
// becomes a redundant (but harmless) merger.
declare namespace Cloudflare {
	interface Env {
		LGPD_KV: KVNamespace;
	}
}
