import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { SignedIn } from '../auth/session';
import { docAttachments } from '../../editor/doc';
import { posts as strings } from '../../strings/posts';
import { createComment, type CanvasPin } from './comments';
import type { BodyInput, LoadedPost } from './posts';

/**
 * Comments on a point of one of the post's images. Whoever may comment on the post may pin
 * one, and whoever can see the post sees it, as with any comment; replies are plain replies.
 */
export async function pinComment(
	env: Env,
	who: SignedIn,
	post: LoadedPost,
	pin: CanvasPin,
	input: BodyInput
) {
	const inRange = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;
	if (!inRange(pin.x) || !inRange(pin.y)) error(400, strings.errors.pinOutside);
	const { attachments } = schema;
	const image = await db(env)
		.select({ contentType: attachments.contentType })
		.from(attachments)
		.where(and(eq(attachments.id, pin.attachmentId), eq(attachments.projectId, post.projectId)))
		.get();
	const inPost = docAttachments(JSON.parse(post.body)).includes(pin.attachmentId);
	if (!image || !inPost || !image.contentType.startsWith('image/')) {
		error(400, strings.errors.pinNotAnImage);
	}
	return createComment(env, who, post, { ...input, ...pin }, null);
}
