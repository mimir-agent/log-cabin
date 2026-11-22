import { isHttpError, json } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { importNoteImage } from '#lib/server/notes/attachments.js';
import { notes } from '#lib/strings/notes.js';
import type { RequestHandler } from './$types';

// A pasted Markdown image's address, { url }, fetched into the note: the upload endpoint's
// contract, 201 with the attachment, or a status with { message }.
export const POST: RequestHandler = async (event) => {
	const who = requireMember(event);
	const { url } = (await event.request.json().catch(() => ({}))) as { url?: unknown };
	if (typeof url !== 'string')
		return json({ message: notes.errors.imageUrlMissing }, { status: 400 });
	try {
		return json(await importNoteImage(getEnv(), who, event.params.id, url), { status: 201 });
	} catch (e) {
		if (isHttpError(e)) return json({ message: e.body.message }, { status: e.status });
		throw e;
	}
};
