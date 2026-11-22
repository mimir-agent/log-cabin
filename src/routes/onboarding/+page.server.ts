import { getEnv } from '#lib/server/platform.js';
import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import type { SignedIn } from '#lib/server/auth/session.js';
import { roles } from '#lib/server/db/schema/index.js';
import { inviteFromForm } from '#lib/server/invites.js';
import { getMember } from '#lib/server/members.js';
import {
	moveOnboarding,
	neighbours,
	onboardingOf,
	type Onboarding,
	type OnboardingStep
} from '#lib/server/onboarding.js';
import { getOrg, parseDomainSetting, updateOrg } from '#lib/server/org.js';
import { saveProfileForm, type ProfileField } from '#lib/server/people/profile-form.js';
import { loadProject } from '#lib/server/posts/access.js';
import { joinProject, listProjects, removeProjectMember } from '#lib/server/posts/projects.js';
import { getObjectUrl, saveImage } from '#lib/server/storage.js';
import type { Actions, PageServerLoad } from './$types';

/** The projects step's rows: open projects they can join, and any they're already in. */
async function projectChoices(env: Env, who: SignedIn) {
	const open = await listProjects(env, who, false);
	return open
		.filter((project) => project.isMember || !project.private)
		.map(({ id, name, description, isMember }) => ({ id, name, description, isMember }));
}

export const load: PageServerLoad = async (event) => {
	const who = requireMember(event);
	const env = getEnv();
	const onboarding = await onboardingOf(env, who);
	if (!onboarding) redirect(303, '/');
	if (onboarding.unstarted) await moveOnboarding(env, who.member.id, onboarding.step);
	const { step, steps } = onboarding;
	const org = await getOrg(env);
	const profile = step === 'profile' ? await getMember(env, who.member.id) : undefined;
	return {
		step,
		position: steps.indexOf(step) + 1,
		count: steps.length,
		last: neighbours(onboarding).next === 'done',
		backwards: event.url.searchParams.has('back'),
		org: {
			name: org.name,
			logoUrl: org.logoKey ? getObjectUrl(org.logoKey) : null,
			domain: org.allowedEmailDomain ?? '',
			domainJoin: org.domainJoin
		},
		profile: profile && {
			name: profile.name,
			username: profile.username,
			avatarUrl: profile.avatarKey ? getObjectUrl(profile.avatarKey) : null
		},
		projects: step === 'projects' ? await projectChoices(env, who) : [],
		roles: [...roles]
	};
};

/** A field on a step's form, for the error to show under. */
type Field = 'logo' | 'domain' | ProfileField | 'emails';

/** Refuses the step with an error under `field`, and hands back what was typed in its fields. */
function refuse(form: FormData, field: Field, message: string) {
	const typed: Record<string, string> = {};
	for (const [name, value] of form) if (typeof value === 'string') typed[name] = value;
	return fail(400, { field, message, typed });
}

/**
 * Saves the current step's form. Returns what the page shows instead of moving on (an error
 * under its field, or the addresses an invite skipped), or null to move on.
 */
async function saveStep(
	event: RequestEvent,
	who: SignedIn,
	onboarding: Onboarding,
	form: FormData
) {
	const env = getEnv();
	switch (onboarding.step) {
		case 'org': {
			const domain = parseDomainSetting(form);
			if (!domain.ok) return refuse(form, 'domain', domain.message);
			const logo = form.get('logo');
			if (logo instanceof File && logo.size > 0) {
				const saved = await saveImage(env, 'org', logo);
				if (!saved.ok) return refuse(form, 'logo', saved.message);
				await updateOrg(env, { logoKey: saved.key });
			}
			await updateOrg(env, domain.changes);
			return null;
		}
		case 'profile': {
			const saved = await saveProfileForm(env, who.user.id, form);
			return saved.ok ? null : refuse(form, saved.field, saved.message);
		}
		case 'projects': {
			const chosen = new Set(form.getAll('project').map(String));
			for (const project of await projectChoices(env, who)) {
				if (chosen.has(project.id) === project.isMember) continue;
				const loaded = await loadProject(env, who, project.id);
				if (project.isMember) await removeProjectMember(env, who, loaded, who.user.id);
				else await joinProject(env, who, loaded);
			}
			return null;
		}
		case 'invite': {
			// Continue with the box left empty moves on, as Skip does.
			if (!String(form.get('emails') ?? '').trim()) return null;
			const outcome = await inviteFromForm(env, who, form, event.url.origin);
			if (!outcome.ok) return refuse(form, 'emails', outcome.message);
			// Stay on the step to show what wasn't sent; Continue then moves on.
			return outcome.notSent.length
				? { report: { sent: outcome.sent.length, notSent: outcome.notSent } }
				: null;
		}
	}
}

/** The signed-in member and where they are in onboarding; sends them Home once it's finished. */
async function requireOnboarding(event: RequestEvent) {
	const who = requireMember(event);
	const onboarding = await onboardingOf(getEnv(), who);
	if (!onboarding) redirect(303, '/');
	return { who, onboarding };
}

async function moveTo(who: SignedIn, to: OnboardingStep | 'done'): Promise<never> {
	await moveOnboarding(getEnv(), who.member.id, to);
	redirect(303, to === 'done' ? '/' : '/onboarding');
}

export const actions: Actions = {
	continue: async (event) => {
		const { who, onboarding } = await requireOnboarding(event);
		const stay = await saveStep(event, who, onboarding, await event.request.formData());
		if (stay) return stay;
		return moveTo(who, neighbours(onboarding).next);
	},
	skip: async (event) => {
		const { who, onboarding } = await requireOnboarding(event);
		return moveTo(who, neighbours(onboarding).next);
	},
	back: async (event) => {
		const { who, onboarding } = await requireOnboarding(event);
		await moveOnboarding(getEnv(), who.member.id, neighbours(onboarding).previous);
		redirect(303, '/onboarding?back');
	},
	// From the banner on Home: stop offering the rest.
	dismiss: async (event) => {
		const { who } = await requireOnboarding(event);
		return moveTo(who, 'done');
	}
};
