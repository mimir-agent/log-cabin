import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db, schema } from '../db';
import { newId } from '../id';
import { emit } from '../events';
import { presentUserIds, publish } from '../realtime/publish';
import type { SignedIn } from '../auth/session';
import type { BodyInput } from '../posts/posts';
import { assertReaction } from '../posts/reactions';
import { attachmentKey } from '../posts/attachments';
import { deleteObject } from '../storage';
import {
	attachmentIdOf,
	docAttachments,
	docText,
	isEmptyDoc,
	type DocNode
} from '../../editor/doc';
import { chat as strings } from '../../strings/chat';
import { core } from '../../strings/core';
import { loadThread, type LoadedThread } from './threads';

export type MessageReaction = { emoji: string; count: number; names: string[]; mine: boolean };

/** Tells every open client of the thread, and each member's thread list, that it changed. */
async function announce(env: Env, thread: LoadedThread, payload: { type: string }) {
	await publish(env, `thread:${thread.id}`, payload);
	for (const person of thread.people) {
		await publish(env, `user:${person.id}`, { type: 'chat.threads' });
	}
}

export async function sendMessage(
	env: Env,
	who: SignedIn,
	thread: LoadedThread,
	input: Omit<BodyInput, 'mentions'>,
	replyToId: string | null,
	id = newId()
): Promise<string> {
	const { messages, chatThreads, chatThreadMembers } = schema;
	// The same send again, after the answer to the first one was lost: it's stored already.
	const prior = await db(env)
		.select({ authorId: messages.authorId, threadId: messages.threadId })
		.from(messages)
		.where(eq(messages.id, id))
		.get();
	if (prior) {
		if (prior.authorId !== who.user.id || prior.threadId !== thread.id) {
			error(409, core.errors.idRefused);
		}
		return id;
	}
	// A deactivated member's DM stays to be read, but nobody can answer in it (Campsite's).
	if (thread.kind === 'dm' && thread.people.some((p) => p.deactivated)) {
		error(403, strings.errors.dmDeactivated);
	}
	if (replyToId) {
		const parent = await db(env)
			.select({ id: messages.id })
			.from(messages)
			.where(and(eq(messages.id, replyToId), eq(messages.threadId, thread.id)))
			.get();
		if (!parent) error(404, strings.errors.messageNotFound);
	}
	const now = Date.now();
	const d = db(env);
	await d.batch([
		d.insert(messages).values({
			id,
			threadId: thread.id,
			authorId: who.user.id,
			replyToId,
			body: input.body,
			bodyText: input.bodyText,
			createdAt: now
		}),
		d.update(chatThreads).set({ lastMessageAt: now }).where(eq(chatThreads.id, thread.id)),
		d
			.update(chatThreadMembers)
			.set({ lastReadAt: now })
			.where(
				and(eq(chatThreadMembers.threadId, thread.id), eq(chatThreadMembers.userId, who.user.id))
			)
	]);
	await announce(env, thread, { type: 'message.created' });
	const present = new Set(await presentUserIds(env, `thread:${thread.id}`));
	await emit(env, {
		kind: 'message.created',
		messageId: id,
		threadId: thread.id,
		authorId: who.user.id,
		recipientIds: thread.people
			.map((p) => p.id)
			.filter((id) => id !== who.user.id && !present.has(id))
	});
	return id;
}

/** A message in this thread, not deleted, that this member may change: their own, or any for an admin (Campsite's message_policy). 404 for none, 403 for someone else's. */
async function changeableMessage(env: Env, who: SignedIn, thread: LoadedThread, messageId: string) {
	const { messages } = schema;
	const row = await db(env)
		.select({ authorId: messages.authorId, body: messages.body, deletedAt: messages.deletedAt })
		.from(messages)
		.where(and(eq(messages.id, messageId), eq(messages.threadId, thread.id)))
		.get();
	if (!row || row.deletedAt !== null) error(404, strings.errors.messageNotFound);
	if (row.authorId !== who.user.id && who.member.role !== 'admin') {
		error(403, strings.errors.notYourMessage);
	}
	return { body: JSON.parse(row.body) as DocNode };
}

export async function editMessage(
	env: Env,
	who: SignedIn,
	thread: LoadedThread,
	messageId: string,
	input: Omit<BodyInput, 'mentions'>
) {
	await changeableMessage(env, who, thread, messageId);
	await db(env)
		.update(schema.messages)
		.set({ body: input.body, bodyText: input.bodyText, editedAt: Date.now() })
		.where(eq(schema.messages.id, messageId));
	await announce(env, thread, { type: 'message.updated' });
}

