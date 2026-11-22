import { sql } from 'drizzle-orm';
import { db, schema } from '../db';

const windowMs = 15 * 60 * 1000;

/**
 * Records an attempt under `key` unless `limit` attempts already fall inside the 15-minute
 * window. One statement counts and inserts, so a burst of concurrent requests can't all get
 * under the limit. Returns the attempt's id, or null when the limit is reached.
 */
export async function recordUnderLimit(
	env: Env,
	key: string,
	limit: number,
	now: number
): Promise<number | null> {
	const { signInAttempts } = schema;
	const [attempt] = await db(env).all<{ id: number }>(sql`
		INSERT INTO ${signInAttempts} (key, created_at)
		SELECT ${key}, ${now}
		WHERE (
			SELECT count(*) FROM ${signInAttempts}
			WHERE key = ${key} AND created_at > ${now - windowMs}
		) < ${limit}
		RETURNING rowid AS id`);
	return attempt?.id ?? null;
}
