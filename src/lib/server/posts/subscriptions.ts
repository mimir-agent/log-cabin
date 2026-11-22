import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { SignedIn } from '../auth/session';
import type { LoadedPost } from './posts';

export async function isSubscribed(env: Env, who: SignedIn, post: LoadedPost): Promise<boolean> {
	const { postSubscriptions: s } = schema;
	const row = await db(env)
		.select({ userId: s.userId })
		.from(s)
		.where(and(eq(s.postId, post.id), eq(s.userId, who.user.id)))
		.get();
	return row !== undefined;
}

/**
 * Subscribes the signed-in person to new comments on a post, or unsubscribes them. It's always
 * their own subscription, and the post is one loadPost let them see.
 */
export async function setSubscribed(
	env: Env,
	who: SignedIn,
	post: LoadedPost,
	subscribed: boolean,
	now = Date.now()
): Promise<void> {
	const { postSubscriptions: s } = schema;
	if (subscribed) {
		await db(env)
			.insert(s)
			.values({ postId: post.id, userId: who.user.id, createdAt: now })
			.onConflictDoNothing();
	} else {
		await db(env)
			.delete(s)
			.where(and(eq(s.postId, post.id), eq(s.userId, who.user.id)));
	}
}
