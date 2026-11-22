import { fail, redirect } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { deleteDraft, loadDraft, publishPost } from '#lib/server/posts/drafts.js';
import { validatePostInput } from '#lib/server/posts/posts.js';
import { mentionablePeople } from '#lib/server/posts/projects.js';
import type { DocNode } from '#lib/editor/doc.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const env = getEnv();
	const who = requireMember(event);
	const draft = await loadDraft(env, who, event.params.id);
	const people = await mentionablePeople(env, who, draft.projectId);
	return {
		project: { id: draft.project.id, name: draft.project.name },
		draft: {
			id: draft.id,
			title: draft.title,
			body: JSON.parse(draft.body) as DocNode,
			poll: draft.poll && JSON.parse(draft.poll),
			updatedAt: draft.updatedAt
		},
		members: people.map(({ id, name }) => ({ id, name }))
	};
};

export const actions: Actions = {
	/** Publishes the draft into its project's feed. */
	publish: async (event) => {
		const env = getEnv();
		const who = requireMember(event);
		const draft = await loadDraft(env, who, event.params.id);
		const result = validatePostInput(Object.fromEntries(await event.request.formData()));
		if (!result.ok) return fail(400, { message: result.message });
		const id = await publishPost(env, who, draft.projectId, result.input, draft.id);
		redirect(303, `/posts/${id}`);
	},
	delete: async (event) => {
		await deleteDraft(getEnv(), requireMember(event), event.params.id);
		redirect(303, '/drafts');
	}
};
