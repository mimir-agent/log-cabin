import { json } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { composerData } from '#lib/server/posts/projects.js';
import type { RequestHandler } from './$types';

/** The new-post dialog's data for a project, fetched when it opens or the picker changes. */
export const GET: RequestHandler = async (event) =>
	json(await composerData(getEnv(), requireMember(event), event.params.id));
