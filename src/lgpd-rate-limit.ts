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
			await this.scheduleCleanup();
			return { allowed: false, remaining: 0 };
		}

		recent.push(now);
		await this.ctx.storage.put(key, recent);
		await this.scheduleCleanup();
		return { allowed: true, remaining: MAX_REQUESTS - recent.length };
	}

	// Ensure a cleanup alarm is pending. Without it, each distinct IP/UA leaves
	// a bucket in storage that is never reclaimed — an attacker rotating IPs
	// grows DO storage (and cost) without bound.
	private async scheduleCleanup(): Promise<void> {
		const existing = await this.ctx.storage.getAlarm();
		if (existing === null) {
			await this.ctx.storage.setAlarm(Date.now() + WINDOW_MS);
		}
	}

	async alarm(): Promise<void> {
		const now = Date.now();
		const all = await this.ctx.storage.list<number[]>();
		let remaining = 0;
		for (const [key, timestamps] of all) {
			const recent = timestamps.filter((ts) => now - ts < WINDOW_MS);
			if (recent.length === 0) {
				await this.ctx.storage.delete(key);
			} else {
				await this.ctx.storage.put(key, recent);
				remaining++;
			}
		}
		// Reschedule while any buckets remain so they're eventually reclaimed.
		if (remaining > 0) {
			await this.ctx.storage.setAlarm(now + WINDOW_MS);
		}
	}
}
