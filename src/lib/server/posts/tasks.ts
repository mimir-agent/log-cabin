import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { publish } from '../realtime/publish';
import { DocError, setTaskChecked, type DocNode } from '../../editor/doc';
import { posts as strings } from '../../strings/posts';
import type { SignedIn } from '../auth/session';
import { canWriteInProject } from './access';
import type { LoadedPost } from './posts';

export type Tick = { subject: 'post' | 'comment'; id: string; index: number; checked: boolean };

/** Reads a tick from a form, or says what is wrong with it. */
export function parseTick(form: Record<string, string>): Tick | { message: string } {
	const index = Number(form.index);
	const subject = form.subject;
	if ((subject !== 'post' && subject !== 'comment') || !Number.isInteger(index) || index < 0) {
		return { message: strings.errors.tickInvalid };
	}
	return { subject, id: form.id, index, checked: form.checked === 'true' };
}

/** The body with one task ticked, as JSON, 400ing when the index points past its tasks. */
export function tickedBody(body: string, index: number, checked: boolean): string {
	try {
		return JSON.stringify(setTaskChecked(JSON.parse(body) as DocNode, index, checked));
	} catch (e) {
		if (e instanceof DocError) error(400, strings.errors.taskNotFound);
		throw e;
	}
}

/**
 * Ticks or clears a task in a post or one of its comments, 403ing for anyone who may not post or
 * comment there (viewers, archived projects). A tick doesn't mark the post edited.
 */
export async function tickTask(env: Env, who: SignedIn, post: LoadedPost, tick: Tick) {
	if (!canWriteInProject(who.member, post.project)) error(403, strings.errors.cannotWrite);
	const { posts, comments } = schema;
	if (tick.subject === 'post') {
		await db(env)
			.update(posts)
			.set({ body: tickedBody(post.body, tick.index, tick.checked) })
			.where(eq(posts.id, post.id));
	} else {
		const where = and(eq(comments.id, tick.id), eq(comments.postId, post.id));
		const comment = await db(env).select({ body: comments.body }).from(comments).where(where).get();
		if (!comment) error(404, strings.errors.commentNotFound);
		await db(env)
			.update(comments)
			.set({ body: tickedBody(comment.body, tick.index, tick.checked) })
			.where(where);
	}
	await publish(env, `post:${post.id}`, { type: 'task.ticked', postId: post.id });
}
