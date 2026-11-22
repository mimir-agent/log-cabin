import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { listDrafts } from '#lib/server/posts/drafts.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const who = requireMember(event);
	return { drafts: await listDrafts(getEnv(), who) };
};
