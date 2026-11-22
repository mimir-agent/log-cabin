import { error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { youtubeThumbnail } from '#lib/server/link-previews.js';
import { core } from '#lib/strings/core.js';
import type { RequestHandler } from './$types';

/** A YouTube video's thumbnail, passed on so the page loads nothing from YouTube itself. */
export const GET: RequestHandler = async (event) => {
	requireMember(event);
	const thumbnail = await youtubeThumbnail(event.params.videoId);
	if (!thumbnail) error(404, core.errors.notFound);
	return new Response(thumbnail.body, {
		headers: {
			'content-type': 'image/jpeg',
			'x-content-type-options': 'nosniff',
			'cache-control': 'private, max-age=86400'
		}
	});
};
