import { getEnv } from '#lib/server/platform.js';
import { calcomMissing, calcomOn } from '#lib/server/calcom/calcom.js';
import { hasRole } from '#lib/roles.js';
import type { LayoutServerLoad } from './$types';

// What the settings tabs need to know: whether this person has a Cal.com page to go to.
// Each page still checks its own access.
export const load: LayoutServerLoad = async ({ locals }) => {
	const { member } = locals;
	if (!member || !hasRole(member.role, 'member')) return { calcomTab: false };
	const env = getEnv();
	return { calcomTab: !calcomMissing(env) && (await calcomOn(env)) };
};
