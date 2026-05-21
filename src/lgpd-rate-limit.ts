import { DurableObject } from "cloudflare:workers";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;

interface CheckResponse {
	allowed: boolean;
	remaining: number;
}

export class LgpdRateLimit extends DurableObject {
	async check(key: string): Promise<CheckResponse> {
		const now = Date.now();
		const stored = (await this.ctx.storage.get<number[]>(key)) ?? [];
		const recent = stored.filter((ts) => now - ts < WINDOW_MS);

		if (recent.length >= MAX_REQUESTS) {
			await this.ctx.storage.put(key, recent);
			return { allowed: false, remaining: 0 };
		}

		recent.push(now);
		await this.ctx.storage.put(key, recent);
		return { allowed: true, remaining: MAX_REQUESTS - recent.length };
	}
}
