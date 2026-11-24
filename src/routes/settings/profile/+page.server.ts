import { getEnv } from '#lib/server/platform.js';
import { fail } from '@sveltejs/kit';
import { pendingEmailChange, requestEmailChange } from '#lib/server/auth/email-change.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { getMember } from '#lib/server/members.js';
import { roomPath } from '#lib/server/calls/rooms.js';
import { saveProfileForm } from '#lib/server/people/profile-form.js';
import { getOrg } from '#lib/server/org.js';
import { getObjectUrl } from '#lib/server/storage.js';
import { auth } from '#lib/strings/auth.js';
import type { Actions, PageServerLoad } from './$types';

// Read from the database, not locals: after a save, locals still hold the old profile.
export const load: PageServerLoad = async (event) => {
	const { member, user } = requireMember(event);
	const env = getEnv();
	const profile = await getMember(env, member.id);
	if (!profile) throw new Error(`settings/profile: signed-in member ${member.id} not found`);
	return {
		profile: {
			name: profile.name,
			username: profile.username,
			email: profile.email,
			avatarUrl: profile.avatarKey ? getObjectUrl(profile.avatarKey) : null,
			coverUrl: profile.coverKey ? getObjectUrl(profile.coverKey) : null
		},
		pendingEmail: await pendingEmailChange(env, user.id),
		theme: user.theme,
		roomPath: roomPath(profile)
	};
};

export const actions: Actions = {
	saveProfile: async (event) => {
		const { user } = requireMember(event);
		const saved = await saveProfileForm(getEnv(), user.id, await event.request.formData());
		if (!saved.ok) return fail(400, { message: saved.message });
		return { saved: true };
	},
	changeEmail: async (event) => {
		const { user } = requireMember(event);
		const env = getEnv();
		const email = String((await event.request.formData()).get('email') ?? '');
		const asked = await requestEmailChange(env, {
			userId: user.id,
			newEmail: email,
			ip: event.getClientAddress(),
			origin: event.url.origin,
			orgName: (await getOrg(env)).name
		});
		if (!asked.ok) return fail(400, { emailMessage: auth.emailChange.errors[asked.reason] });
		return { emailSent: asked.newEmail };
	}
};
