import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { chatPeople, startDm } from '#lib/server/chat/threads.js';
import { startConversation } from '#lib/server/chat/start.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const who = requireMember(event);
	return { people: await chatPeople(getEnv(), who) };
};

/** Runs a thread-creating call, turning its 4xx into a form message. */
async function opening(create: () => Promise<string>) {
	let id: string;
	try {
		id = await create();
	} catch (e) {
		if (isHttpError(e) && e.status < 500) return fail(e.status, { message: e.body.message });
		throw e;
	}
	redirect(303, `/chat/${id}`);
}

export const actions: Actions = {
	dm: async (event) => {
		const who = requireMember(event);
		const form = await event.request.formData();
		return opening(() => startDm(getEnv(), who, String(form.get('person') ?? '')));
	},
	group: async (event) => {
		const who = requireMember(event);
		const form = await event.request.formData();
		const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
		return opening(() =>
			startConversation(getEnv(), who, {
				title: String(form.get('title') ?? ''),
				memberIds: form.getAll('people').map(String),
				body: form.has('body') ? String(form.get('body')) : null,
				files
			})
		);
	}
};
