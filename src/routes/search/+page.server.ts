import { requireMember } from '#lib/server/auth/guard.js';
import { getEnv } from '#lib/server/platform.js';
import { search, searchCorrecting } from '#lib/server/search/search.js';
import { searchKinds } from '#lib/search.js';
import type { PageServerLoad } from './$types';

/** Searches what was typed; with `exact` set, as typed, without correcting misspellings. */
export const load: PageServerLoad = async (event) => {
	const who = requireMember(event);
	const params = event.url.searchParams;
	const q = params.get('q') ?? '';
	const asked = params.get('kind');
	const kind = searchKinds.find((k) => k === asked);
	const options = { kind, limit: 50 };
	const { hits, correction } = params.has('exact')
		? { hits: await search(getEnv(), who, q, options), correction: null }
		: await searchCorrecting(getEnv(), who, q, options);
	return { q, kind: kind ?? null, hits, correction };
};
