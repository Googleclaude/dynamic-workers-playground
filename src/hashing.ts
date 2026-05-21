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
