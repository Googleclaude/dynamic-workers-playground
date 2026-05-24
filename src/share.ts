export type ShareFiles = Record<string, string>;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = (4 - (s.length % 4)) % 4;
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encodeShareHash(files: ShareFiles): Promise<string> {
  const json = JSON.stringify(files);
  const stream = new Response(json).body!.pipeThrough(
    new CompressionStream("gzip")
  );
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return `#share=${bytesToBase64Url(compressed)}`;
}

export async function decodeShareHash(hash: string): Promise<ShareFiles | null> {
  const match = hash.match(/^#?share=([A-Za-z0-9_-]+)/);
  if (!match) return null;
  try {
    const bytes = base64UrlToBytes(match[1]);
    const stream = new Response(bytes).body!.pipeThrough(
      new DecompressionStream("gzip")
    );
    const text = await new Response(stream).text();
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const out: ShareFiles = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k !== "string" || typeof v !== "string") return null;
      out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}
