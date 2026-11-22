import { json } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { linkPreview } from '#lib/server/link-previews.js';
import { getEnv } from '#lib/server/platform.js';
import { postPreview } from '#lib/server/posts/post-preview.js';
import type { RequestHandler } from './$types';

/** A link's preview for the signed-in page showing it: { preview } with null for a plain link. */
export const GET: RequestHandler = async (event) => {
	const who = requireMember(event);
	const raw = event.url.searchParams.get('url') ?? '';
	// A link to one of our own posts is checked against this reader, every time.
	if (URL.canParse(raw) && new URL(raw).origin === event.url.origin) {
		const preview = await postPreview(getEnv(), who, new URL(raw));
		return json({ preview }, { headers: { 'cache-control': 'no-store' } });
	}
	const preview = await linkPreview(getEnv(), raw);
	return json({ preview }, { headers: { 'cache-control': 'private, max-age=3600' } });
};
