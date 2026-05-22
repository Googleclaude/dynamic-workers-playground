import { hashShort, sha256Hex } from "./hashing";

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

interface RightsRequestBody {
	requestType?: string;
	nameHash?: string;
	emailHash?: string;
	cpfHash?: string;
	details?: string;
	locale?: string;
	confirmedSubject?: boolean;
}

interface ConsentAuditBody {
	id?: string;
	version?: string;
	categories?: Record<string, boolean>;
	method?: string;
	ts?: string;
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

// Reject browser POSTs from other origins. Non-browser clients (no Origin
// header) are allowed because they're outside the CSRF threat model.
function isAllowedOrigin(request: Request): boolean {
	const origin = request.headers.get("Origin");
	if (!origin) return true;
	const host = request.headers.get("Host") ?? "";
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
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

	const ip = request.headers.get("CF-Connecting-IP") ?? "";
	const ua = request.headers.get("user-agent") ?? "";
	const ipHash = await hashShort(ip || "anon");
	const uaHash = await hashShort(ua || "anon");

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

	if (
		!body.requestType ||
		!RIGHTS_REQUEST_TYPES.has(body.requestType) ||
		!body.nameHash ||
		!HEX64_RE.test(body.nameHash) ||
		!body.emailHash ||
		!HEX64_RE.test(body.emailHash) ||
		!body.details ||
		typeof body.details !== "string" ||
		body.details.length === 0 ||
		body.details.length > 2000 ||
		body.confirmedSubject !== true
	) {
		return Response.json({ error: "invalid-payload" }, { status: 400 });
	}

	if (body.cpfHash && !HEX64_RE.test(body.cpfHash)) {
		return Response.json({ error: "invalid-cpf-hash" }, { status: 400 });
	}

	const id = crypto.randomUUID();
	const protocol = makeProtocol();
	const receivedAt = new Date().toISOString();
	const integrity = await sha256Hex(
		`${id}|${body.requestType}|${body.nameHash}|${body.emailHash}|${receivedAt}`,
	);

	const record = {
		id,
		protocol,
		receivedAt,
		requestType: body.requestType,
		locale: body.locale ?? "en",
		subject: {
			nameHash: body.nameHash,
			emailHash: body.emailHash,
			cpfHash: body.cpfHash,
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

	const ip = request.headers.get("CF-Connecting-IP") ?? "";
	const ua = request.headers.get("user-agent") ?? "";
	const ipHash = await hashShort(ip || "anon");
	const uaHash = await hashShort(ua || "anon");

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

	const auditRecord = {
		id: body.id,
		version: body.version,
		categories: body.categories,
		method: body.method,
		ts: body.ts ?? new Date().toISOString(),
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
