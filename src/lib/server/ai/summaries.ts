import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import type { SummarySubject } from '../db/schema';
import { getOrg, type Org } from '../org';
import type { LoadedPost } from '../posts/posts';
import type { LoadedNote } from '../notes/access';
import type { LoadedThread } from '../chat/threads';
import { ai as strings } from '../../strings/ai';
import {
	CHECK_INSTRUCTIONS,
	CHECK_MODEL,
	groundedSummary,
	SUMMARY_INSTRUCTIONS,
	SUMMARY_MODEL,
	type GroundedSummary,
	type SourceUnit
} from './grounded';

/** The AI binding is optional: a deployment without Workers AI leaves it out of wrangler.jsonc. */
export function aiConfigured(env: Env): boolean {
	return (env as Partial<Env>).AI !== undefined;
}

/** Summaries are offered when the deployment has Workers AI and an admin hasn't turned them off. */
export function summariesOn(env: Env, org: Pick<Org, 'aiEnabled'>): boolean {
	return org.aiEnabled && aiConfigured(env);
}

/** A discussion shorter than this, title and comments included, has nothing a summary would shorten. */
export const SUMMARY_MIN_WORDS = 120;

/** What a page shows: no Summarize button, the reason in place of the button, or a button that works. */
export type SummaryOffer = 'off' | 'tooShort' | 'on';

export function summaryOffer(
	env: Env,
	org: Pick<Org, 'aiEnabled'>,
	units: SourceUnit[]
): SummaryOffer {
	if (!summariesOn(env, org)) return 'off';
	const words = units.reduce((n, u) => n + u.text.split(/\s+/).filter(Boolean).length, 0);
	return words < SUMMARY_MIN_WORDS ? 'tooShort' : 'on';
}

type Entry = { id: string; parentId: string | null; authorName: string; text: string };

/**
 * The item's title and body, then each top-level comment followed by its replies, as the model
 * reads them. A comment's anchor is the id CommentThread gives it, so a citation can link to it.
 */
function discussionUnits(
	kind: 'post' | 'note',
	item: { authorName: string; title: string; text: string },
	comments: Entry[]
): SourceUnit[] {
	const thread = comments
		.filter((c) => c.parentId === null)
		.flatMap((c, i) => [
			{
				author: c.authorName,
				kind: strings.kinds.comment(i + 1),
				text: c.text,
				anchor: `comment-${c.id}`
			},
			...comments
				.filter((r) => r.parentId === c.id)
				.map((r) => ({
					author: r.authorName,
					kind: strings.kinds.reply(i + 1),
					text: r.text,
					anchor: `comment-${r.id}`
				}))
		]);
	return [
		{ author: item.authorName, kind: strings.kinds.title, text: item.title },
		{ author: item.authorName, kind: strings.kinds[kind], text: item.text },
		...thread
	];
}

async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Summarizes what the caller passed, reusing the stored summary while the model, its instructions
 * and the source are unchanged. Workers AI failures come back as a message to show; nothing retries them.
 */
async function summarize(
	env: Env,
	subject: { type: SummarySubject; id: string },
	units: SourceUnit[]
): Promise<{ summary: GroundedSummary } | { error: string }> {
	const offer = summaryOffer(env, await getOrg(env), units);
	if (offer === 'off') error(404, strings.errors.off);
	if (offer === 'tooShort') error(400, strings.summary.tooShort);
	const { aiSummaries } = schema;
	const contentHash = await sha256Hex(
		JSON.stringify([SUMMARY_MODEL, SUMMARY_INSTRUCTIONS, CHECK_MODEL, CHECK_INSTRUCTIONS, units])
	);
	const where = and(
		eq(aiSummaries.subjectType, subject.type),
		eq(aiSummaries.subjectId, subject.id)
	);
	const cached = await db(env).select().from(aiSummaries).where(where).get();
	if (cached?.contentHash === contentHash) {
		return { summary: JSON.parse(cached.summary) as GroundedSummary };
	}

	let summary: GroundedSummary;
	try {
		summary = await groundedSummary(env, units);
	} catch (e) {
		console.error(`summarize: ${SUMMARY_MODEL} failed on ${subject.type} ${subject.id}`, e);
		return { error: strings.errors.failed };
	}
	const stored = JSON.stringify(summary);
	await db(env)
		.insert(aiSummaries)
		.values({
			subjectType: subject.type,
			subjectId: subject.id,
			contentHash,
			summary: stored,
			createdAt: Date.now()
		})
		.onConflictDoUpdate({
			target: [aiSummaries.subjectType, aiSummaries.subjectId],
			set: { contentHash, summary: stored, createdAt: Date.now() }
		});
	return { summary };
}

/** A post and all its comments: whoever can load the post can read every comment on it. */
export async function postUnits(env: Env, post: LoadedPost): Promise<SourceUnit[]> {
	const { comments, users } = schema;
	const rows = await db(env)
		.select({
			id: comments.id,
			parentId: comments.parentId,
			authorName: users.name,
			text: comments.bodyText
		})
		.from(comments)
		.innerJoin(users, eq(users.id, comments.authorId))
		.where(eq(comments.postId, post.id))
		.orderBy(asc(comments.createdAt), asc(comments.id));
	const item = { authorName: post.authorName, title: post.title, text: post.bodyText };
	return discussionUnits('post', item, rows);
}

export async function summarizePost(env: Env, post: LoadedPost) {
	return summarize(env, { type: 'post', id: post.id }, await postUnits(env, post));
}

/** A note and all its comments: whoever can load the note can read every comment on it. */
export async function noteUnits(env: Env, note: LoadedNote): Promise<SourceUnit[]> {
	const { noteComments, users } = schema;
	const rows = await db(env)
		.select({
			id: noteComments.id,
			parentId: noteComments.parentId,
			authorName: users.name,
			text: noteComments.bodyText
		})
		.from(noteComments)
		.innerJoin(users, eq(users.id, noteComments.authorId))
		.where(eq(noteComments.noteId, note.id))
		.orderBy(asc(noteComments.createdAt), asc(noteComments.id));
	const item = { authorName: note.authorName, title: note.title, text: note.bodyText };
	return discussionUnits('note', item, rows);
}

export async function summarizeNote(env: Env, note: LoadedNote) {
	return summarize(env, { type: 'note', id: note.id }, await noteUnits(env, note));
}

/** How many of a chat thread's latest messages the model reads; a whole history can outgrow its context. */
export const THREAD_SUMMARY_MESSAGES = 100;

/**
 * A chat thread's latest messages, for one of its members: every member sees every message. A
 * message's anchor is the id Message gives it.
 */
export async function threadUnits(env: Env, thread: LoadedThread): Promise<SourceUnit[]> {
	const { messages, users } = schema;
	const latest = await db(env)
		.select({ id: messages.id, authorName: users.name, text: messages.bodyText })
		.from(messages)
		.innerJoin(users, eq(users.id, messages.authorId))
		.where(and(eq(messages.threadId, thread.id), isNull(messages.deletedAt)))
		.orderBy(desc(messages.createdAt), sql`${messages}.rowid DESC`)
		.limit(THREAD_SUMMARY_MESSAGES);
	return latest.reverse().map((m) => ({
		author: m.authorName,
		kind: strings.kinds.message,
		text: m.text,
		anchor: `message-${m.id}`
	}));
}

export async function summarizeThread(env: Env, thread: LoadedThread) {
	return summarize(env, { type: 'thread', id: thread.id }, await threadUnits(env, thread));
}
