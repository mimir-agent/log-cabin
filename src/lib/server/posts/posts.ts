import { error } from '@sveltejs/kit';
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { newId } from '../id';
import { emit } from '../events';
import { publish } from '../realtime/publish';
import { deleteWithNotifications } from '../notifications/notify';
import type { SignedIn } from '../auth/session';
import { DocError, docMentions, docText, isEmptyDoc, sanitizeDoc } from '../../editor/doc';
import { maxPostTags, textTags } from '../../editor/inline';
import { posts as strings } from '../../strings/posts';
import { getObjectUrl } from '../storage';
import { canSeeProject, loadProject, loadWritableProject, visibleProjectIds } from './access';
import { saveTags } from './tags';
import { parsePoll, savePoll, type PollInput } from './polls';
import { publishNoteTimeline, recordNoteReferences } from '../notes/timeline';

export type BodyInput = { body: string; bodyText: string; mentions: string[] };

/** Sanitizes an editor body from a form, or says what is wrong with it. */
export function parseBody(raw: FormDataEntryValue | undefined): BodyInput | { message: string } {
	try {
		const doc = sanitizeDoc(String(raw ?? ''));
		if (isEmptyDoc(doc)) return { message: strings.errors.bodyMissing };
		return { body: JSON.stringify(doc), bodyText: docText(doc), mentions: docMentions(doc) };
	} catch (e) {
		if (e instanceof DocError) return { message: strings.errors.bodyInvalid(e.message) };
		throw e;
	}
}

export type PostInput = BodyInput & { title: string; poll: PollInput | null };

export function validatePostInput(
	form: Record<string, FormDataEntryValue>
): { ok: true; input: PostInput } | { ok: false; message: string } {
	const title = String(form.title ?? '').trim();
	if (!title) return { ok: false, message: strings.errors.titleMissing };
	if (title.length > 200) return { ok: false, message: strings.errors.titleTooLong };
	const body = parseBody(form.body);
	if ('message' in body) return { ok: false, message: body.message };
	if (textTags(body.bodyText).length > maxPostTags) {
		return { ok: false, message: strings.errors.tooManyTags(maxPostTags) };
	}
	const poll = parsePoll(form.poll);
	if (poll && 'message' in poll) return { ok: false, message: poll.message };
	return { ok: true, input: { title, ...body, poll } };
}

/** Emits a mention for each person named who can see the project, other than the author. */
export async function emitMentions(
	env: Env,
	project: { id: string; private: boolean },
	mentioned: string[],
	subject: { type: 'post' | 'comment'; id: string },
	authorId: string
) {
	const ids = mentioned.filter((id) => id !== authorId);
	if (ids.length === 0) return;
	const { members, projectMembers } = schema;
	const people = await db(env)
		.select({
			userId: members.userId,
			role: members.role,
			isMember: sql<number>`${projectMembers.userId} IS NOT NULL`
		})
		.from(members)
		.leftJoin(
			projectMembers,
			and(eq(projectMembers.userId, members.userId), eq(projectMembers.projectId, project.id))
		)
		.where(and(inArray(members.userId, ids), isNull(members.deactivatedAt)));
	for (const person of people) {
		const view = { private: project.private, archivedAt: null, isMember: !!person.isMember };
		if (!canSeeProject(person, view)) continue;
		await emit(env, {
			kind: 'mention',
			subjectType: subject.type,
			subjectId: subject.id,
			mentionedUserId: person.userId,
			authorId
		});
	}
}

/** Posts made outside the composer, by other modules, have no poll; a version names its parent. */
export async function createPost(
	env: Env,
	who: SignedIn,
	projectId: string,
	input: BodyInput & {
		title: string;
		poll?: PollInput | null;
		parentId?: string;
		/** The message it was started from (Start a post…). */
		fromMessageId?: string;
		version?: number;
	},
	now = Date.now()
) {
	const project = await loadWritableProject(env, who, projectId);
	const id = newId(now);
	const { mentions, poll, ...fields } = input;
	await db(env)
		.insert(schema.posts)
		.values({
			id,
			projectId,
			authorId: who.user.id,
			...fields,
			createdAt: now,
			lastActivityAt: now
		});
	if (poll) await savePoll(env, id, poll);
	await saveTags(env, id, fields.bodyText);
	const referenced = await recordNoteReferences(
		env,
		who.user.id,
		{ type: 'post', id },
		JSON.parse(fields.body),
		now
	);
	for (const noteId of referenced) await publishNoteTimeline(env, noteId);
	await emit(env, { kind: 'post.created', postId: id, projectId, authorId: who.user.id });
	await emitMentions(env, project, mentions, { type: 'post', id }, who.user.id);
	await publish(env, `project:${projectId}`, { type: 'post.created', postId: id });
	return id;
}