/**
 * "Delete attachments…" (Campsite's): takes these files out of a message and deletes them,
 * keeping its text and its other files. A message left with nothing is deleted.
 */
export async function deleteAttachments(
	env: Env,
	who: SignedIn,
	thread: LoadedThread,
	messageId: string,
	attachmentIds: string[]
) {
	const { body } = await changeableMessage(env, who, thread, messageId);
	const doomed = new Set(attachmentIds);
	const held = new Set(docAttachments(body));
	if (doomed.size === 0 || [...doomed].some((id) => !held.has(id))) {
		error(400, strings.errors.attachmentNotInMessage);
	}
	const kept = withoutAttachments(body, doomed);
	if (isEmptyDoc(kept)) return deleteMessage(env, who, thread, messageId);
	const { messages, attachments } = schema;
	const d = db(env);
	await d.batch([
		d
			.update(messages)
			.set({ body: JSON.stringify(kept), bodyText: docText(kept) })
			.where(eq(messages.id, messageId)),
		d
			.delete(attachments)
			.where(and(eq(attachments.threadId, thread.id), inArray(attachments.id, [...doomed])))
	]);
	for (const id of doomed) await deleteObject(env, attachmentKey(id));
	await announce(env, thread, { type: 'message.updated' });
}

/** The document without the image and file nodes of these attachments. */
function withoutAttachments(node: DocNode, ids: Set<string>): DocNode {
	const gone = (n: DocNode) =>
		(n.type === 'attachment' && ids.has(String(n.attrs?.id))) ||
		(n.type === 'image' && ids.has(attachmentIdOf(String(n.attrs?.src))));
	return node.content
		? {
				...node,
				content: node.content.filter((n) => !gone(n)).map((n) => withoutAttachments(n, ids))
			}
		: node;
}

/** Empties the message and marks it deleted, so replies to it still show where they point. */
export async function deleteMessage(
	env: Env,
	who: SignedIn,
	thread: LoadedThread,
	messageId: string
) {
	await changeableMessage(env, who, thread, messageId);
	const d = db(env);
	await d.batch([
		d
			.update(schema.messages)
			.set({ body: '', bodyText: '', deletedAt: Date.now() })
			.where(eq(schema.messages.id, messageId)),
		d.delete(schema.messageReactions).where(eq(schema.messageReactions.messageId, messageId))
	]);
	await announce(env, thread, { type: 'message.deleted' });
}

/** Adds this member's reaction to a message, or removes it when it's already there. */
export async function toggleMessageReaction(
	env: Env,
	who: SignedIn,
	thread: LoadedThread,
	messageId: string,
	emoji: string
) {
	await assertReaction(env, emoji);
	const { messages, messageReactions: r } = schema;
	const message = await db(env)
		.select({ deletedAt: messages.deletedAt })
		.from(messages)
		.where(and(eq(messages.id, messageId), eq(messages.threadId, thread.id)))
		.get();
	if (!message || message.deletedAt !== null) error(404, strings.errors.messageNotFound);
	const mine = and(eq(r.messageId, messageId), eq(r.userId, who.user.id), eq(r.emoji, emoji));
	const existing = await db(env).select({ emoji: r.emoji }).from(r).where(mine).get();
	if (existing) {
		await db(env).delete(r).where(mine);
	} else {
		await db(env)
			.insert(r)
			.values({ messageId, userId: who.user.id, emoji, createdAt: Date.now() });
	}
	await publish(env, `thread:${thread.id}`, { type: 'reactions.changed' });
}

/** How many messages a thread shows at first, and how many more each step back (Campsite's). */
export const messagePage = 20;

/** A message's place in its thread: time sent, then the order it was stored in. */
type Place = { createdAt: number; rowid: number };

async function placeOf(env: Env, thread: LoadedThread, messageId: string): Promise<Place> {
	const place = await db(env).get<Place>(
		sql`SELECT created_at AS createdAt, rowid FROM messages WHERE id = ${messageId} AND thread_id = ${thread.id}`
	);
	if (!place) error(404, strings.errors.messageNotFound);
	return place;
}

/** Where the latest page starts, or null when the thread holds no more than a page. */
async function latestPageStart(env: Env, thread: LoadedThread): Promise<Place | null> {
	const place = await db(env).get<Place>(
		sql`SELECT created_at AS createdAt, rowid FROM messages WHERE thread_id = ${thread.id}
			ORDER BY created_at DESC, rowid DESC LIMIT 1 OFFSET ${messagePage - 1}`
	);
	return place ?? null;
}

