import { describe, expect, it } from "vitest";
import { BodyTooLargeError, readJsonWithLimit } from "./body-limit";

// Build a Request whose body streams `chunks` (each a string) with NO
// Content-Length the handler can trust — mirrors chunked transfer encoding.
function streamingRequest(chunks: string[]): Request {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Request("https://example.com/api/run", {
    method: "POST",
    body: stream,
    // @ts-expect-error duplex is required by Node/undici for a stream body
    duplex: "half",
  });
}

describe("readJsonWithLimit", () => {
  it("parses a small JSON body under the cap", async () => {
    const req = streamingRequest([JSON.stringify({ hello: "world" })]);
    const out = await readJsonWithLimit<{ hello: string }>(req, 1024);
    expect(out.hello).toBe("world");
  });

  it("reassembles a body delivered across multiple chunks", async () => {
    const json = JSON.stringify({ files: { "a.ts": "x".repeat(50) } });
    const mid = Math.floor(json.length / 2);
    const req = streamingRequest([json.slice(0, mid), json.slice(mid)]);
    const out = await readJsonWithLimit<{ files: Record<string, string> }>(
      req,
      10_000
    );
    expect(out.files["a.ts"]).toBe("x".repeat(50));
  });

  it("aborts when the streamed body exceeds the cap (chunked bypass)", async () => {
    // No trustworthy Content-Length; the only defense is counting bytes.
    const big = "y".repeat(5000);
    const req = streamingRequest([big, big]);
    await expect(readJsonWithLimit(req, 1024)).rejects.toBeInstanceOf(
      BodyTooLargeError
    );
  });

  it("propagates a SyntaxError for malformed JSON under the cap", async () => {
    const req = streamingRequest(["{ not valid json"]);
    await expect(readJsonWithLimit(req, 1024)).rejects.toBeInstanceOf(
      SyntaxError
    );
  });
});