/** A post and its project, 404ing when this member can't see it. */
export async function loadPost(env: Env, who: SignedIn, postId: string) {
	const { posts, users } = schema;
	const row = await db(env)
		.select({ post: posts, authorName: users.name, authorAvatarKey: users.avatarKey })
		.from(posts)
		.innerJoin(users, eq(users.id, posts.authorId))
		.where(eq(posts.id, postId))
		.get();
	if (!row) error(404, strings.errors.postNotFound);
	const project = await loadProject(env, who, row.post.projectId);
	return {
		...row.post,
		authorName: row.authorName,
		authorAvatarUrl: row.authorAvatarKey ? getObjectUrl(row.authorAvatarKey) : null,
		project
	};
}

export type LoadedPost = Awaited<ReturnType<typeof loadPost>>;

export async function updatePost(env: Env, who: SignedIn, post: LoadedPost, input: PostInput) {
	if (post.authorId !== who.user.id) error(403, strings.errors.notYourPost);
	await loadWritableProject(env, who, post.projectId);
	const { mentions, poll, ...fields } = input;
	await db(env)
		.update(schema.posts)
		.set({ ...fields, editedAt: Date.now() })
		.where(eq(schema.posts.id, post.id));
	await savePoll(env, post.id, poll);
	await saveTags(env, post.id, fields.bodyText);
	const ref = { type: 'post', id: post.id } as const;
	const referenced = await recordNoteReferences(env, who.user.id, ref, JSON.parse(fields.body));
	for (const noteId of referenced) await publishNoteTimeline(env, noteId);
	const before = new Set(docMentions(JSON.parse(post.body)));
	const added = mentions.filter((id) => !before.has(id));
	await emitMentions(env, post.project, added, { type: 'post', id: post.id }, who.user.id);
	await emit(env, {
		kind: 'post.updated',
		postId: post.id,
		projectId: post.projectId,
		authorId: who.user.id
	});
	await publish(env, `post:${post.id}`, { type: 'post.updated', postId: post.id });
}

/** Authors delete their own posts; admins delete any. */
export async function deletePost(env: Env, who: SignedIn, post: LoadedPost) {
	if (post.authorId !== who.user.id && who.member.role !== 'admin') {
		error(403, strings.errors.notYourPost);
	}
	await deleteWithNotifications(
		env,
		{ post: post.id },
		db(env).delete(schema.posts).where(eq(schema.posts.id, post.id))
	);
	await publish(env, `project:${post.projectId}`, { type: 'post.deleted', postId: post.id });
	await publish(env, `post:${post.id}`, { type: 'post.deleted', postId: post.id });
}

/**
 * Marks a post resolved, optionally by one of its comments and with a written resolution (a
 * document as `parseResolution` leaves it). The author or an admin may. Its followers are told.
 */
export async function resolvePost(
	env: Env,
	who: SignedIn,
	post: LoadedPost,
	commentId: string | null,
	resolution: string | null,
	now = Date.now()
) {
	if (post.authorId !== who.user.id && who.member.role !== 'admin') {
		error(403, strings.errors.notYourPost);
	}
	await loadWritableProject(env, who, post.projectId);
	if (commentId) {
		const comment = await db(env)
			.select({ id: schema.comments.id })
			.from(schema.comments)
			.where(and(eq(schema.comments.id, commentId), eq(schema.comments.postId, post.id)))
			.get();
		if (!comment) error(400, strings.errors.commentNotFound);
	}
	const changed = await db(env)
		.update(schema.posts)
		.set({
			resolvedAt: now,
			resolvedBy: who.user.id,
			resolvedCommentId: commentId,
			resolvedBody: resolution
		})
		.where(and(eq(schema.posts.id, post.id), isNull(schema.posts.resolvedAt)))
		.returning({ id: schema.posts.id });
	if (changed.length === 0) return;
	await emit(env, {
		kind: 'post.resolved',
		postId: post.id,
		commentId,
		resolvedBy: who.user.id,
		resolvedAt: now
	});
	await publish(env, `post:${post.id}`, { type: 'post.resolved', postId: post.id });
}

