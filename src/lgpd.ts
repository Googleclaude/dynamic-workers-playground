// SECURITY: These endpoints accept unauthenticated submissions. They are
// safe only when the deployment sits behind upstream auth (e.g. Cloudflare
// Access, as recommended in README.md). Without it, anyone can submit a
// rights request for any CPF or flood the audit log. The KV binding is
// optional — without it, requests still validate and rate-limit but are
// not persisted; the handler returns 503 so the client can surface the
// misconfiguration instead of silently dropping the submission.
//
// All hashes persisted server-side (subject, IP, UA) are HMAC'd with
// LGPD_HASH_SECRET. Provision via `wrangler secret put LGPD_HASH_SECRET`.
// Without the secret, the endpoints return 503 — refusing to log weak
// pseudonymisation is preferable to claiming anonymisation we don't deliver.

import { hmacHex, hmacShort, sha256Hex } from "./hashing";

const RIGHTS_REQUEST_TYPES = new Set([
	"confirmation",
	"access",
	"correction",
	"anonymization-blocking-deletion",
	"portability",
	"sharing-info",
	"refusal-consequences",
	"consent-revocation",
	"opposition",
]);

const HEX64_RE = /^[0-9a-f]{64}$/;
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// ISO 8601 date-time: 2026-05-24T00:00:00.000Z (loose, validated by Date constructor)
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

// Validate caller-supplied timestamp: must be ISO 8601 UTC, in the window
// of [-24h, +5min] relative to `now`. Returns the validated `ts` or null
// for the caller to fall back to server time.
export function validateAuditTs(input: unknown, now: number = Date.now()): string | null {
	if (typeof input !== "string" || !ISO_TS_RE.test(input)) return null;
	const supplied = new Date(input).getTime();
	if (Number.isNaN(supplied)) return null;
	if (supplied > now + 5 * 60_000) return null;
	if (supplied < now - 24 * 60 * 60_000) return null;
	return input;
}

// Reject browser POSTs from other origins. Non-browser clients (no Origin
// header) are allowed because they're outside the CSRF threat model.
export function isAllowedOriginHeader(origin: string | null, host: string): boolean {
	if (!origin) return true;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}

export interface RightsRequestBody {
	requestType?: string;
	nameHash?: string;
	emailHash?: string;
	cpfHash?: string;
	details?: string;
	locale?: string;
	confirmedSubject?: boolean;
}

export function validateRightsRequestBody(body: RightsRequestBody): string | null {
	if (!body.requestType || !RIGHTS_REQUEST_TYPES.has(body.requestType)) return "invalid-request-type";
	if (!body.nameHash || !HEX64_RE.test(body.nameHash)) return "invalid-name-hash";
	if (!body.emailHash || !HEX64_RE.test(body.emailHash)) return "invalid-email-hash";
	if (!body.details || typeof body.details !== "string") return "missing-details";
	if (body.details.length === 0 || body.details.length > 2000) return "details-length";
	if (body.confirmedSubject !== true) return "subject-not-confirmed";
	if (body.cpfHash && !HEX64_RE.test(body.cpfHash)) return "invalid-cpf-hash";
	return null;
}

interface ConsentAuditBody {
	id?: string;
	version?: string;
	categories?: Record<string, boolean>;
	method?: string;
	ts?: string;
}

function getHashSecret(env: Env): string | null {
	const secret = (env as Env & { LGPD_HASH_SECRET?: string }).LGPD_HASH_SECRET;
	return secret && secret.length > 0 ? secret : null;
}

// Rate-limit via the LgpdRateLimit Durable Object (declared in wrangler.jsonc
// and src/env.lgpd.d.ts). The DO survives isolate eviction and shares state
// across edge nodes — better than an in-memory Map per isolate.
async function checkRateLimit(
	env: Env,
	ipHash: string,
	scope: "rights" | "audit",
): Promise<boolean> {
	const id = env.LgpdRateLimit.idFromName(ipHash);
	const stub = env.LgpdRateLimit.get(id);
	const { allowed } = await stub.check(scope);
	return allowed;
}

function isAllowedOrigin(request: Request): boolean {
	const origin = request.headers.get("Origin");
	const host = request.headers.get("Host") ?? "";
	return isAllowedOriginHeader(origin, host);
}

function makeProtocol(): string {
	const now = new Date();
	const yyyy = now.getUTCFullYear();
	const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(now.getUTCDate()).padStart(2, "0");
	const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
	return `LGPD-${yyyy}${mm}${dd}-${id}`;
}

