import { eq } from 'drizzle-orm';
import { db, schema } from '../db';

// Intl lists only region zones, so UTC, the users table's default, is added.
export const timeZones = [
	'UTC',
	...Intl.supportedValuesOf('timeZone').filter((zone) => zone !== 'UTC')
];

/** The zone a person's local time and digests are written in. */
export async function timezoneOf(env: Env, userId: string): Promise<string> {
	const row = await db(env)
		.select({ timezone: schema.users.timezone })
		.from(schema.users)
		.where(eq(schema.users.id, userId))
		.get();
	return row!.timezone;
}
