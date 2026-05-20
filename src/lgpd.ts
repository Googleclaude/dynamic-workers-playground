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

interface RightsRequestBody {
	requestType?: string;
	nameHash?: string;
	emailHash?: string;
	cpfHash?: string;
	cpfLast2?: string;
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

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitBuckets = new Map<string, number[]>();

function checkRateLimit(key: string): boolean {
	const now = Date.now();
	const bucket = (rateLimitBuckets.get(key) ?? []).filter(
		(ts) => now - ts < RATE_LIMIT_WINDOW_MS,
	);
	if (bucket.length >= RATE_LIMIT_MAX) {
		rateLimitBuckets.set(key, bucket);
		return false;
	}
	bucket.push(now);
	rateLimitBuckets.set(key, bucket);
	return true;
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
	const ip = request.headers.get("CF-Connecting-IP") ?? "";
	const ua = request.headers.get("user-agent") ?? "";
	const ipHash = await hashShort(ip || "anon");
	const uaHash = await hashShort(ua || "anon");

	if (!checkRateLimit(ipHash)) {
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
			cpfLast2: body.cpfLast2,
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
	const ip = request.headers.get("CF-Connecting-IP") ?? "";
	const ua = request.headers.get("user-agent") ?? "";
	const ipHash = await hashShort(ip || "anon");
	const uaHash = await hashShort(ua || "anon");

	let body: ConsentAuditBody;
	try {
		body = (await request.json()) as ConsentAuditBody;
	} catch {
		return Response.json({ error: "invalid-json" }, { status: 400 });
	}

	if (!body.id || !body.version || !body.categories || !body.method) {
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
