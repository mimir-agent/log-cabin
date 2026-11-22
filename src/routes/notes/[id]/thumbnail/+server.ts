import { error } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { loadNote } from '#lib/server/notes/access.js';
import { thumbnailResponse } from '#lib/server/notes/thumbnails.js';
import { core } from '#lib/strings/core.js';
import type { RequestHandler } from './$types';

/** The note's thumbnail (?size=og or grid), to anyone who can open the note. */
export const GET: RequestHandler = async (event) => {
	const who = requireMember(event);
	const size = (['og', 'grid'] as const).find((s) => s === event.url.searchParams.get('size'));
	if (!size) error(404, core.errors.notFound);
	const env = getEnv();
	const note = await loadNote(env, who, event.params.id);
	return thumbnailResponse(env, note, size, 'private, max-age=300');
};
