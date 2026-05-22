export async function sha256Hex(input: string): Promise<string> {
	const buf = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(input),
	);
	return Array.from(new Uint8Array(buf), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}

export async function hashShort(input: string, length = 16): Promise<string> {
	const hex = await sha256Hex(input);
	return hex.slice(0, length);
}

// HMAC-SHA256 keyed by a server-side secret. Use this for ANY hash of
// personal data persisted server-side (subject hashes, IP, UA). Without a
// secret, raw SHA-256 of a small input space (e.g. CPF, IPv4) is trivially
// reversible via rainbow table — that's pseudonymisation, not anonymisation.
// The secret must be provisioned via `wrangler secret put LGPD_HASH_SECRET`.
let keyCache: { secret: string; key: CryptoKey } | null = null;

async function getHmacKey(secret: string): Promise<CryptoKey> {
	if (keyCache && keyCache.secret === secret) return keyCache.key;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	keyCache = { secret, key };
	return key;
}

export async function hmacHex(secret: string, input: string): Promise<string> {
	const key = await getHmacKey(secret);
	const sig = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(input),
	);
	return Array.from(new Uint8Array(sig), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
}

export async function hmacShort(
	secret: string,
	input: string,
	length = 16,
): Promise<string> {
	const hex = await hmacHex(secret, input);
	return hex.slice(0, length);
}
