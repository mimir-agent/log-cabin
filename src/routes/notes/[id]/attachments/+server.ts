import { isHttpError, json } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { uploadNoteAttachment } from '#lib/server/notes/attachments.js';
import { posts } from '#lib/strings/posts.js';
import type { RequestHandler } from './$types';

// The editor's upload contract, as for a project: 201 with the attachment, or a status with
// { message }.
export const POST: RequestHandler = async (event) => {
	const who = requireMember(event);
	const file = (await event.request.formData()).get('file');
	if (!(file instanceof File)) return json({ message: posts.errors.fileMissing }, { status: 400 });
	try {
		return json(await uploadNoteAttachment(getEnv(), who, event.params.id, file), {
			status: 201
		});
	} catch (e) {
		if (isHttpError(e)) return json({ message: e.body.message }, { status: e.status });
		throw e;
	}
};
