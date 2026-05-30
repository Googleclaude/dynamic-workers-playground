import { describe, expect, it } from "vitest";
import { decodeShareHash, encodeShareHash } from "./share";

describe("share encode/decode", () => {
  it("round-trips a small file set", async () => {
    const files = {
      "src/index.ts": `export default { fetch: () => new Response("hi") };`,
      "package.json": `{"name":"x","main":"src/index.ts"}`,
    };
    const hash = await encodeShareHash(files);
    expect(hash.startsWith("#share=")).toBe(true);
    const decoded = await decodeShareHash(hash);
    expect(decoded).toEqual(files);
  });

  it("round-trips with unicode and large content", async () => {
    const files = {
      "src/data.ts": "// emoji 🎉 ção ✓\n".repeat(500),
      "src/index.ts": "export default { fetch: () => new Response('ok') };",
    };
    const hash = await encodeShareHash(files);
    const decoded = await decodeShareHash(hash);
    expect(decoded).toEqual(files);
  });

  it("returns null on an invalid hash", async () => {
    expect(await decodeShareHash("")).toBeNull();
    expect(await decodeShareHash("#foo=bar")).toBeNull();
    expect(await decodeShareHash("#share=!!!not-base64!!!")).toBeNull();
  });

  it("returns null on garbage that decodes but is not an object of strings", async () => {
    // Manually craft a valid #share= payload whose decoded JSON is an array.
    const json = JSON.stringify(["not", "an", "object"]);
    const stream = new Response(json).body!.pipeThrough(
      new CompressionStream("gzip")
    );
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = "";
    for (let i = 0; i < compressed.length; i++)
      binary += String.fromCharCode(compressed[i]);
    const base64 = btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await decodeShareHash(`#share=${base64}`)).toBeNull();
  });

  it("accepts hash with or without leading #", async () => {
    const files = { "a.ts": "x" };
    const hash = await encodeShareHash(files);
    expect(await decodeShareHash(hash)).toEqual(files);
    expect(await decodeShareHash(hash.slice(1))).toEqual(files);
  });
});
