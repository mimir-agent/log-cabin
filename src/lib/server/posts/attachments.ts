import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { newId } from '../id';
import { getObject, putObject } from '../storage';
import type { SignedIn } from '../auth/session';
import { posts as strings } from '../../strings/posts';
import { appFileKind } from '../../files';
import { loadProject, loadWritableProject } from './access';
import { loadThread } from '../chat/threads';
import { loadNote } from '../notes/access';

// SVG and HTML are left out on purpose: served from our origin they could run script.
const allowedTypes = new Set([
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
	'image/avif',
	'application/pdf',
	// A Lottie animation is a JSON file.
	'application/json',
	'text/plain',
	'text/csv',
	'text/markdown',
	'application/zip',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'video/mp4',
	'video/webm',
	'audio/mpeg'
]);

/** ATTACHMENT_MAX_MB from wrangler.jsonc, in bytes. */
export function maxAttachmentBytes(env: Env): number {
	const mb = Number(env.ATTACHMENT_MAX_MB);
	if (!(mb > 0)) {
		throw new Error(`ATTACHMENT_MAX_MB must be a positive number, got "${env.ATTACHMENT_MAX_MB}"`);
	}
	return mb * 1024 * 1024;
}

export function attachmentKey(id: string): string {
	return `attachments/${id}`;
}

/** Stores an upload in R2 for a project this member can write in. */
export async function uploadAttachment(env: Env, who: SignedIn, projectId: string, file: File) {
	await loadWritableProject(env, who, projectId);
	return storeAttachment(env, who, { projectId }, file);
}

/** The file's content type, refusing a type or size an attachment can't have. */
export function checkAttachment(env: Env, file: File): string {
	// A design tool's file has no browser type; it is kept, and served, as a download.
	const designFile = appFileKind(file.name) !== null;
	const contentType = designFile
		? 'application/octet-stream'
		: file.type.split(';')[0].trim().toLowerCase();
	if (!designFile && !allowedTypes.has(contentType)) {
		error(415, strings.errors.fileTypeNotAllowed(file.name));
	}
	const max = maxAttachmentBytes(env);
	if (file.size > max) error(413, strings.errors.fileTooLarge(file.name, max));
	return contentType;
}

/**
 * Checks the file's type and size, then puts it in R2 under a new id. The caller records
 * whose it is.
 */
export async function putAttachmentFile(env: Env, file: File) {
	const contentType = checkAttachment(env, file);
	const id = newId();
	await putObject(env, attachmentKey(id), file, contentType);
	return { id, name: file.name, size: file.size, contentType };
}

/**
 * Stores an upload for a project or a chat thread. The caller has already checked that this
 * member may write there.
 */
export async function storeAttachment(
	env: Env,
	who: SignedIn,
	owner: { projectId: string } | { threadId: string },
	file: File
) {
	const stored = await putAttachmentFile(env, file);
	await db(env)
		.insert(schema.attachments)
		.values({ ...stored, ...owner, uploadedBy: who.user.id, createdAt: Date.now() });
	return stored;
}

/**
 * The file's bytes for someone who can see its project, is in its thread, or can open its
 * note; 404 for everyone else.
 */
export async function readAttachment(env: Env, who: SignedIn, id: string) {
	const { attachments, noteAttachments } = schema;
	const row = await db(env).select().from(attachments).where(eq(attachments.id, id)).get();
	const noteRow = row
		? null
		: await db(env).select().from(noteAttachments).where(eq(noteAttachments.id, id)).get();
	if (row?.threadId != null) await loadThread(env, who, row.threadId);
	else if (row) await loadProject(env, who, row.projectId!);
	else if (noteRow) await loadNote(env, who, noteRow.noteId);
	else error(404, strings.errors.fileNotFound);
	const object = await getObject(env, attachmentKey(id));
	if (!object)
		throw new Error(`attachment ${id} has a row but no R2 object at ${attachmentKey(id)}`);
	return { row: (row ?? noteRow)!, object };
}
