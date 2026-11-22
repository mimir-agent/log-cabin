import { json } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { listNotes, noteQuery } from '#lib/server/notes/notes.js';
import { loadProject } from '#lib/server/posts/access.js';
import type { RequestHandler } from './$types';

/**
 * GET ?filter&sort&q&cursor, and ?project for a project's docs: the next page of notes, as
 * the notes index and a project's Docs tab ask for it while scrolling.
 */
export const GET: RequestHandler = async (event) => {
	const env = getEnv();
	const who = requireMember(event);
	const query = noteQuery(event.url.searchParams);
	// A project's docs follow its rule: someone outside a private project gets a 404.
	if (query.projectId) await loadProject(env, who, query.projectId);
	return json(await listNotes(env, who, query));
};
