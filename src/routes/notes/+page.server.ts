import { fail } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { noteLayouts } from '#lib/server/db/schema/index.js';
import { listNotes, noteLayout, noteQuery, setNoteLayout } from '#lib/server/notes/notes.js';
import { notes as strings } from '#lib/strings/notes.js';
import type { Actions, PageServerLoad } from './$types';

// The first page of notes; the page asks notes/list for the rest as it scrolls.
export const load: PageServerLoad = async (event) => {
	const env = getEnv();
	const who = requireMember(event);
	const query = { ...noteQuery(event.url.searchParams), cursor: null, projectId: null };
	const [{ notes, next }, layout] = await Promise.all([
		listNotes(env, who, query),
		noteLayout(env, who)
	]);
	return {
		query,
		notes,
		next,
		layout,
		canCreate: who.member.role !== 'viewer'
	};
};

export const actions: Actions = {
	/** layout=list|grid: how this person sees the index, from now on and on every device. */
	layout: async (event) => {
		const who = requireMember(event);
		const asked = (await event.request.formData()).get('layout');
		const layout = noteLayouts.find((l) => l === asked);
		if (!layout) return fail(400, { message: strings.errors.layoutInvalid });
		await setNoteLayout(getEnv(), who, layout);
	}
};
