import { fail } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { createTag, deleteTag, listTags, renameTag } from '#lib/server/posts/tags.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const who = requireMember(event, 'member');
	return { tags: await listTags(getEnv(), who) };
};

export const actions: Actions = {
	create: async (event) => {
		requireMember(event, 'member');
		const form = await event.request.formData();
		const created = await createTag(getEnv(), String(form.get('name') ?? ''));
		if (!created.ok) return fail(400, { message: created.message });
	},
	rename: async (event) => {
		requireMember(event, 'member');
		const form = await event.request.formData();
		const renamed = await renameTag(
			getEnv(),
			String(form.get('from') ?? ''),
			String(form.get('name') ?? '')
		);
		if (!renamed.ok) return fail(400, { message: renamed.message });
	},
	delete: async (event) => {
		requireMember(event, 'member');
		const form = await event.request.formData();
		const deleted = await deleteTag(getEnv(), String(form.get('name') ?? ''));
		if (!deleted.ok) return fail(400, { message: deleted.message });
	}
};
