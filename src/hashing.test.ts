import { describe, expect, it } from "vitest";
import { hashShort, hmacHex, hmacShort, sha256Hex } from "./hashing";

describe("sha256Hex", () => {
	it("returns 64-hex-char output for any input", async () => {
		expect(await sha256Hex("")).toMatch(/^[0-9a-f]{64}$/);
		expect(await sha256Hex("hello")).toMatch(/^[0-9a-f]{64}$/);
	});

	it("is deterministic for the same input", async () => {
		const a = await sha256Hex("test@example.com");
		const b = await sha256Hex("test@example.com");
		expect(a).toBe(b);
	});

	it("changes when the input changes", async () => {
		const a = await sha256Hex("a");
		const b = await sha256Hex("b");
		expect(a).not.toBe(b);
	});

	it("matches a known vector", async () => {
		expect(await sha256Hex("")).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
	});
});

describe("hashShort", () => {
	it("returns the first N hex chars of SHA-256", async () => {
		const full = await sha256Hex("input");
		expect(await hashShort("input", 16)).toBe(full.slice(0, 16));
	});
});

describe("hmacHex / hmacShort", () => {
	const secret = "test-secret-do-not-use-in-production";

	it("differs from raw SHA-256 of the same input", async () => {
		const sha = await sha256Hex("subject-value");
		const hmac = await hmacHex(secret, "subject-value");
		expect(hmac).not.toBe(sha);
		expect(hmac).toMatch(/^[0-9a-f]{64}$/);
	});

	it("differs when the secret rotates", async () => {
		const a = await hmacHex("secret-a", "value");
		const b = await hmacHex("secret-b", "value");
		expect(a).not.toBe(b);
	});

	it("is deterministic for the same (secret, input)", async () => {
		const a = await hmacHex(secret, "x");
		const b = await hmacHex(secret, "x");
		expect(a).toBe(b);
	});

	it("hmacShort truncates to the requested length", async () => {
		expect(await hmacShort(secret, "x", 16)).toHaveLength(16);
		expect(await hmacShort(secret, "x", 8)).toHaveLength(8);
	});
});
