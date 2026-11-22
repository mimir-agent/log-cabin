import { error } from '@sveltejs/kit';
import { db, schema } from '../db';
import type { SignedIn } from '../auth/session';
import { fetchPublicResponse, readCapped } from '../link-previews';
import { maxAttachmentBytes, putAttachmentFile } from '../posts/attachments';
import { posts as postStrings } from '../../strings/posts';
import { notes as strings } from '../../strings/notes';
import { loadNote } from './access';

const importTimeoutMs = 10_000;

/**
 * Stores a file uploaded into a note, for someone who may edit it. Whoever can see the note
 * can read the file (readAttachment), as its body's images are.
 */
export async function uploadNoteAttachment(env: Env, who: SignedIn, noteId: string, file: File) {
	const note = await loadNote(env, who, noteId);
	if (note.access !== 'edit') error(403, strings.errors.cannotEdit);
	const stored = await putAttachmentFile(env, file);
	await db(env)
		.insert(schema.noteAttachments)
		.values({ ...stored, noteId: note.id, uploadedBy: who.user.id, createdAt: Date.now() });
	return stored;
}

/**
 * Fetches the image at a public address into a note as an upload of its own, for someone who
 * may edit it: the picture a pasted Markdown image shows. The fetch has the link previews'
 * guard (no private hosts, at most three redirects, each checked) and a time limit. 400 when
 * it can't be fetched or doesn't answer 200, 415 for anything but an image type uploads take,
 * 413 past the upload size limit.
 */
export async function importNoteImage(env: Env, who: SignedIn, noteId: string, address: string) {
	// Checked before fetching anything; uploadNoteAttachment checks again as it stores.
	const note = await loadNote(env, who, noteId);
	if (note.access !== 'edit') error(403, strings.errors.cannotEdit);
	const url = URL.canParse(address) ? new URL(address) : null;
	const signal = AbortSignal.timeout(importTimeoutMs);
	const answer = url && (await fetchPublicResponse(url, 'image/*', signal));
	if (!answer || answer.response.status !== 200) {
		await answer?.response.body?.cancel();
		error(400, strings.errors.imageNotFetched(address));
	}
	const { url: final, response } = answer;
	const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	if (!type.startsWith('image/')) {
		await response.body?.cancel();
		error(415, strings.errors.notAnImage(address));
	}
	const name = final.pathname.split('/').pop() || 'image';
	const max = maxAttachmentBytes(env);
	if (Number(response.headers.get('content-length')) > max) {
		await response.body?.cancel();
		error(413, postStrings.errors.fileTooLarge(name, max));
	}
	// A byte past the limit is enough for putAttachmentFile to refuse it as too large.
	const bytes = await readCapped(response, max + 1).catch(() =>
		error(400, strings.errors.imageNotFetched(address))
	);
	return uploadNoteAttachment(env, who, noteId, new File([bytes], name, { type }));
}
