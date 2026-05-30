import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetKeyCacheForTests,
  decryptString,
  encryptString,
} from "./encryption";

describe("encryptString / decryptString", () => {
  beforeEach(() => {
    __resetKeyCacheForTests();
  });

  it("round-trips plaintext", async () => {
    const key = "a-32-byte-or-longer-secret-key!!";
    const plain = "Detalhes da solicitação com acentuação ção 🎉";
    const enc = await encryptString(key, plain);
    expect(enc).not.toBe(plain);
    expect(await decryptString(key, enc)).toBe(plain);
  });

  it("produces different ciphertext each call (random IV)", async () => {
    const key = "secret";
    const a = await encryptString(key, "same");
    const b = await encryptString(key, "same");
    expect(a).not.toBe(b);
    expect(await decryptString(key, a)).toBe("same");
    expect(await decryptString(key, b)).toBe("same");
  });

  it("emits base64 (iv + ciphertext)", async () => {
    const enc = await encryptString("secret", "hi");
    expect(enc).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("fails to decrypt with the wrong key", async () => {
    const enc = await encryptString("right-key", "secret data");
    await expect(decryptString("wrong-key", enc)).rejects.toBeDefined();
  });

  it("round-trips an empty string", async () => {
    const enc = await encryptString("k", "");
    expect(await decryptString("k", enc)).toBe("");
  });
});
