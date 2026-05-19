import { describe, expect, it } from "vitest";
import { methodAllowsBody, normalizeMethod } from "./request-options";

describe("normalizeMethod", () => {
  it("uppercases known methods", () => {
    expect(normalizeMethod("get")).toBe("GET");
    expect(normalizeMethod("post")).toBe("POST");
    expect(normalizeMethod("Patch")).toBe("PATCH");
  });

  it("passes through canonical methods", () => {
    for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) {
      expect(normalizeMethod(m)).toBe(m);
    }
  });

  it("falls back to GET on unknown or junk input", () => {
    expect(normalizeMethod("CONNECT")).toBe("GET");
    expect(normalizeMethod("TRACE")).toBe("GET");
    expect(normalizeMethod("")).toBe("GET");
    expect(normalizeMethod(undefined)).toBe("GET");
    expect(normalizeMethod(null)).toBe("GET");
    expect(normalizeMethod(42)).toBe("GET");
    expect(normalizeMethod({})).toBe("GET");
  });
});

describe("methodAllowsBody", () => {
  it("blocks GET, HEAD, OPTIONS", () => {
    expect(methodAllowsBody("GET")).toBe(false);
    expect(methodAllowsBody("HEAD")).toBe(false);
    expect(methodAllowsBody("OPTIONS")).toBe(false);
  });

  it("allows POST/PUT/PATCH/DELETE", () => {
    expect(methodAllowsBody("POST")).toBe(true);
    expect(methodAllowsBody("PUT")).toBe(true);
    expect(methodAllowsBody("PATCH")).toBe(true);
    expect(methodAllowsBody("DELETE")).toBe(true);
  });
});
