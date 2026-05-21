import type { RightsRequestType } from "./constants";

export interface RightsRequestPayload {
	requestType: RightsRequestType;
	name: string;
	email: string;
	cpf?: string;
	details: string;
	locale: string;
	confirmedSubject: boolean;
}

export interface RightsRequestResponse {
	protocol: string;
	receivedAt: string;
}

async function sha256Hex(input: string): Promise<string> {
	const buf = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(input),
	);
	return Array.from(new Uint8Array(buf), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}

function digitsOnly(s: string): string {
	return s.replace(/\D+/g, "");
}

export async function submitRightsRequest(
	payload: RightsRequestPayload,
): Promise<RightsRequestResponse> {
	const cpfDigits = payload.cpf ? digitsOnly(payload.cpf) : "";
	const body = {
		requestType: payload.requestType,
		nameHash: await sha256Hex(payload.name.trim().toLowerCase()),
		emailHash: await sha256Hex(payload.email.trim().toLowerCase()),
		cpfHash: cpfDigits ? await sha256Hex(cpfDigits) : undefined,
		details: payload.details,
		locale: payload.locale,
		confirmedSubject: payload.confirmedSubject,
	};
	const res = await fetch("/api/lgpd/rights-request", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`Request failed (${res.status}): ${text}`);
	}
	return (await res.json()) as RightsRequestResponse;
}

export async function submitConsentAudit(record: {
	id: string;
	version: string;
	categories: Record<string, boolean>;
	method: string;
}): Promise<void> {
	try {
		await fetch("/api/lgpd/consent-audit", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ...record, ts: new Date().toISOString() }),
		});
	} catch {
		// audit is best-effort; never block UX
	}
}
