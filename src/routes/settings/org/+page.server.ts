import { getEnv } from '#lib/server/platform.js';
import { fail } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { googleConfigured } from '#lib/server/auth/google.js';
import { aiConfigured } from '#lib/server/ai/summaries.js';
import { calcomAvailable } from '#lib/server/calcom/calcom.js';
import { getOrg, parseDomainSetting, updateOrg } from '#lib/server/org.js';
import { getObjectUrl, saveImage } from '#lib/server/storage.js';
import { auth } from '#lib/strings/auth.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireMember(event, 'admin');
	const env = getEnv();
	const org = await getOrg(env);
	return {
		org: {
			name: org.name,
			allowedEmailDomain: org.allowedEmailDomain ?? '',
			domainJoin: org.domainJoin,
			googleSignIn: org.googleSignIn,
			aiEnabled: org.aiEnabled,
			calcomEnabled: org.calcomEnabled,
			publicPosts: org.publicPosts,
			publicPostsIndexable: org.publicPostsIndexable,
			logoUrl: org.logoKey ? getObjectUrl(org.logoKey) : null
		},
		googleConfigured: googleConfigured(env),
		aiConfigured: aiConfigured(env),
		calcomAvailable: calcomAvailable(env)
	};
};

export const actions: Actions = {
	default: async (event) => {
		requireMember(event, 'admin');
		const env = getEnv();
		const form = await event.request.formData();
		const { errors } = auth.orgSettings;
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { message: errors.nameMissing });
		const domain = parseDomainSetting(form);
		if (!domain.ok) return fail(400, { message: domain.message });
		const changes = {
			name,
			...domain.changes,
			googleSignIn: form.get('google') === 'on',
			aiEnabled: form.get('ai') === 'on',
			publicPosts: form.get('publicPosts') === 'on',
			publicPostsIndexable: form.get('publicPostsIndexable') === 'on',
			...(calcomAvailable(env) && { calcomEnabled: form.get('calcom') === 'on' })
		};
		const logo = form.get('logo');
		if (logo instanceof File && logo.size > 0) {
			const saved = await saveImage(env, 'org', logo);
			if (!saved.ok) return fail(400, { message: saved.message });
			await updateOrg(env, { ...changes, logoKey: saved.key });
		} else {
			await updateOrg(env, changes);
		}
		return { saved: true };
	}
};
