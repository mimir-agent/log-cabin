import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { readAttachment } from '#lib/server/posts/attachments.js';
import type { RequestHandler } from './$types';

const inlineTypes = /^(image|video|audio)\/|^application\/pdf$/;

// RFC 5987 leaves ' ( ) * out of attr-char, and encodeURIComponent keeps them.
function filenameStar(name: string): string {
	return encodeURIComponent(name).replace(
		/['()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
	);
}

export const GET: RequestHandler = async (event) => {
	const who = requireMember(event);
	const { row, object } = await readAttachment(getEnv(), who, event.params.id);
	return new Response(object.body, {
		headers: {
			'content-type': row.contentType,
			'content-length': String(row.size),
			'x-content-type-options': 'nosniff',
			'content-security-policy': 'sandbox',
			'cache-control': 'private, max-age=3600',
			'content-disposition': inlineTypes.test(row.contentType)
				? 'inline'
				: `attachment; filename*=UTF-8''${filenameStar(row.name)}`
		}
	});
};
