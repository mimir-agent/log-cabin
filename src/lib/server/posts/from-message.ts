// Adapted from Campsite (https://github.com/campsite/campsite), apps/web/components/Thread/Bubble/Overflow.tsx, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/
// "Start a post…" on a message, after Campsite's (CC BY-NC 4.0, Overflow.tsx and posts'
// from_message): the post keeps the message's words and files and links back to it.
import { error } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { newId } from '../id';
import type { SignedIn } from '../auth/session';
import { getObject, putObject } from '../storage';
import { loadThread } from '../chat/threads';
import { attachmentIdOf, attachmentPath, type DocNode } from '../../editor/doc';
import { chat as chatStrings } from '../../strings/chat';
import { attachmentKey } from './attachments';
import { publishPost } from './drafts';
import type { PostInput } from './posts';

/**
 * Publishes a post started from a message the author can read. Files from the conversation
 * are copied to the project, so the project's members, who may not be in it, can open them.
 */
export async function postFromMessage(
	env: Env,
	who: SignedIn,
	projectId: string,
	messageId: string,
	input: PostInput,
	draftId: string | null = null
) {
	const threadId = await messageThread(env, messageId);
	if (!threadId) error(404, chatStrings.errors.messageNotFound);
	await loadThread(env, who, threadId);
	const body = await copyThreadFiles(env, who, threadId, projectId, JSON.parse(input.body));
	return publishPost(
		env,
		who,
		projectId,
		{ ...input, body: JSON.stringify(body), fromMessageId: messageId },
		draftId
	);
}

/** Where a post came from, for a reader in that conversation; null for anyone else. */
export async function messageSource(
	env: Env,
	who: SignedIn,
	post: { fromMessageId: string | null }
) {
	if (!post.fromMessageId) return null;
	const threadId = await messageThread(env, post.fromMessageId);
	if (!threadId) return null;
	const thread = await loadThread(env, who, threadId).catch((e) => {
		if (e?.status === 404) return null;
		throw e;
	});
	if (!thread) return null;
	return {
		href: `/chat/${thread.id}#message-${post.fromMessageId}`,
		name: thread.name
	};
}

async function messageThread(env: Env, messageId: string) {
	const row = await db(env)
		.select({ threadId: schema.messages.threadId })
		.from(schema.messages)
		.where(eq(schema.messages.id, messageId))
		.get();
	return row?.threadId ?? null;
}

async function copyThreadFiles(
	env: Env,
	who: SignedIn,
	threadId: string,
	projectId: string,
	body: DocNode
): Promise<DocNode> {
	const { attachments } = schema;
	const ids = new Set<string>();
	const collect = (node: DocNode) => {
		if (node.type === 'attachment') ids.add(String(node.attrs?.id));
		if (node.type === 'image') ids.add(attachmentIdOf(String(node.attrs?.src)));
		node.content?.forEach(collect);
	};
	collect(body);
	if (!ids.size) return body;
	const rows = await db(env)
		.select()
		.from(attachments)
		.where(inArray(attachments.id, [...ids]))
		.all();
	const copies = new Map<string, string>();
	for (const row of rows.filter((r) => r.threadId === threadId)) {
		const object = await getObject(env, attachmentKey(row.id));
		if (!object) throw new Error(`copying attachment ${row.id}: no R2 object at its key`);
		const id = newId();
		await putObject(env, attachmentKey(id), object.body, row.contentType);
		await db(env)
			.insert(attachments)
			.values({
				...row,
				id,
				threadId: null,
				projectId,
				uploadedBy: who.user.id,
				createdAt: Date.now()
			});
		copies.set(row.id, id);
	}
	const rewrite = (node: DocNode): DocNode => {
		const attrs = node.attrs ?? {};
		if (node.type === 'attachment' && copies.has(String(attrs.id))) {
			return { ...node, attrs: { ...attrs, id: copies.get(String(attrs.id)) } };
		}
		if (node.type === 'image' && copies.has(attachmentIdOf(String(attrs.src)))) {
			const id = copies.get(attachmentIdOf(String(attrs.src)))!;
			return { ...node, attrs: { ...attrs, src: attachmentPath(id) } };
		}
		return node.content ? { ...node, content: node.content.map(rewrite) } : node;
	};
	return rewrite(body);
}
