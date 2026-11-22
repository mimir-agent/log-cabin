import { getEnv } from '#lib/server/platform.js';
import { fail } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { getMember } from '#lib/server/members.js';
import { saveProfileForm } from '#lib/server/people/profile-form.js';
import { getObjectUrl } from '#lib/server/storage.js';
import type { Actions, PageServerLoad } from './$types';

// Read from the database, not locals: after a save, locals still hold the old profile.
export const load: PageServerLoad = async (event) => {
	const { member, user } = requireMember(event);
	const profile = await getMember(getEnv(), member.id);
	if (!profile) throw new Error(`settings/profile: signed-in member ${member.id} not found`);
	return {
		profile: {
			name: profile.name,
			username: profile.username,
			email: profile.email,
			avatarUrl: profile.avatarKey ? getObjectUrl(profile.avatarKey) : null,
			coverUrl: profile.coverKey ? getObjectUrl(profile.coverKey) : null
		},
		theme: user.theme
	};
};

export const actions: Actions = {
	default: async (event) => {
		const { user } = requireMember(event);
		const saved = await saveProfileForm(getEnv(), user.id, await event.request.formData());
		if (!saved.ok) return fail(400, { message: saved.message });
		return { saved: true };
	}
};