export async function handleRightsRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!isAllowedOrigin(request)) {
		return Response.json({ error: "forbidden-origin" }, { status: 403 });
	}

	const secret = getHashSecret(env);
	if (!secret) {
		console.log(
			JSON.stringify({
				event: "lgpd.rights-request.secret-missing",
				ts: new Date().toISOString(),
			}),
		);
		return Response.json({ error: "secret-unavailable" }, { status: 503 });
	}

	const ip = request.headers.get("CF-Connecting-IP") ?? "";
	const ua = request.headers.get("user-agent") ?? "";
	const ipHash = await hmacShort(secret, ip || "anon");
	const uaHash = await hmacShort(secret, ua || "anon");

	if (!(await checkRateLimit(env, ipHash, "rights"))) {
		console.log(
			JSON.stringify({
				event: "lgpd.rights-request.rate-limited",
				ts: new Date().toISOString(),
				ip_hash: ipHash,
				ua_hash: uaHash,
			}),
		);
		return Response.json({ error: "rate-limited" }, { status: 429 });
	}

	let body: RightsRequestBody;
	try {
		body = (await request.json()) as RightsRequestBody;
	} catch {
		return Response.json({ error: "invalid-json" }, { status: 400 });
	}

	const validationError = validateRightsRequestBody(body);
	if (validationError) {
		return Response.json({ error: validationError }, { status: 400 });
	}

	// Re-HMAC the client-supplied subject hashes with the server secret.
	// The client SHA-256 is what we agreed to over the wire; the server HMAC
	// is what we persist. An attacker who exfiltrates KV cannot rainbow-table
	// the stored values without also exfiltrating LGPD_HASH_SECRET.
	const subjectNameHash = await hmacHex(secret, body.nameHash);
	const subjectEmailHash = await hmacHex(secret, body.emailHash);
	const subjectCpfHash = body.cpfHash
		? await hmacHex(secret, body.cpfHash)
		: undefined;

	const id = crypto.randomUUID();
	const protocol = makeProtocol();
	const receivedAt = new Date().toISOString();
	const integrity = await sha256Hex(
		`${id}|${body.requestType}|${subjectNameHash}|${subjectEmailHash}|${receivedAt}`,
	);

	const record = {
		id,
		protocol,
		receivedAt,
		requestType: body.requestType,
		locale: body.locale ?? "en",
		subject: {
			nameHash: subjectNameHash,
			emailHash: subjectEmailHash,
			cpfHash: subjectCpfHash,
		},
		details: body.details,
		status: "received" as const,
		integrity,
		ip_hash: ipHash,
		ua_hash: uaHash,
	};

	const kv = env.LGPD_KV as KVNamespace | undefined;
	if (!kv) {
		console.log(
			JSON.stringify({
				event: "lgpd.rights-request.kv-missing",
				protocol,
				ts: receivedAt,
			}),
		);
		return Response.json({ error: "storage-unavailable" }, { status: 503 });
	}

	await kv.put(`request:${id}`, JSON.stringify(record), {
		metadata: {
			protocol,
			requestType: body.requestType,
			receivedAt,
		},
	});
	await kv.put(`protocol:${protocol}`, id);

	console.log(
		JSON.stringify({
			event: "lgpd.rights-request.received",
			protocol,
			requestType: body.requestType,
			ts: receivedAt,
			ip_hash: ipHash,
			ua_hash: uaHash,
		}),
	);

	return Response.json({ protocol, receivedAt });
}

export async function handleConsentAudit(
	request: Request,
	env: Env,
): Promise<Response> {
	if (!isAllowedOrigin(request)) {
		return Response.json({ error: "forbidden-origin" }, { status: 403 });
	}

	const secret = getHashSecret(env);
	if (!secret) {
		return Response.json({ error: "secret-unavailable" }, { status: 503 });
	}

	const ip = request.headers.get("CF-Connecting-IP") ?? "";
	const ua = request.headers.get("user-agent") ?? "";
	const ipHash = await hmacShort(secret, ip || "anon");
	const uaHash = await hmacShort(secret, ua || "anon");

	if (!(await checkRateLimit(env, ipHash, "audit"))) {
		return Response.json({ error: "rate-limited" }, { status: 429 });
	}

	let body: ConsentAuditBody;
	try {
		body = (await request.json()) as ConsentAuditBody;
	} catch {
		return Response.json({ error: "invalid-json" }, { status: 400 });
	}

	if (
		!body.id ||
		!UUID_RE.test(body.id) ||
		!body.version ||
		typeof body.version !== "string" ||
		body.version.length > 32 ||
		!body.categories ||
		typeof body.categories !== "object" ||
		!body.method ||
		!["accept-all", "reject-all", "custom"].includes(body.method)
	) {
		return Response.json({ error: "invalid-payload" }, { status: 400 });
	}

	const auditTs = validateAuditTs(body.ts) ?? new Date().toISOString();

	const auditRecord = {
		id: body.id,
		version: body.version,
		categories: body.categories,
		method: body.method,
		ts: auditTs,
		ip_hash: ipHash,
		ua_hash: uaHash,
	};

	const kv = env.LGPD_KV as KVNamespace | undefined;
	if (kv) {
		await kv.put(
			`consent-audit:${body.id}`,
			JSON.stringify(auditRecord),
		);
	}

	console.log(
		JSON.stringify({
			event: "lgpd.consent.audit",
			consentId: body.id,
			method: body.method,
			ts: auditRecord.ts,
			ip_hash: ipHash,
			ua_hash: uaHash,
		}),
	);

	return Response.json({ ok: true });
}
