import { json } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { getEnv } from '#lib/server/platform.js';
import { findResources } from '#lib/server/search/resources.js';
import type { RequestHandler } from './$types';

/** The notes, posts and calls a note's @ list offers for what has been typed after @. */
export const GET: RequestHandler = async (event) => {
	const who = requireMember(event);
	const q = event.url.searchParams.get('q') ?? '';
	return json({ items: await findResources(getEnv(), who, q) });
};
