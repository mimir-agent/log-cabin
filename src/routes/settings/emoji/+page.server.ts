import { fail } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { getOrg, updateOrg } from '#lib/server/org.js';
import {
	addCustomEmoji,
	canAddEmoji,
	listCustomEmoji,
	removeCustomEmoji
} from '#lib/server/posts/custom-emoji.js';
import { posts as strings } from '#lib/strings/posts.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const who = requireMember(event, 'viewer');
	const env = getEnv();
	const org = await getOrg(env);
	return {
		emoji: await listCustomEmoji(env),
		orgName: org.name,
		canAdd: canAddEmoji(who, org),
		viewerId: who.user.id,
		isAdmin: who.member.role === 'admin',
		customEmojiBy: org.customEmojiBy
	};
};

export const actions: Actions = {
	add: async (event) => {
		const who = requireMember(event, 'viewer');
		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { name, field: 'file', message: strings.errors.fileMissing });
		}
		const result = await addCustomEmoji(getEnv(), who, name, file);
		if (!result.ok) return fail(400, { name, field: result.field, message: result.message });
	},
	remove: async (event) => {
		const who = requireMember(event, 'viewer');
		const form = await event.request.formData();
		await removeCustomEmoji(getEnv(), who, String(form.get('id')));
	},
	whoMayAdd: async (event) => {
		requireMember(event, 'admin');
		const form = await event.request.formData();
		const value = form.get('customEmojiBy');
		if (value !== 'members' && value !== 'admins') {
			return fail(400, { message: strings.emoji.errors.whoInvalid(String(value)) });
		}
		await updateOrg(getEnv(), { customEmojiBy: value });
	}
};
