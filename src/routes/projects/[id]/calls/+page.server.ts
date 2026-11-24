import { error } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { callHistory, liveCallIn } from '#lib/server/calls/history.js';
import { callsEnabled } from '#lib/server/calls/sfu.js';
import { loadProject } from '#lib/server/posts/access.js';
import { calls as strings } from '#lib/strings/calls.js';
import type { PageServerLoad } from './$types';

// A project's calls tab: the live call, then every past call in the project.
export const load: PageServerLoad = async (event) => {
	const env = getEnv();
	if (!callsEnabled(env)) error(404, strings.errors.disabled);
	const who = requireMember(event);
	const project = await loadProject(env, who, event.params.id);
	const place = { kind: 'project' as const, id: project.id };
	const history = await callHistory(env, who, {
		place,
		cursor: event.url.searchParams.get('cursor')
	});
	return {
		project: { id: project.id, name: project.name },
		live: await liveCallIn(env, place),
		calls: history.calls,
		more: history.next && `?cursor=${encodeURIComponent(history.next)}`
	};
};
