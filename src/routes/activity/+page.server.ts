import { requireMember } from '#lib/server/auth/guard.js';
import { listActivity } from '#lib/server/notifications/activity.js';
import { getEnv } from '#lib/server/platform.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const who = requireMember(event);
	return { entries: await listActivity(getEnv(), who) };
};
