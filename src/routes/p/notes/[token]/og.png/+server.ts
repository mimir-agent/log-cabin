import { getEnv } from '#lib/server/platform.js';
import { loadPublicNote } from '#lib/server/notes/public.js';
import { thumbnailResponse } from '#lib/server/notes/thumbnails.js';
import type { RequestHandler } from './$types';

/** The link preview of the note published under this token, signed out, while its link works. */
export const GET: RequestHandler = async ({ params }) => {
	const env = getEnv();
	const note = await loadPublicNote(env, params.token);
	return thumbnailResponse(env, note, 'og', 'public, max-age=60');
};
