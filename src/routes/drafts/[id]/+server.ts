import { json } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { parseDraft, updateDraft } from '#lib/server/posts/drafts.js';
import type { RequestHandler } from './$types';

/** Every later autosave of the draft, with the project picked in the composer. */
export const PUT: RequestHandler = async (event) => {
	const who = requireMember(event);
	const raw = (await event.request.json()) as { projectId?: unknown };
	const projectId = raw.projectId == null ? undefined : String(raw.projectId);
	return json(await updateDraft(getEnv(), who, event.params.id, parseDraft(raw), projectId));
};
