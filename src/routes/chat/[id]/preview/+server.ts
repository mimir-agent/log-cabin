import { json } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { threadPreview } from '#lib/server/chat/messages.js';
import { getEnv } from '#lib/server/platform.js';
import type { RequestHandler } from './$types';

/** The hover preview of a thread in the list: its name and last few messages. */
export const GET: RequestHandler = async (event) => {
	const who = requireMember(event);
	return json(await threadPreview(getEnv(), who, event.params.id), {
		headers: { 'cache-control': 'no-store' }
	});
};
