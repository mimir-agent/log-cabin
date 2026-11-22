import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { db, schema } from '../db';
import { seenThrottleMs } from '../../people/seen';

/**
 * Records that the person did something at `now`: a signed-in request, or a live connection
 * opening, sending or closing. Writes at most once a minute per person; `lastSeenAt`, when the
 * caller already knows it, saves the query entirely.
 */
export async function touchLastSeen(
	env: Env,
	userId: string,
	now: number,
	lastSeenAt?: number | null
): Promise<void> {
	if (lastSeenAt != null && now - lastSeenAt < seenThrottleMs) return;
	const { users } = schema;
	await db(env)
		.update(users)
		.set({ lastSeenAt: now })
		.where(
			and(
				eq(users.id, userId),
				or(isNull(users.lastSeenAt), lte(users.lastSeenAt, now - seenThrottleMs))
			)
		);
}
