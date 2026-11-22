import { eq, lt } from 'drizzle-orm';
import { db, schema } from './db';
import type { Role } from './db/schema';
import type { SignedIn } from './auth/session';

// After the first sign-in a member goes through a few steps: their profile, the projects to
// join, and inviting teammates. The org's first admin starts with the org's own logo and email
// domain. Every step can be skipped, and leaving midway resumes at the same step next time.

export const onboardingSteps = ['org', 'profile', 'projects', 'invite'] as const;
export type OnboardingStep = (typeof onboardingSteps)[number];

/**
 * The steps this member goes through, in order. Guests join no projects themselves, and only
 * admins invite.
 */
export function stepsFor(role: Role, firstAdmin: boolean): OnboardingStep[] {
	return onboardingSteps.filter((step) => {
		switch (step) {
			case 'org':
				return firstAdmin;
			case 'profile':
				return true;
			case 'projects':
				return role !== 'guest';
			case 'invite':
				return role === 'admin';
		}
	});
}

export type Onboarding = {
	steps: OnboardingStep[];
	step: OnboardingStep;
	/** They haven't opened onboarding yet, so it should open for them. */
	unstarted: boolean;
};

/** Where this member is in onboarding, or null once they finished or dismissed it. */
export async function onboardingOf(env: Env, who: SignedIn): Promise<Onboarding | null> {
	const { members } = schema;
	const d = db(env);
	const row = await d
		.select({
			step: members.onboardingStep,
			onboardedAt: members.onboardedAt,
			createdAt: members.createdAt
		})
		.from(members)
		.where(eq(members.id, who.member.id))
		.get();
	if (!row) throw new Error(`onboardingOf: expected member ${who.member.id}, found none`);
	if (row.onboardedAt !== null) return null;
	const earlier = await d
		.select({ id: members.id })
		.from(members)
		.where(lt(members.createdAt, row.createdAt))
		.get();
	const steps = stepsFor(who.member.role, who.member.role === 'admin' && !earlier);
	const saved = steps.find((step) => step === row.step);
	return { steps, step: saved ?? steps[0], unstarted: row.step === null };
}

/** Moves this member to `to`, or ends onboarding with 'done'. */
export async function moveOnboarding(
	env: Env,
	memberId: string,
	to: OnboardingStep | 'done',
	now = Date.now()
): Promise<void> {
	await db(env)
		.update(schema.members)
		.set(to === 'done' ? { onboardingStep: null, onboardedAt: now } : { onboardingStep: to })
		.where(eq(schema.members.id, memberId));
}

/** The step after this one, or 'done' after the last; the one before it, or itself at the first. */
export function neighbours(onboarding: Onboarding): {
	next: OnboardingStep | 'done';
	previous: OnboardingStep;
} {
	const { steps } = onboarding;
	const i = steps.indexOf(onboarding.step);
	return {
		next: i + 1 < steps.length ? steps[i + 1] : 'done',
		previous: steps[Math.max(i - 1, 0)]
	};
}
