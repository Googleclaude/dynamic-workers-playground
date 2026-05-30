import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  __resetCacheForTests,
  summarizeDiagnostics,
  typecheck,
} from "./typecheck";

// These tests require network access on first run to fetch lib.es2022 from
// jsdelivr (cached in localStorage afterwards). In CI without network,
// expect them to fail at the lib-fetch step — that's a known limitation
// of @typescript/vfs's CDN bootstrap.

describe("typecheck", () => {
  beforeAll(() => {
    __resetCacheForTests();
  });
  afterAll(() => {
    __resetCacheForTests();
  });

  it("returns no diagnostics for a clean worker", async () => {
    const result = await typecheck({
      "src/index.ts": `export default {
  fetch(request: Request): Response {
    return new Response("hello");
  }
};`,
    });
    expect(result.filesChecked).toEqual(["src/index.ts"]);
    expect(result.diagnostics).toEqual([]);
  });

  it("flags a syntax error with the correct line", async () => {
    const result = await typecheck({
      "src/index.ts": `export default {
  fetch(request: Request): Response {
    return new Response("oops";
  }
};`,
    });
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    // The unmatched paren / missing ) is on line 3
    expect(errors.some((d) => d.line === 3)).toBe(true);
  });

  it("flags a type error", async () => {
    const result = await typecheck({
      "src/index.ts": `const n: number = "not a number";
export default { fetch: () => new Response("x") };`,
    });
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((d) => d.message.toLowerCase().includes("not assignable"))).toBe(true);
  });

  it("flags a missing import across files", async () => {
    const result = await typecheck({
      "src/index.ts": `import { greet } from "./util";
export default { fetch: () => new Response(greet("world")) };`,
      "src/util.ts": `export function greet(name: number): string { return String(name); }`,
    });
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
    // greet expects number, "world" is a string -> error in src/index.ts
    expect(errors.some((d) => d.file === "src/index.ts")).toBe(true);
  });

  it("ignores non-TS files", async () => {
    const result = await typecheck({
      "src/index.ts": `export default { fetch: () => new Response("ok") };`,
      "package.json": `{"name":"x"}`,
      "data.json": `{"k":1}`,
    });
    expect(result.filesChecked).toEqual(["src/index.ts"]);
    expect(result.diagnostics).toEqual([]);
  });

  it("uses worker ambient types (Request, Response, fetch, console)", async () => {
    const result = await typecheck({
      "src/index.ts": `export default {
  async fetch(request: Request): Promise<Response> {
    console.log("hit", request.method);
    const upstream = await fetch("https://example.com");
    const text = await upstream.text();
    return new Response(text, {
      status: 200,
      headers: { "x-source": "playground" }
    });
  }
};`,
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("reports line/column 1-based", async () => {
    const result = await typecheck({
      "src/index.ts": `const x: number = "wrong";`,
    });
    const err = result.diagnostics.find((d) => d.severity === "error");
    expect(err).toBeDefined();
    expect(err!.line).toBe(1);
    expect(err!.column).toBeGreaterThanOrEqual(1);
  });
});

describe("summarizeDiagnostics", () => {
  it("counts by severity", () => {
    const s = summarizeDiagnostics([
      { file: "a.ts", line: 1, column: 1, message: "x", severity: "error", code: 1 },
      { file: "a.ts", line: 2, column: 1, message: "y", severity: "error", code: 2 },
      { file: "b.ts", line: 1, column: 1, message: "z", severity: "warning", code: 3 },
      { file: "b.ts", line: 2, column: 1, message: "w", severity: "suggestion", code: 4 },
    ]);
    expect(s).toEqual({ errors: 2, warnings: 1, total: 4 });
  });

  it("handles empty input", () => {
    expect(summarizeDiagnostics([])).toEqual({ errors: 0, warnings: 0, total: 0 });
  });
});
