import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { newId } from '../id';
import type { PushTarget } from '../push/webpush';

/** Stores a browser's push subscription for a person; the same endpoint again moves it to them. */
export async function saveSubscription(
	env: Env,
	userId: string,
	target: PushTarget,
	now = Date.now()
): Promise<void> {
	const { pushSubscriptions } = schema;
	await db(env)
		.insert(pushSubscriptions)
		.values({ id: newId(now), userId, ...target, createdAt: now })
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: { userId, p256dh: target.p256dh, auth: target.auth }
		});
}

export async function deleteSubscription(
	env: Env,
	userId: string,
	endpoint: string
): Promise<void> {
	const { pushSubscriptions } = schema;
	await db(env)
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

/** The body PushSubscription.toJSON() produces, or null when it isn't one. */
export function parseSubscription(body: unknown): PushTarget | null {
	const value = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
	const endpoint = value?.endpoint;
	const p256dh = value?.keys?.p256dh;
	const auth = value?.keys?.auth;
	if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) return null;
	if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
	return { endpoint, p256dh, auth };
}
