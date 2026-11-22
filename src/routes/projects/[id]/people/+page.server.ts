import { redirect } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { canManageProject, loadProject } from '#lib/server/posts/access.js';
import {
	addProjectMember,
	orgPeople,
	projectPeople,
	removeProjectMember
} from '#lib/server/posts/projects.js';
import { hasRole } from '#lib/roles.js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = async (event) => {
	const who = requireMember(event);
	const env = getEnv();
	const project = await loadProject(env, who, event.params.id);
	const people = await projectPeople(env, project.id);
	const canManage = canManageProject(who, project);
	const canAdd = (project.isMember || canManage) && hasRole(who.member.role, 'member');
	const inProject = new Set(people.map((person) => person.id));
	return {
		project: { id: project.id, name: project.name },
		people,
		me: who.user.id,
		canManage,
		candidates: canAdd ? (await orgPeople(env)).filter((person) => !inProject.has(person.id)) : []
	};
};

async function personActionInput(event: RequestEvent) {
	const who = requireMember(event);
	const env = getEnv();
	const project = await loadProject(env, who, event.params.id);
	const userId = String((await event.request.formData()).get('userId') ?? '');
	return { env, who, project, userId };
}

export const actions: Actions = {
	add: async (event) => {
		const { env, who, project, userId } = await personActionInput(event);
		await addProjectMember(env, who, project, userId);
	},
	remove: async (event) => {
		const { env, who, project, userId } = await personActionInput(event);
		await removeProjectMember(env, who, project, userId);
		// A private project disappears for whoever removes themselves from it.
		if (project.private && userId === who.user.id) redirect(303, '/projects');
	}
};
