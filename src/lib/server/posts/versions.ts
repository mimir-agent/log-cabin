import { error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import type { SignedIn } from '../auth/session';
import { posts as strings } from '../../strings/posts';
import { loadPoll } from './polls';
import { createPost, type LoadedPost } from './posts';

// Post versions (as in Campsite's post_versions_controller.rb): a new version is a new
// post linked to the one before it. Every version keeps its own comments, and anyone who can
// see the project can read every version, because they all live in it.

export type PostVersion = { id: string; version: number; title: string; createdAt: number };

/** Every version in the post's chain, oldest first. */
export async function listVersions(env: Env, postId: string): Promise<PostVersion[]> {
	return db(env).all<PostVersion>(sql`
		WITH RECURSIVE
			up(id, parent_id) AS (
				SELECT id, parent_id FROM posts WHERE id = ${postId}
				UNION ALL SELECT p.id, p.parent_id FROM posts p JOIN up ON p.id = up.parent_id
			),
			down(id) AS (
				SELECT id FROM up WHERE parent_id IS NULL
				UNION ALL SELECT p.id FROM posts p JOIN down ON p.parent_id = down.id
			)
		SELECT posts.id, posts.version, posts.title, posts.created_at AS createdAt
		FROM posts JOIN down ON down.id = posts.id
		ORDER BY posts.version`);
}

/**
 * Starts the next version of the latest one: its title, body and poll options (without
 * votes) copied, as Campsite's create does. Only the author may (`create_version?`), and only
 * from the latest version, so a chain never forks.
 */
export async function createVersion(env: Env, who: SignedIn, post: LoadedPost) {
	if (post.authorId !== who.user.id) error(403, strings.errors.notYourPost);
	const versions = await listVersions(env, post.id);
	if (versions.at(-1)?.id !== post.id) error(409, strings.errors.notLatestVersion);
	const poll = await loadPoll(env, who.user.id, post.id);
	return createPost(env, who, post.projectId, {
		title: post.title,
		body: post.body,
		bodyText: post.bodyText,
		// The people named were told when the first version went out.
		mentions: [],
		poll: poll && {
			question: poll.question,
			options: poll.options.map(({ description }) => ({ description }))
		},
		parentId: post.id,
		version: post.version + 1
	});
}
