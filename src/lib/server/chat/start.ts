// Adapted from Campsite (https://github.com/campsite/campsite), api/app/controllers/api/v1/message_threads_controller.rb, commit cc14551, modified. Licensed CC BY-NC 4.0: https://creativecommons.org/licenses/by-nc/4.0/
// Starting a conversation from the new-chat step, after Campsite's MessageThreadsController#create
// (CC BY-NC 4.0): the people, an optional name, and the first message with its files.
import { error } from '@sveltejs/kit';
import {
	attachmentPath,
	DocError,
	docText,
	isEmptyDoc,
	sanitizeDoc,
	type DocNode
} from '../../editor/doc';
import { posts } from '../../strings/posts';
import type { SignedIn } from '../auth/session';
import { checkAttachment, storeAttachment } from '../posts/attachments';
import { createGroup, loadThread, startDm } from './threads';
import { sendMessage } from './messages';

type Start = {
	title: string;
	memberIds: string[];
	/** The first message as the editor sent it, or null for none. */
	body: string | null;
	files: File[];
};

/**
 * Opens the direct message for one other person with no name given, and makes a group for
 * anything else, then sends the first message, if any, with the files after its text.
 * A file that can't be stored is refused before anything is made.
 */
export async function startConversation(env: Env, who: SignedIn, start: Start): Promise<string> {
	for (const file of start.files) checkAttachment(env, file);
	const written = start.body === null ? null : readDoc(start.body);
	const others = [...new Set(start.memberIds)].filter((id) => id !== who.user.id);
	const id =
		others.length === 1 && !start.title.trim()
			? await startDm(env, who, others[0])
			: await createGroup(env, who, start.title, others);
	if (!start.files.length && (!written || isEmptyDoc(written))) return id;

	const thread = await loadThread(env, who, id);
	const files: DocNode[] = [];
	for (const file of start.files) {
		const { id, name, size, contentType } = await storeAttachment(
			env,
			who,
			{ threadId: thread.id },
			file
		);
		files.push(
			contentType.startsWith('image/')
				? { type: 'image', attrs: { src: attachmentPath(id), alt: name } }
				: { type: 'attachment', attrs: { id, name, size, contentType } }
		);
	}
	const doc = { type: 'doc', content: [...(written?.content ?? []), ...files] };
	await sendMessage(env, who, thread, { body: JSON.stringify(doc), bodyText: docText(doc) }, null);
	return id;
}

/** The editor's document, refused with a 400 when it isn't one. */
function readDoc(json: string): DocNode {
	try {
		return sanitizeDoc(json);
	} catch (e) {
		if (e instanceof DocError) error(400, posts.errors.bodyInvalid(e.message));
		throw e;
	}
}
