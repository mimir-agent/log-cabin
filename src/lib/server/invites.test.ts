import { describe, expect, it, vi } from 'vitest';
import { fakeD1 } from './testing/fake-d1';
import { createOrgAndAdmin } from './setup';
import { listMembers } from './members';
import {
	acceptInvite,
	checkStarterProjects,
	createInviteLink,
	emailsIn,
	findOpenInvite,
	inviteEmails,
	listOpenInvites,
	requestInviteFromLink,
	revokeInvite
} from './invites';
import type { SignedIn } from './auth/session';
import type { Role } from './db/schema';
import { listProjects, createProject } from './posts/projects';

const origin = 'https://campfire.test';
const day = 24 * 60 * 60 * 1000;

async function orgWithAdmin() {
	const { DB, sqlite } = fakeD1();
	const env = { DB, EMAIL_TRANSPORT: 'log', EMAIL_FROM: 'Campfire <campfire@example.com>' } as Env;
	await createOrgAndAdmin(env, { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' });
	const [admin] = await listMembers(env, { query: '', includeDeactivated: false });
	const ada: SignedIn = {
		user: {
			id: admin.userId,
			name: admin.name,
			username: admin.username,
			email: admin.email,
			avatarUrl: null,
			theme: 'system'
		},
		member: { id: admin.id, role: 'admin' }
	};
	const mails = () =>
		sqlite.prepare('SELECT to_address, subject, text_body FROM dev_mail').all() as {
			to_address: string;
			subject: string;
			text_body: string;
		}[];
	const inviteMany = (emails: string[], role: Role, projectIds: string[] = []) =>
		inviteEmails(env, {
			emails,
			role,
			projectIds,
			invitedBy: { memberId: admin.id, name: admin.name },
			orgName: 'Acme',
			origin
		});
	const invite = (email: string, role: Role) => inviteMany([email], role);
	return { env, sqlite, admin, ada, mails, invite, inviteMany };
}

function tokenFromMail(body: string): string {
	const match = body.match(/\/invite\/([A-Za-z0-9_-]+)/);
	if (!match) throw new Error(`expected an /invite/<token> link in the mail body, got: ${body}`);
	return match[1];
}

async function memberRole(env: Env, email: string) {
	const all = await listMembers(env, { query: '', includeDeactivated: true });
	return all.find((m) => m.email === email)?.role;
}

describe('email invites', () => {
	it('emails a link that opens the invite, and accepting it makes a member with that role once', async () => {
		const { env, mails, invite } = await orgWithAdmin();

		expect(await invite('sam@example.com', 'viewer')).toEqual({
			ok: true,
			sent: ['sam@example.com'],
			notSent: []
		});
		const sent = mails();
		expect(sent, 'expected exactly one invite email').toHaveLength(1);
		expect(sent[0].to_address).toBe('sam@example.com');

		const opened = await findOpenInvite(env, tokenFromMail(sent[0].text_body));
		expect(opened, 'expected the emailed link to open an invite').toMatchObject({
			email: 'sam@example.com',
			role: 'viewer'
		});

		const userId = await acceptInvite(env, { ...opened!, email: 'sam@example.com' }, 'Sam', null);
		expect(userId).not.toBeNull();
		expect(await memberRole(env, 'sam@example.com')).toBe('viewer');
		expect(
			await acceptInvite(env, { ...opened!, email: 'sam@example.com' }, 'Sam', null),
			'a second accept must not create another member'
		).toBeNull();
	});

	it('refuses to invite someone who is already a member', async () => {
		const { mails, invite } = await orgWithAdmin();

		expect(await invite('ada@example.com', 'member')).toMatchObject({
			sent: [],
			notSent: [{ email: 'ada@example.com', reason: 'member' }]
		});
		expect(mails()).toEqual([]);
	});

	it('stops opening once revoked', async () => {
		const { env, mails, invite } = await orgWithAdmin();
		await invite('sam@example.com', 'member');
		const token = tokenFromMail(mails()[0].text_body);
		const opened = (await findOpenInvite(env, token))!;

		await revokeInvite(env, opened.id);

		expect(await findOpenInvite(env, token)).toBeUndefined();
		expect(await listOpenInvites(env)).toEqual([]);
	});

	it('makes a guest member from a guest invite', async () => {
		const { env, mails, invite } = await orgWithAdmin();
		await invite('gus@example.com', 'guest');
		const opened = (await findOpenInvite(env, tokenFromMail(mails()[0].text_body)))!;

		await acceptInvite(env, { ...opened, email: 'gus@example.com' }, 'Gus', null);

		expect(await memberRole(env, 'gus@example.com')).toBe('guest');
	});
});

describe('invite links', () => {
	it('emails whoever asks through the link an invite with the link’s role', async () => {
		const { env, admin, mails } = await orgWithAdmin();
		const token = await createInviteLink(env, {
			role: 'viewer',
			invitedBy: admin.id,
			days: 7,
			projectIds: []
		});
		const link = (await findOpenInvite(env, token))!;
		expect(link, 'expected the new invite link to open').toBeDefined();

		await requestInviteFromLink(env, link, {
			email: 'rita@example.com',
			orgName: 'Acme',
			origin,
			inviterName: admin.name
		});

		const sent = mails();
		expect(sent).toHaveLength(1);
		expect(sent[0].to_address).toBe('rita@example.com');
		expect(await findOpenInvite(env, tokenFromMail(sent[0].text_body))).toMatchObject({
			email: 'rita@example.com',
			role: 'viewer'
		});
	});

	it('sends nothing when the requester is already a member', async () => {
		const { env, admin, mails } = await orgWithAdmin();
		const token = await createInviteLink(env, {
			role: 'member',
			invitedBy: admin.id,
			days: 7,
			projectIds: []
		});
		const link = (await findOpenInvite(env, token))!;

		await requestInviteFromLink(env, link, {
			email: 'ada@example.com',
			orgName: 'Acme',
			origin,
			inviterName: admin.name
		});

		expect(mails()).toEqual([]);
	});

	it('stops opening once expired', async () => {
		const { env, admin } = await orgWithAdmin();
		const now = Date.now();
		const token = await createInviteLink(
			env,
			{ role: 'member', invitedBy: admin.id, days: 1, projectIds: [] },
			now
		);

		expect(await findOpenInvite(env, token, now + day - 1)).toBeDefined();
		expect(await findOpenInvite(env, token, now + day + 1)).toBeUndefined();
	});
});

function signedIn(member: Awaited<ReturnType<typeof listMembers>>[number]): SignedIn {
	return {
		user: {
			id: member.userId,
			name: member.name,
			username: member.username,
			email: member.email,
			avatarUrl: null,
			theme: 'system'
		},
		member: { id: member.id, role: member.role }
	};
}

async function memberNamed(env: Env, name: string) {
	const found = (await listMembers(env, { query: name, includeDeactivated: false }))[0];
	if (!found) throw new Error(`expected a member named ${name}, found none`);
	return found;
}

async function projectNamesOf(env: Env, member: Awaited<ReturnType<typeof listMembers>>[number]) {
	return (await listProjects(env, signedIn(member), false))
		.filter((p) => p.isMember)
		.map((p) => p.name);
}

describe('bulk invites', () => {
	it('invites every valid address once and reports the invalid and the repeated ones', async () => {
		const { mails, inviteMany } = await orgWithAdmin();
		const valid = [
			'a@example.com',
			'b@example.com',
			'c@example.com',
			'd@example.com',
			'e@example.com'
		];

		const outcome = await inviteMany([...valid, 'not-an-address', 'c@example.com'], 'member');

		expect(outcome).toEqual({
			ok: true,
			sent: valid,
			notSent: [
				{ email: 'not-an-address', reason: 'invalid' },
				{ email: 'c@example.com', reason: 'repeated' }
			]
		});
		expect(mails().map((m) => m.to_address)).toEqual(valid);
	});

	it('reports an address that already has an open invite instead of inviting it again', async () => {
		const { mails, inviteMany } = await orgWithAdmin();
		await inviteMany(['sam@example.com'], 'member');

		const again = await inviteMany(['sam@example.com', 'ted@example.com'], 'member');

		expect(again).toMatchObject({
			sent: ['ted@example.com'],
			notSent: [{ email: 'sam@example.com', reason: 'invited' }]
		});
		expect(mails()).toHaveLength(2);
	});

	it('takes back the invite of an address its mail failed for, and still invites the rest', async () => {
		const { env, mails, inviteMany } = await orgWithAdmin();
		const addresses = ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com'];
		// The mail service answers the third send with its rate limit.
		const sentTo: string[] = [];
		vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
			const { to } = JSON.parse(String(init.body)) as { to: string[] };
			if (to[0] === 'c@example.com') return new Response('rate limited', { status: 429 });
			sentTo.push(...to);
			return Response.json({ id: 'sent' });
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		Object.assign(env, { EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 'test-key' });

		try {
			expect(await inviteMany(addresses, 'member')).toEqual({
				ok: true,
				sent: ['a@example.com', 'b@example.com', 'd@example.com'],
				notSent: [{ email: 'c@example.com', reason: 'mailFailed' }]
			});
		} finally {
			vi.unstubAllGlobals();
			vi.restoreAllMocks();
			Object.assign(env, { EMAIL_TRANSPORT: 'log', RESEND_API_KEY: undefined });
		}
		expect(sentTo).toEqual(['a@example.com', 'b@example.com', 'd@example.com']);
		expect((await listOpenInvites(env)).map((invite) => invite.email).sort()).toEqual([
			'a@example.com',
			'b@example.com',
			'd@example.com'
		]);

		expect(await inviteMany(['c@example.com'], 'member'), 'inviting it again works').toEqual({
			ok: true,
			sent: ['c@example.com'],
			notSent: []
		});
		expect(mails().map((m) => m.to_address)).toEqual(['c@example.com']);
	});

	it('refuses more than 100 addresses at once and sends nothing', async () => {
		const { mails, inviteMany } = await orgWithAdmin();
		const many = Array.from({ length: 101 }, (_, i) => `p${i}@example.com`);

		expect(await inviteMany(many, 'member')).toMatchObject({ ok: false });
		expect(mails()).toEqual([]);
	});

	it('reads pasted text whole and only the addresses from an uploaded file', () => {
		expect(emailsIn('A@example.com, b@example.com\nnope', 'paste')).toEqual([
			'a@example.com',
			'b@example.com',
			'nope'
		]);
		const csv = 'name,email\n"Sam Smith",sam@example.com\nTed,"ted@example.com"\n';
		expect(emailsIn(csv, 'file')).toEqual(['sam@example.com', 'ted@example.com']);
	});
});

describe('starter projects', () => {
	async function orgWithProjects() {
		const org = await orgWithAdmin();
		const design = await createProject(org.env, org.ada, {
			name: 'Design',
			description: '',
			private: false
		});
		const launch = await createProject(org.env, org.ada, {
			name: 'Launch',
			description: '',
			private: true
		});
		await createProject(org.env, org.ada, { name: 'Hiring', description: '', private: false });
		return { ...org, design, launch };
	}

	it('puts someone who accepts an email invite in its starter projects', async () => {
		const { env, mails, inviteMany, design, launch } = await orgWithProjects();
		await inviteMany(['sam@example.com'], 'member', [design, launch]);
		const opened = (await findOpenInvite(env, tokenFromMail(mails()[0].text_body)))!;

		await acceptInvite(env, { ...opened, email: 'sam@example.com' }, 'Sam', null);

		expect(await projectNamesOf(env, await memberNamed(env, 'Sam'))).toEqual(['Design', 'Launch']);
	});

	it('gives an invite asked for through a link the link’s starter projects', async () => {
		const { env, admin, mails, design, launch } = await orgWithProjects();
		const token = await createInviteLink(env, {
			role: 'member',
			invitedBy: admin.id,
			days: 7,
			projectIds: [design, launch]
		});
		await requestInviteFromLink(env, (await findOpenInvite(env, token))!, {
			email: 'rita@example.com',
			orgName: 'Acme',
			origin,
			inviterName: admin.name
		});
		const opened = (await findOpenInvite(env, tokenFromMail(mails()[0].text_body)))!;

		await acceptInvite(env, { ...opened, email: 'rita@example.com' }, 'Rita', null);

		expect(await projectNamesOf(env, await memberNamed(env, 'Rita'))).toEqual(['Design', 'Launch']);
	});

	it('refuses a starter project the inviter can’t add people to', async () => {
		const { env, ada, sqlite, mails, design, inviteMany } = await orgWithProjects();
		// A private project Ada doesn't belong to: even an admin can't see it, so adds nobody.
		sqlite
			.prepare(
				"INSERT INTO projects (id, name, description, private, created_by, created_at) VALUES ('secret', 'Secret', '', 1, ?, 0)"
			)
			.run(ada.user.id);

		expect(await checkStarterProjects(env, ada, [design, 'secret'])).toMatchObject({ ok: false });
		expect(await checkStarterProjects(env, ada, [design])).toEqual({
			ok: true,
			projectIds: [design]
		});

		await inviteMany(['viv@example.com'], 'viewer', [design]);
		const opened = (await findOpenInvite(env, tokenFromMail(mails()[0].text_body)))!;
		await acceptInvite(env, { ...opened, email: 'viv@example.com' }, 'Viv', null);
		const viv = signedIn(await memberNamed(env, 'Viv'));
		expect(
			await checkStarterProjects(env, viv, [design]),
			'a viewer adds nobody to a project, even one they are in'
		).toMatchObject({ ok: false });
	});

	it('shows a guest only the starter projects they were invited to', async () => {
		const { env, mails, inviteMany, design } = await orgWithProjects();
		await inviteMany(['gus@example.com'], 'guest', [design]);
		const opened = (await findOpenInvite(env, tokenFromMail(mails()[0].text_body)))!;

		await acceptInvite(env, { ...opened, email: 'gus@example.com' }, 'Gus', null);

		const gus = signedIn(await memberNamed(env, 'Gus'));
		expect((await listProjects(env, gus, false)).map((p) => p.name)).toEqual(['Design']);
	});
});
