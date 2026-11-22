import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { DomainJoin, Role } from '../db/schema';
import { acceptInvite, openInviteForEmail, type Invite } from '../invites';
import { askToJoin, waitingRequester } from '../join-requests';
import { createMember } from '../members';
import { auth } from '../../strings/auth';

// Who may sign in with an email address that a provider (an emailed link, Google) has
// vouched for. Both sign-in methods go through decideSignIn.

export type SignInFacts = {
	email: string;
	emailVerified: boolean;
	member: { userId: string; deactivated: boolean } | null;
	invite: (Invite & { email: string }) | null;
	allowedDomain: string | null;
	domainJoin: DomainJoin;
	/** Their users row, when they already asked to join and no admin has answered. */
	waitingUserId: string | null;
};

export type SignInError = keyof typeof auth.login.errors;

export type SignInDecision =
	| { kind: 'sign-in'; userId: string }
	| { kind: 'accept-invite'; invite: Invite & { email: string } }
	| { kind: 'join'; role: Role }
	| { kind: 'ask'; pending: boolean }
	| { kind: 'refuse'; reason: SignInError };

export function decideSignIn(facts: SignInFacts): SignInDecision {
	if (!facts.emailVerified) return { kind: 'refuse', reason: 'unverified' };
	if (facts.member?.deactivated) return { kind: 'refuse', reason: 'deactivated' };
	if (facts.member) return { kind: 'sign-in', userId: facts.member.userId };
	if (facts.invite) return { kind: 'accept-invite', invite: facts.invite };
	const domain = facts.email.split('@').pop();
	if (!facts.allowedDomain || domain !== facts.allowedDomain) {
		return { kind: 'refuse', reason: 'notMember' };
	}
	switch (facts.domainJoin) {
		case 'direct':
			return { kind: 'join', role: 'member' };
		case 'request':
			return { kind: 'ask', pending: facts.waitingUserId !== null };
		case 'off':
			return { kind: 'refuse', reason: 'notMember' };
	}
}

export async function signInFacts(
	env: Env,
	email: string,
	emailVerified: boolean,
	now = Date.now()
): Promise<SignInFacts> {
	const d = db(env);
	const member = await d
		.select({ userId: schema.users.id, deactivatedAt: schema.members.deactivatedAt })
		.from(schema.users)
		.innerJoin(schema.members, eq(schema.members.userId, schema.users.id))
		.where(eq(schema.users.email, email))
		.get();
	const org = await d
		.select({
			allowedDomain: schema.org.allowedEmailDomain,
			domainJoin: schema.org.domainJoin
		})
		.from(schema.org)
		.get();
	const invite = await openInviteForEmail(env, email, now);
	return {
		email,
		emailVerified,
		member: member ? { userId: member.userId, deactivated: member.deactivatedAt !== null } : null,
		invite: invite ? { ...invite, email } : null,
		allowedDomain: org?.allowedDomain ?? null,
		domainJoin: org?.domainJoin ?? 'off',
		waitingUserId: await waitingRequester(env, email)
	};
}

export type SignInOutcome =
	| { kind: 'signed-in'; userId: string }
	| { kind: 'asked'; pending: boolean }
	| { kind: 'refused'; reason: SignInError };

/**
 * Carries out the decision for a vouched-for email. `name` is used only when a new member or
 * join request is created. Says whom to start a session for, that they asked to join, or why
 * sign-in is refused.
 */
export async function completeSignIn(
	env: Env,
	facts: SignInFacts,
	name: string,
	origin: string,
	now = Date.now()
): Promise<SignInOutcome> {
	const decision = decideSignIn(facts);
	switch (decision.kind) {
		case 'sign-in':
			return { kind: 'signed-in', userId: decision.userId };
		case 'accept-invite': {
			const userId = await acceptInvite(env, decision.invite, name, facts.waitingUserId, now);
			if (!userId) return { kind: 'refused', reason: 'inviteUsed' };
			return { kind: 'signed-in', userId };
		}
		case 'join': {
			const { userId } = await createMember(
				env,
				{ email: facts.email, name, role: decision.role, existingUserId: facts.waitingUserId },
				now
			);
			return { kind: 'signed-in', userId };
		}
		case 'ask':
			if (!decision.pending) await askToJoin(env, { email: facts.email, name, origin }, now);
			return { kind: 'asked', pending: decision.pending };
		case 'refuse':
			return { kind: 'refused', reason: decision.reason };
	}
}

/** A name for someone who signs up by email alone: the part before the @. */
export function nameFromEmail(email: string): string {
	return email.split('@')[0];
}
