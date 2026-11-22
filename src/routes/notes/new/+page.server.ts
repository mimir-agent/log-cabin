import { error, fail, redirect } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { createNote, noteMentionCandidates, validateNoteInput } from '#lib/server/notes/notes.js';
import { loadWritableProject } from '#lib/server/posts/access.js';
import { notes } from '#lib/strings/notes.js';
import type { Actions, PageServerLoad } from './$types';

/** `?project=<id>` starts the note shared with that project, which this member must write in. */
export const load: PageServerLoad = async (event) => {
	const env = getEnv();
	const who = requireMember(event);
	if (who.member.role === 'viewer') error(403, notes.errors.cannotCreate);
	const projectId = event.url.searchParams.get('project');
	const project = projectId ? await loadWritableProject(env, who, projectId) : null;
	const people = await noteMentionCandidates(env, who, project?.id ?? null);
	return {
		project: project && { id: project.id, name: project.name },
		people: people.map(({ id, name }) => ({ id, name }))
	};
};

export const actions: Actions = {
	default: async (event) => {
		const who = requireMember(event);
		const form = Object.fromEntries(await event.request.formData());
		const result = validateNoteInput(form);
		if (!result.ok) return fail(400, { message: result.message, title: String(form.title ?? '') });
		const projectId = String(form.projectId ?? '') || null;
		const id = await createNote(getEnv(), who, result.input, projectId);
		redirect(303, `/notes/${id}`);
	}
};
