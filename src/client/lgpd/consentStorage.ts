import { CONSENT_KEY, CONSENT_VERSION } from "./constants";

export type ConsentCategory = "necessary" | "functional" | "preferences";

export interface ConsentRecord {
	version: string;
	timestamp: string;
	locale: string;
	categories: Record<ConsentCategory, boolean>;
	method: "accept-all" | "reject-all" | "custom";
	id: string;
}

export const CONSENT_CHANGED_EVENT = "lgpd:consent-changed";

export function loadConsent(): ConsentRecord | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(CONSENT_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as ConsentRecord;
		if (!parsed || parsed.version !== CONSENT_VERSION) return null;
		if (!parsed.categories || typeof parsed.categories !== "object") return null;
		return parsed;
	} catch {
		return null;
	}
}

export function saveConsent(record: ConsentRecord): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
	window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
}

export function clearConsent(): void {
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(CONSENT_KEY);
	window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
}

export function newConsentId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
