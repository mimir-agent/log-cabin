import { error } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { setFavorite } from '#lib/server/favorites.js';
import { chat } from '#lib/strings/chat.js';
import type { RequestHandler } from './$types';

/** Favorites or unfavorites a note or thread: subjectType, subjectId, favorite ("true" or not). */
export const POST: RequestHandler = async (event) => {
	const who = requireMember(event);
	const form = await event.request.formData();
	const type = String(form.get('subjectType'));
	if (type !== 'note' && type !== 'thread') error(400, chat.errors.favoriteSubjectInvalid(type));
	const subject = { type, id: String(form.get('subjectId')) } as const;
	await setFavorite(getEnv(), who, subject, form.get('favorite') === 'true');
	return new Response(null, { status: 204 });
};