/** The first message of the page before this one, or null when this one is the first. */
export async function olderPageStart(
	env: Env,
	thread: LoadedThread,
	firstShownId: string
): Promise<string | null> {
	const { createdAt, rowid } = await placeOf(env, thread, firstShownId);
	const older = await db(env).all<{ id: string }>(
		sql`SELECT id FROM messages WHERE thread_id = ${thread.id}
			AND (created_at, rowid) < (${createdAt}, ${rowid})
			ORDER BY created_at DESC, rowid DESC LIMIT ${messagePage}`
	);
	return older.at(-1)?.id ?? null;
}

/**
 * The thread's messages, oldest first, with authors, what each replies to, and reactions:
 * the latest page, or every message from `from` on as the reader pages back.
 */
export async function listMessages(env: Env, who: SignedIn, thread: LoadedThread, from?: string) {
	const { messages, users, messageReactions: r } = schema;
	const start = from ? await placeOf(env, thread, from) : await latestPageStart(env, thread);
	const shown = and(
		eq(messages.threadId, thread.id),
		start
			? sql`(${messages.createdAt}, ${messages}.rowid) >= (${start.createdAt}, ${start.rowid})`
			: undefined
	);
	const parent = alias(messages, 'parent');
	const parentAuthor = alias(users, 'parent_author');
	// Selected by thread, the reactions need neither the messages first nor a list of their ids,
	// which D1 would cap at 100 bound parameters.
	const [rows, reactions] = await Promise.all([
		db(env)
			.select({
				id: messages.id,
				authorId: messages.authorId,
				authorName: users.name,
				replyToId: messages.replyToId,
				body: messages.body,
				bodyText: messages.bodyText,
				createdAt: messages.createdAt,
				editedAt: messages.editedAt,
				deletedAt: messages.deletedAt,
				parentAuthorId: parentAuthor.id,
				parentAuthorName: parentAuthor.name,
				parentText: parent.bodyText,
				parentDeletedAt: parent.deletedAt
			})
			.from(messages)
			.innerJoin(users, eq(users.id, messages.authorId))
			.leftJoin(parent, eq(parent.id, messages.replyToId))
			.leftJoin(parentAuthor, eq(parentAuthor.id, parent.authorId))
			.where(shown)
			.orderBy(asc(messages.createdAt), sql`${messages}.rowid`),
		db(env)
			.select({ messageId: r.messageId, emoji: r.emoji, userId: r.userId, name: users.name })
			.from(r)
			.innerJoin(users, eq(users.id, r.userId))
			.where(inArray(r.messageId, db(env).select({ id: messages.id }).from(messages).where(shown)))
			.orderBy(asc(r.createdAt))
	]);
	const summaries = new Map<string, MessageReaction[]>();
	for (const row of reactions) {
		const list = summaries.get(row.messageId) ?? [];
		summaries.set(row.messageId, list);
		let summary = list.find((s) => s.emoji === row.emoji);
		if (!summary) list.push((summary = { emoji: row.emoji, count: 0, names: [], mine: false }));
		summary.count++;
		summary.names.push(row.name);
		summary.mine ||= row.userId === who.user.id;
	}
	return rows.map(({ parentAuthorId, parentAuthorName, parentText, parentDeletedAt, ...m }) => ({
		...m,
		body: m.deletedAt === null ? JSON.parse(m.body) : null,
		replyTo:
			parentAuthorId === null || parentAuthorName === null
				? null
				: {
						authorId: parentAuthorId,
						authorName: parentAuthorName,
						text: parentDeletedAt === null ? parentText : null
					},
		reactions: summaries.get(m.id) ?? []
	}));
}

/**
 * What hovering a thread in the list shows, after Campsite's ThreadHoverCard (CC BY-NC 4.0):
 * its name and its last five messages, as text. Reading it marks nothing read.
 */
export async function threadPreview(env: Env, who: SignedIn, threadId: string) {
	const thread = await loadThread(env, who, threadId);
	const messages = await listMessages(env, who, thread);
	return {
		name: thread.name,
		messages: messages.slice(-5).map((m) => ({
			id: m.id,
			authorName: m.authorName,
			mine: m.authorId === who.user.id,
			text: m.body ? docText(m.body) : null
		}))
	};
}
