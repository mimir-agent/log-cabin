import { json } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { createDraft, parseDraft } from '#lib/server/posts/drafts.js';
import type { RequestHandler } from './$types';

/** The composer's first autosave: starts a draft in a project. */
export const POST: RequestHandler = async (event) => {
	const who = requireMember(event);
	const raw = (await event.request.json()) as { projectId: string };
	return json(await createDraft(getEnv(), who, String(raw.projectId), parseDraft(raw)), {
		status: 201
	});
};
