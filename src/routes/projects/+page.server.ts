import { fail, redirect } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { createProject, listProjects, validateProjectInput } from '#lib/server/posts/projects.js';
import { hasRole } from '#lib/roles.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const who = requireMember(event);
	const archived = event.url.searchParams.has('archived');
	return {
		archived,
		projects: await listProjects(getEnv(), who, archived),
		canCreate: hasRole(who.member.role, 'member')
	};
};

export const actions: Actions = {
	create: async (event) => {
		const who = requireMember(event);
		const form = Object.fromEntries(await event.request.formData());
		const result = validateProjectInput(form);
		if (!result.ok) {
			return fail(400, {
				message: result.message,
				name: String(form.name ?? ''),
				description: String(form.description ?? ''),
				private: !!form.private,
				chat: !!form.chat
			});
		}
		const id = await createProject(getEnv(), who, result.input);
		redirect(303, `/projects/${id}`);
	}
};
