import { error, fail } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import {
	bookableProjects,
	calcomMissing,
	calcomOn,
	disconnectCalcom,
	getConnection,
	saveConnection,
	webhookPath
} from '#lib/server/calcom/calcom.js';
import { calcom } from '#lib/strings/calcom.js';
import type { Actions, PageServerLoad } from './$types';

// Each member's own Cal.com connection. Viewers can't post anywhere, so they have none.
export const load: PageServerLoad = async (event) => {
	const who = requireMember(event, 'member');
	const env = getEnv();
	const missing = calcomMissing(env);
	if (missing) return { available: false as const, missing };
	if (!(await calcomOn(env))) error(404, calcom.errors.off);
	const connection = await getConnection(env, who.user.id);
	return {
		available: true as const,
		projects: await bookableProjects(env, who),
		connection: connection && {
			projectId: connection.place.kind === 'project' ? connection.place.id : null,
			webhookUrl: event.url.origin + webhookPath(connection.webhookId),
			webhookSecret: connection.webhookSecret
		}
	};
};

export const actions: Actions = {
	save: async (event) => {
		const who = requireMember(event, 'member');
		const env = getEnv();
		if (!(await calcomOn(env))) error(404, calcom.errors.off);
		const form = await event.request.formData();
		// 'room' is the member's personal room; anything else names a project.
		const place = String(form.get('place') ?? '');
		const projects = await bookableProjects(env, who);
		if (place !== 'room' && !projects.some((p) => p.id === place)) {
			return fail(400, { message: calcom.errors.placeMissing });
		}
		const typedKey = String(form.get('apiKey') ?? '').trim();
		if (!typedKey && !(await getConnection(env, who.user.id))) {
			return fail(400, { message: calcom.errors.apiKeyMissing });
		}
		await saveConnection(env, who, {
			projectId: place === 'room' ? null : place,
			apiKey: typedKey || undefined
		});
		return { saved: true };
	},
	disconnect: async (event) => {
		const who = requireMember(event, 'member');
		await disconnectCalcom(getEnv(), who.user.id);
		return { disconnected: true };
	}
};
