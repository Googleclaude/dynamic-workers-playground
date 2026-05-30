import { describe, expect, it } from "vitest";
import { hmacHex, hmacShort, sha256Hex } from "./hashing";

describe("sha256Hex", () => {
  it("matches the known empty-string digest", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("produces 64 lowercase hex chars", async () => {
    const out = await sha256Hex("hello");
    expect(out).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", async () => {
    expect(await sha256Hex("abc")).toBe(await sha256Hex("abc"));
  });
});

describe("hmacHex", () => {
  it("produces 64 lowercase hex chars", async () => {
    const out = await hmacHex("secret", "payload");
    expect(out).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same secret + input", async () => {
    expect(await hmacHex("secret", "x")).toBe(await hmacHex("secret", "x"));
  });

  it("differs when the secret differs (key matters)", async () => {
    const a = await hmacHex("secret-a", "same-input");
    const b = await hmacHex("secret-b", "same-input");
    expect(a).not.toBe(b);
  });

  it("differs from a bare SHA-256 of the input (it is keyed)", async () => {
    expect(await hmacHex("secret", "x")).not.toBe(await sha256Hex("x"));
  });

  it("rotates the cached key when the secret changes", async () => {
    // Exercises the keyCache branch: alternating secrets must not collide.
    const a1 = await hmacHex("k1", "v");
    const b = await hmacHex("k2", "v");
    const a2 = await hmacHex("k1", "v");
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });
});

describe("hmacShort", () => {
  it("truncates to the requested length", async () => {
    expect((await hmacShort("s", "i", 16)).length).toBe(16);
    expect((await hmacShort("s", "i", 8)).length).toBe(8);
  });

  it("defaults to 16 chars", async () => {
    expect((await hmacShort("s", "i")).length).toBe(16);
  });

  it("is a prefix of the full hmacHex", async () => {
    const full = await hmacHex("s", "i");
    expect(await hmacShort("s", "i", 16)).toBe(full.slice(0, 16));
  });
});
