import { describe, expect, it } from "vitest";
import { readBodyWithLimit } from "./server";

function makeRequest(body: Uint8Array | null): Request {
  if (body === null) {
    return new Request("https://x/api/run", { method: "POST" });
  }
  // Build a ReadableStream that yields the body in two chunks so the
  // streaming reader is exercised across multiple `read()` calls.
  const mid = Math.floor(body.byteLength / 2);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(body.slice(0, mid));
      controller.enqueue(body.slice(mid));
      controller.close();
    },
  });
  return new Request("https://x/api/run", {
    method: "POST",
    body: stream,
    // @ts-expect-error - Node's undici needs duplex for streamed bodies
    duplex: "half",
  });
}

describe("readBodyWithLimit", () => {
  it("returns empty buffer when body is null", async () => {
    const r = makeRequest(null);
    const buf = await readBodyWithLimit(r, 100);
    expect(buf).not.toBeNull();
    expect(buf!.byteLength).toBe(0);
  });

  it("reads a small body fully when under the limit", async () => {
    const payload = new TextEncoder().encode("hello world");
    const r = makeRequest(payload);
    const buf = await readBodyWithLimit(r, 1024);
    expect(buf).not.toBeNull();
    expect(new TextDecoder().decode(buf!)).toBe("hello world");
  });

  it("returns null when total bytes exceed the limit", async () => {
    const payload = new Uint8Array(2048).fill(65); // 2 KB of 'A'
    const r = makeRequest(payload);
    const buf = await readBodyWithLimit(r, 1024);
    expect(buf).toBeNull();
  });

  it("returns null even when Content-Length is absent (S-01 bypass)", async () => {
    // The streaming reader doesn't trust Content-Length at all — it counts
    // bytes as they arrive. A chunked client with no Content-Length cannot
    // smuggle a body larger than the limit.
    const payload = new Uint8Array(5000).fill(66);
    const r = makeRequest(payload);
    expect(r.headers.get("content-length")).toBeNull();
    const buf = await readBodyWithLimit(r, 1024);
    expect(buf).toBeNull();
  });

  it("accepts a body exactly at the limit", async () => {
    const payload = new Uint8Array(1024).fill(67);
    const r = makeRequest(payload);
    const buf = await readBodyWithLimit(r, 1024);
    expect(buf).not.toBeNull();
    expect(buf!.byteLength).toBe(1024);
  });
});
