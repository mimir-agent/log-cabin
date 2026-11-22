import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db, schema } from '../db';
import { emit } from '../events';
import { newId } from '../id';
import { publish } from '../realtime/publish';
import type { SignedIn } from '../auth/session';
import { docAttachments } from '../../editor/doc';
import { posts as strings } from '../../strings/posts';
import { canSeeProjectById, loadWritableProject, visibleProjectIds } from './access';
import type { LoadedPost } from './posts';
import { listVersions } from './versions';

/** The post's author or an admin may move it. */
export function canMovePost(who: SignedIn, post: { authorId: string }) {
	return post.authorId === who.user.id || who.member.role === 'admin';
}

/**
 * Moves a post, with every version of it and their comments, to another project its author or
 * an admin can post in. Every version lives in its post's project, so none is left behind for
 * the old project to read. The files in the versions and their comments move with them, so
 * whoever can read the post in its new project can open them; their pins in the old project are
 * dropped.
 */
export async function movePost(
	env: Env,
	who: SignedIn,
	post: LoadedPost,
	toProjectId: string,
	now = Date.now()
) {
	if (!canMovePost(who, post)) error(403, strings.errors.notYourPost);
	if (toProjectId === post.projectId) error(400, strings.errors.moveSameProject);
	await loadWritableProject(env, who, toProjectId);

	const { posts, comments, attachments, projectPins, postMoves } = schema;
	const ids = (await listVersions(env, post.id)).map((v) => v.id);
	const versions = await db(env)
		.select({ body: posts.body })
		.from(posts)
		.where(inArray(posts.id, ids));
	const replies = await db(env)
		.select({ body: comments.body })
		.from(comments)
		.where(inArray(comments.postId, ids));
	const files = [...versions, ...replies].flatMap((b) => docAttachments(JSON.parse(b.body)));
	await db(env).batch([
		db(env).update(posts).set({ projectId: toProjectId }).where(inArray(posts.id, ids)),
		db(env)
			.update(attachments)
			.set({ projectId: toProjectId })
			.where(and(inArray(attachments.id, files), eq(attachments.projectId, post.projectId))),
		db(env)
			.delete(projectPins)
			.where(and(eq(projectPins.subjectType, 'post'), inArray(projectPins.subjectId, ids))),
		db(env)
			.insert(postMoves)
			.values(
				ids.map((postId) => ({
					id: newId(now),
					postId,
					movedBy: who.user.id,
					fromProjectId: post.projectId,
					toProjectId,
					createdAt: now
				}))
			)
	]);
	const latest = ids.at(-1)!;
	await emit(env, { kind: 'post.moved', postId: latest, toProjectId, movedBy: who.user.id });
	await publish(env, `project:${post.projectId}`, { type: 'post.deleted', postId: latest });
	await publish(env, `project:${toProjectId}`, { type: 'post.created', postId: latest });
	for (const postId of ids) await publish(env, `post:${postId}`, { type: 'post.moved', postId });
}

/** The open projects, other than the post's own, this member can move a post to. */
export async function moveTargets(env: Env, who: SignedIn, post: LoadedPost) {
	if (who.member.role === 'viewer') return [];
	const { projects } = schema;
	return db(env)
		.select({ id: projects.id, name: projects.name })
		.from(projects)
		.where(
			and(visibleProjectIds(who), isNull(projects.archivedAt), ne(projects.id, post.projectId))
		)
		.orderBy(asc(projects.name));
}

export type PostMove = { by: string; from: string | null; to: string | null; at: number };

/**
 * The post's moves, oldest first. A project this member can't see, or one since deleted,
 * comes back as null, so its name never reaches them.
 */
export async function visiblePostMoves(
	env: Env,
	who: SignedIn,
	postId: string
): Promise<PostMove[]> {
	const { postMoves, projects, users } = schema;
	const rows = await db(env)
		.select({
			by: users.name,
			fromId: postMoves.fromProjectId,
			toId: postMoves.toProjectId,
			at: postMoves.createdAt
		})
		.from(postMoves)
		.innerJoin(users, eq(users.id, postMoves.movedBy))
		.where(eq(postMoves.postId, postId))
		.orderBy(asc(postMoves.createdAt));
	const ids = [...new Set(rows.flatMap((r) => [r.fromId, r.toId]).filter((id) => id !== null))];
	const known = await db(env)
		.select({ id: projects.id, name: projects.name })
		.from(projects)
		.where(inArray(projects.id, ids));
	const names = new Map<string, string>();
	for (const p of known) {
		if (await canSeeProjectById(env, who.member, who.user.id, p.id)) names.set(p.id, p.name);
	}
	const name = (id: string | null) => (id === null ? null : (names.get(id) ?? null));
	return rows.map((r) => ({ by: r.by, from: name(r.fromId), to: name(r.toId), at: r.at }));
}
