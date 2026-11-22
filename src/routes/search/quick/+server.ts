import { json } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { getEnv } from '#lib/server/platform.js';
import { search } from '#lib/server/search/search.js';
import type { RequestHandler } from './$types';

/** The quick switcher's lists for what has been typed so far. */
export const GET: RequestHandler = async (event) => {
	const who = requireMember(event);
	const env = getEnv();
	const q = event.url.searchParams.get('q') ?? '';
	const [projects, hits] = await Promise.all([
		search(env, who, q, { kind: 'project', limit: 5 }),
		search(env, who, q, { limit: 8 })
	]);
	return json({ projects, hits: hits.filter((hit) => hit.kind !== 'project') });
};
