import { getEnv } from '#lib/server/platform.js';
import { error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { getObject } from '#lib/server/storage.js';
import { core } from '#lib/strings/core.js';
import type { RequestHandler } from './$types';

// Avatars, cover photos, the org logo and the org's custom emoji are visible to every
// signed-in member. Other prefixes belong to modules that check access to their own files.
const memberVisible = ['avatars/', 'covers/', 'org/', 'emoji/'];

export const GET: RequestHandler = async (event) => {
	requireMember(event);
	const { key } = event.params;
	if (!memberVisible.some((prefix) => key.startsWith(prefix))) error(404, core.errors.notFound);
	const object = await getObject(getEnv(), key);
	if (!object) error(404, core.errors.notFound);
	return new Response(object.body, {
		headers: {
			'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
			'cache-control': 'private, max-age=3600',
			'x-content-type-options': 'nosniff'
		}
	});
};
