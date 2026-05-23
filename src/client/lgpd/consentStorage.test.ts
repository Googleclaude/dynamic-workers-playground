import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemStorage {
	private store = new Map<string, string>();
	getItem(k: string) {
		return this.store.has(k) ? (this.store.get(k) as string) : null;
	}
	setItem(k: string, v: string) {
		this.store.set(k, String(v));
	}
	removeItem(k: string) {
		this.store.delete(k);
	}
	clear() {
		this.store.clear();
	}
}

beforeEach(() => {
	vi.stubGlobal("window", {
		localStorage: new MemStorage(),
		dispatchEvent: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("consentStorage", () => {
	it("loadConsent returns null when nothing stored", async () => {
		const { loadConsent } = await import("./consentStorage");
		expect(loadConsent()).toBeNull();
	});

	it("loadConsent returns null for version mismatch", async () => {
		const { loadConsent } = await import("./consentStorage");
		window.localStorage.setItem(
			"lgpd-consent",
			JSON.stringify({
				version: "0.0.0",
				timestamp: new Date().toISOString(),
				locale: "en",
				categories: { necessary: true, functional: true, preferences: false },
				method: "accept-all",
				id: "abc",
			}),
		);
		expect(loadConsent()).toBeNull();
	});

	it("saveConsent + loadConsent round-trip", async () => {
		const { saveConsent, loadConsent } = await import("./consentStorage");
		const { CONSENT_VERSION } = await import("./constants");
		const record = {
			version: CONSENT_VERSION,
			timestamp: "2026-01-01T00:00:00.000Z",
			locale: "pt-BR",
			categories: { necessary: true, functional: true, preferences: false },
			method: "accept-all" as const,
			id: "test-id",
		};
		saveConsent(record);
		expect(loadConsent()).toEqual(record);
	});

	it("clearConsent removes the record", async () => {
		const { saveConsent, clearConsent, loadConsent } = await import(
			"./consentStorage"
		);
		const { CONSENT_VERSION } = await import("./constants");
		saveConsent({
			version: CONSENT_VERSION,
			timestamp: new Date().toISOString(),
			locale: "en",
			categories: { necessary: true, functional: false, preferences: false },
			method: "reject-all",
			id: "id",
		});
		clearConsent();
		expect(loadConsent()).toBeNull();
	});

	it("loadConsent returns null on malformed JSON", async () => {
		const { loadConsent } = await import("./consentStorage");
		window.localStorage.setItem("lgpd-consent", "{not json");
		expect(loadConsent()).toBeNull();
	});
});
