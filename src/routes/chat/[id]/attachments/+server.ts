import { isHttpError, json } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { loadThread } from '#lib/server/chat/threads.js';
import { storeAttachment } from '#lib/server/posts/attachments.js';
import { chat } from '#lib/strings/chat.js';
import type { RequestHandler } from './$types';

// The editor's upload contract: 201 with the attachment, or a status with { message }.
export const POST: RequestHandler = async (event) => {
	const env = getEnv();
	const who = requireMember(event);
	const file = (await event.request.formData()).get('file');
	if (!(file instanceof File)) return json({ message: chat.errors.fileMissing }, { status: 400 });
	try {
		const thread = await loadThread(env, who, event.params.id);
		return json(await storeAttachment(env, who, { threadId: thread.id }, file), { status: 201 });
	} catch (e) {
		if (isHttpError(e)) return json({ message: e.body.message }, { status: e.status });
		throw e;
	}
};