/** The resolution a form sent, sanitized: null when nothing was written, or what is wrong with it. */
export function parseResolution(
	raw: FormDataEntryValue | undefined
): { resolution: string | null } | { message: string } {
	try {
		if (raw === undefined) return { resolution: null };
		const doc = sanitizeDoc(String(raw));
		return { resolution: isEmptyDoc(doc) ? null : JSON.stringify(doc) };
	} catch (e) {
		if (e instanceof DocError) return { message: strings.errors.bodyInvalid(e.message) };
		throw e;
	}
}

export async function unresolvePost(env: Env, who: SignedIn, post: LoadedPost) {
	if (post.authorId !== who.user.id && who.member.role !== 'admin') {
		error(403, strings.errors.notYourPost);
	}
	await db(env)
		.update(schema.posts)
		.set({ resolvedAt: null, resolvedBy: null, resolvedCommentId: null, resolvedBody: null })
		.where(eq(schema.posts.id, post.id));
	await publish(env, `post:${post.id}`, { type: 'post.resolved', postId: post.id });
}

const pageSize = 20;

/** Encodes the last row of a page; the next page starts after it. */
function cursorOf(row: { lastActivityAt: number; id: string }): string {
	return `${row.lastActivityAt}.${row.id}`;
}

function afterCursor(cursor: string) {
	const [at, id] = cursor.split('.');
	const lastActivityAt = Number(at);
	if (!Number.isInteger(lastActivityAt) || !id) error(400, strings.errors.badCursor);
	const { posts } = schema;
	return or(
		lt(posts.lastActivityAt, lastActivityAt),
		and(eq(posts.lastActivityAt, lastActivityAt), lt(posts.id, id))
	);
}

/**
 * Posts newest activity first. With projectId, one project's posts (archived or not);
 * without, every open project this member can see. With tag, only posts carrying it.
 */
export async function feed(
	env: Env,
	who: SignedIn,
	{ projectId, tag, cursor }: { projectId?: string; tag?: string; cursor?: string | null }
) {
	const { posts, projects, users, comments, postTags } = schema;
	const rows = await db(env)
		.select({
			id: posts.id,
			title: posts.title,
			bodyText: posts.bodyText,
			createdAt: posts.createdAt,
			editedAt: posts.editedAt,
			lastActivityAt: posts.lastActivityAt,
			resolvedAt: posts.resolvedAt,
			authorName: users.name,
			authorAvatarKey: users.avatarKey,
			projectId: projects.id,
			projectName: projects.name,
			commentCount: sql<number>`(SELECT count(*) FROM ${comments} WHERE ${comments.postId} = ${posts.id})`
		})
		.from(posts)
		.innerJoin(projects, eq(projects.id, posts.projectId))
		.innerJoin(users, eq(users.id, posts.authorId))
		.where(
			and(
				visibleProjectIds(who),
				projectId ? eq(posts.projectId, projectId) : isNull(projects.archivedAt),
				// Only the latest version of each post.
				sql`NOT EXISTS (SELECT 1 FROM ${posts} AS newer WHERE newer.parent_id = ${posts.id})`,
				tag
					? sql`${posts.id} IN (SELECT ${postTags.postId} FROM ${postTags} WHERE ${postTags.tag} = ${tag})`
					: undefined,
				cursor ? afterCursor(cursor) : undefined
			)
		)
		.orderBy(desc(posts.lastActivityAt), desc(posts.id))
		.limit(pageSize + 1);
	const items = rows.slice(0, pageSize).map(({ authorAvatarKey, ...item }) => ({
		...item,
		authorAvatarUrl: authorAvatarKey ? getObjectUrl(authorAvatarKey) : null
	}));
	const next = rows.length > pageSize ? cursorOf(items[items.length - 1]) : null;
	return { items, next };
}
