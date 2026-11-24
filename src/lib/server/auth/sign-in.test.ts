import { describe, expect, it } from 'vitest';
import { fakeD1 } from '../testing/fake-d1';
import { createOrgAndAdmin } from '../setup';
import { acceptInvite, inviteEmails, openInviteForEmail, type Invite } from '../invites';
import { listMembers } from '../members';
import { completeSignIn, decideSignIn, signInFacts, type SignInFacts } from './sign-in';

const stranger: SignInFacts = {
	email: 'sam@example.com',
	emailVerified: true,
	member: null,
	invite: null,
	allowedDomain: null,
	domainJoin: 'direct',
	waitingUserId: null
};

const invite = {
	id: 'inv1',
	tokenHash: 'h',
	email: 'sam@example.com',
	role: 'viewer',
	invitedBy: 'm1',
	expiresAt: Date.now() + 1000,
	acceptedAt: null,
	revokedAt: null,
	createdAt: Date.now()
} satisfies Invite & { email: string };

describe('decideSignIn', () => {
	it('signs in an active member', () => {
		expect(decideSignIn({ ...stranger, member: { userId: 'u1', deactivated: false } })).toEqual({
			kind: 'sign-in',
			userId: 'u1'
		});
	});

	it('refuses a deactivated member', () => {
		expect(decideSignIn({ ...stranger, member: { userId: 'u1', deactivated: true } })).toEqual({
			kind: 'refuse',
			reason: 'deactivated'
		});
	});

	it('refuses an unverified email even when it belongs to a member', () => {
		expect(
			decideSignIn({
				...stranger,
				emailVerified: false,
				member: { userId: 'u1', deactivated: false }
			})
		).toEqual({ kind: 'refuse', reason: 'unverified' });
	});

	it('lets a pending invitee accept their invite', () => {
		expect(decideSignIn({ ...stranger, invite })).toEqual({ kind: 'accept-invite', invite });
	});

	it('lets a stranger at the allowed domain join as a member', () => {
		expect(decideSignIn({ ...stranger, allowedDomain: 'example.com' })).toEqual({
			kind: 'join',
			role: 'member'
		});
	});

	it('refuses a stranger at another domain, or when no domain is allowed', () => {
		expect(decideSignIn({ ...stranger, allowedDomain: 'acme.test' })).toEqual({
			kind: 'refuse',
			reason: 'notMember'
		});
		expect(decideSignIn({ ...stranger, allowedDomain: null })).toEqual({
			kind: 'refuse',
			reason: 'notMember'
		});
	});

	it('requires the domain to match exactly: a subdomain is not the allowed domain', () => {
		expect(
			decideSignIn({ ...stranger, email: 'sam@sub.example.com', allowedDomain: 'example.com' })
		).toEqual({ kind: 'refuse', reason: 'notMember' });
	});

	it('refuses a stranger at the domain when the domain setting needs an invite', () => {
		expect(decideSignIn({ ...stranger, allowedDomain: 'example.com', domainJoin: 'off' })).toEqual({
			kind: 'refuse',
			reason: 'notMember'
		});
	});

	it('lets a stranger at the domain ask to join, once, when the setting is to ask', () => {
		const asking = { ...stranger, allowedDomain: 'example.com', domainJoin: 'request' } as const;
		expect(decideSignIn(asking)).toEqual({ kind: 'ask', pending: false });
		expect(decideSignIn({ ...asking, waitingUserId: 'u-waiting' })).toEqual({
			kind: 'ask',
			pending: true
		});
	});
});

describe('completeSignIn', () => {
	it('turns a pending invitee into a member with the invite’s role, once', async () => {
		const { DB } = fakeD1();
		const env = {
			DB,
			EMAIL_TRANSPORT: 'log',
			EMAIL_FROM: 'Log Cabin <campfire@example.com>'
		} as Env;
		await createOrgAndAdmin(env, { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' });
		const [admin] = await listMembers(env, { query: '', includeDeactivated: false });
		await inviteEmails(env, {
			emails: ['sam@example.com'],
			role: 'viewer',
			projectIds: [],
			invitedBy: { memberId: admin.id, name: admin.name },
			orgName: 'Acme',
			origin: 'https://campfire.test'
		});
		const pending = await openInviteForEmail(env, 'sam@example.com');

		const facts = await signInFacts(env, 'sam@example.com', true);
		const result = await completeSignIn(env, facts, 'Sam', 'https://campfire.test');

		expect(result.kind).toBe('signed-in');
		const sam = (await listMembers(env, { query: 'Sam', includeDeactivated: true }))[0];
		expect(sam, 'expected Sam to be a member after signing in').toMatchObject({
			email: 'sam@example.com',
			role: 'viewer'
		});
		expect(
			await acceptInvite(env, { ...pending!, email: 'sam@example.com' }, 'Sam again', null),
			'an accepted invite must not be accepted a second time'
		).toBeNull();
	});
});
