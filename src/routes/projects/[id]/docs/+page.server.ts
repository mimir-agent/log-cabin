import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { listNotes } from '#lib/server/notes/notes.js';
import { canWriteInProject, loadProject } from '#lib/server/posts/access.js';
import type { PageServerLoad } from './$types';

// A project's Docs tab: the notes shared with it that this person can see, latest activity
// first. The page asks notes/list for the rest as it scrolls.
export const load: PageServerLoad = async (event) => {
	const env = getEnv();
	const who = requireMember(event);
	const project = await loadProject(env, who, event.params.id);
	const { notes, next } = await listNotes(env, who, {
		filter: 'all',
		sort: 'activity',
		q: '',
		cursor: null,
		projectId: project.id
	});
	return {
		project: { id: project.id, name: project.name },
		notes,
		next,
		canCreate: canWriteInProject(who.member, project)
	};
};
