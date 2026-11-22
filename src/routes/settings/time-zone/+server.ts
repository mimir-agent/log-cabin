import { error } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { requireMember } from '#lib/server/auth/guard.js';
import { db, schema } from '#lib/server/db/index.js';
import { timeZones } from '#lib/server/people/time-zone.js';
import { getEnv } from '#lib/server/platform.js';
import { canonicalZone, zoneOf } from '#lib/time-zone.js';
import type { RequestHandler } from './$types';

/**
 * The browser's zone moved from `from` to `to`: save `to` for a member who follows their
 * browser (the rule is zoneToFollow's), and leave a zone they chose in settings alone.
 */
export const POST: RequestHandler = async (event) => {
	const { user } = requireMember(event);
	const { from, to } = (await event.request.json()) as { from: string; to: string };
	// Saved under the list's name, which may be an alias of the browser's.
	const zone = zoneOf(to) === to ? canonicalZone(to) : undefined;
	if (!zone || !timeZones.includes(zone)) {
		error(400, `Expected a time zone from the settings list, got ${JSON.stringify(to)}.`);
	}
	const { users } = schema;
	await db(getEnv())
		.update(users)
		.set({ timezone: zone })
		.where(and(eq(users.id, user.id), inArray(users.timezone, ['UTC', canonicalZone(from)])));
	return new Response(null, { status: 204 });
};
