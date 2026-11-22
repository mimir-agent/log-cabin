import { json } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { loadNote } from '#lib/server/notes/access.js';
import type { RequestHandler } from './$types';

/** What a link to the note shows on hover, to anyone who can open the note; 404 for the rest. */
export const GET: RequestHandler = async (event) => {
	const who = requireMember(event);
	const note = await loadNote(getEnv(), who, event.params.id);
	return json({
		title: note.title,
		authorName: note.authorName,
		updatedAt: note.updatedAt,
		thumbnailVersion: note.thumbnailVersion
	});
};
