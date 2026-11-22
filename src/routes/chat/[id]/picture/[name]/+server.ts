import { error } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { threadPictureKey } from '#lib/server/chat/threads.js';
import { getObject } from '#lib/server/storage.js';
import { core } from '#lib/strings/core.js';
import type { RequestHandler } from './$types';

/** A group's picture, to its members. A new picture gets a new name, so this one never changes. */
export const GET: RequestHandler = async (event) => {
	const env = getEnv();
	const who = requireMember(event);
	const key = await threadPictureKey(env, who, event.params.id, event.params.name);
	const object = await getObject(env, key);
	if (!object) error(404, core.errors.notFound);
	return new Response(object.body, {
		headers: {
			'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
			'cache-control': 'private, max-age=31536000, immutable',
			'x-content-type-options': 'nosniff'
		}
	});
};
