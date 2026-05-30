// AES-256-GCM helpers for encrypting personal data at rest (LGPD art. 46).
// HMAC pseudonymisation protects subject identifiers, but free-text fields
// (e.g. a rights request's `details`) can themselves contain personal data,
// so they are encrypted before they touch KV. The key is derived from
// LGPD_KV_ENCRYPTION_KEY via SHA-256 so any secret length yields a valid
// 256-bit key. Output is base64(iv ‖ ciphertext) with a 12-byte IV prefix.

const IV_BYTES = 12;

let aesKeyCache: { material: string; key: CryptoKey } | null = null;

async function getAesKey(material: string): Promise<CryptoKey> {
	if (aesKeyCache && aesKeyCache.material === material) return aesKeyCache.key;
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(material),
	);
	const key = await crypto.subtle.importKey(
		"raw",
		digest,
		{ name: "AES-GCM" },
		false,
		["encrypt", "decrypt"],
	);
	aesKeyCache = { material, key };
	return key;
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
}

function fromBase64(s: string): Uint8Array {
	const binary = atob(s);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export async function encryptString(
	keyMaterial: string,
	plaintext: string,
): Promise<string> {
	const key = await getAesKey(keyMaterial);
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			key,
			new TextEncoder().encode(plaintext),
		),
	);
	const packed = new Uint8Array(iv.length + ciphertext.length);
	packed.set(iv, 0);
	packed.set(ciphertext, iv.length);
	return toBase64(packed);
}

export async function decryptString(
	keyMaterial: string,
	packed: string,
): Promise<string> {
	const key = await getAesKey(keyMaterial);
	const bytes = fromBase64(packed);
	const iv = bytes.slice(0, IV_BYTES);
	const ciphertext = bytes.slice(IV_BYTES);
	const plaintext = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv },
		key,
		ciphertext,
	);
	return new TextDecoder().decode(plaintext);
}

// Reset the derived-key cache. Test-only.
export function __resetKeyCacheForTests(): void {
	aesKeyCache = null;
}
