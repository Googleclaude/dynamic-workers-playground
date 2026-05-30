// Stream-based request body size enforcement. Kept in its own module (free of
// cloudflare:workers imports) so it can be unit-tested in a plain Node/vitest
// environment without the Workers pool.

// Thrown by readJsonWithLimit when the request body exceeds the byte budget.
export class BodyTooLargeError extends Error {
  constructor() {
    super("Request body too large.");
    this.name = "BodyTooLargeError";
  }
}

// Read and JSON-parse a request body, enforcing a hard byte cap while
// streaming. The Content-Length header is an unreliable cap: chunked transfer
// encoding (HTTP/1.1) or an omitted length lets a client bypass a header-only
// check, after which request.json() buffers the whole payload into memory.
// Counting bytes off the stream and aborting on overflow is the only
// enforcement that can't be lied about.
export async function readJsonWithLimit<T>(
  request: Request,
  maxBytes: number
): Promise<T> {
  const reader = request.body?.getReader();
  if (!reader) {
    // No readable stream (e.g. empty body). text() is already bounded here.
    const text = await request.text();
    if (new TextEncoder().encode(text).length > maxBytes) {
      throw new BodyTooLargeError();
    }
    return JSON.parse(text) as T;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(merged)) as T;
}
