import { requireMember } from '#lib/server/auth/guard.js';
import type { PageServerLoad } from './$types';

// The phone's home screen. Everything it lists comes from the layout's load.
export const load: PageServerLoad = async (event) => {
	requireMember(event);
	return {};
};
