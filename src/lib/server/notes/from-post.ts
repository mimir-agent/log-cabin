import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { newId } from '../id';
import type { SignedIn } from '../auth/session';
import { attachmentKey } from '../posts/attachments';
import type { LoadedPost } from '../posts/posts';
import { getObject, putObject } from '../storage';
import { docAttachments, replaceAttachmentIds, type DocNode } from '../../editor/doc';
import { createNote } from './notes';
import { recordNoteEvent } from './timeline';

/**
 * A new doc that is the signed-in person's alone, with the post's title, body and files. The
 * post's comments and reactions stay with the post. Each file is stored again under the doc,
 * because a file is served by its id and answers to whoever may read what owns it.
 */
export async function makeDocFromPost(env: Env, who: SignedIn, post: LoadedPost) {
	const { attachments, noteAttachments, notes } = schema;
	const body = JSON.parse(post.body) as DocNode;
	const noteId = await createNote(env, who, {
		title: post.title,
		body: post.body,
		bodyText: post.bodyText,
		mentions: []
	});
	const ids = docAttachments(body);
	if (ids.length > 0) {
		const files = await db(env)
			.select()
			.from(attachments)
			.where(and(inArray(attachments.id, ids), eq(attachments.projectId, post.projectId)))
			.all();
		const copies = new Map<string, string>();
		for (const file of files) {
			const object = await getObject(env, attachmentKey(file.id));
			if (!object) throw new Error(`copying attachment ${file.id}: no R2 object at its key`);
			const id = newId();
			await putObject(env, attachmentKey(id), object.body, file.contentType);
			await db(env)
				.insert(noteAttachments)
				.values({ ...file, id, noteId, uploadedBy: who.user.id, createdAt: Date.now() });
			copies.set(file.id, id);
		}
		await db(env)
			.update(notes)
			.set({ body: JSON.stringify(replaceAttachmentIds(body, copies)) })
			.where(eq(notes.id, noteId));
	}
	await recordNoteEvent(env, noteId, who.user.id, {
		kind: 'from_post',
		refType: 'post',
		refId: post.id
	});
	return noteId;
}
