import { describe, expect, it, vi } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import { completeSignIn, signInFacts } from '#lib/server/auth/sign-in.js';
import type { JobMessage } from '#lib/server/events.js';
import { consumeJobs } from '#lib/server/jobs/index.js';
import { inviteEmails } from '#lib/server/invites.js';
import { listJoinRequests } from '#lib/server/join-requests.js';
import { listMembers } from '#lib/server/members.js';
import { updateOrg } from '#lib/server/org.js';
import { createOrgAndAdmin } from '#lib/server/setup.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { actions as inviteActions } from '../invite/[token]/+page.server';
import { actions, load } from './+page.server';

const origin = 'https://campfire.test';

async function orgAtDomain(domainJoin: 'off' | 'direct' | 'request') {
	const { DB, sqlite } = fakeD1();
	const jobs: JobMessage[] = [];
	const env = {
		DB,
		JOBS: { send: async (job: JobMessage) => void jobs.push(job) },
		EMAIL_TRANSPORT: 'log',
		EMAIL_FROM: 'Log Cabin <campfire@example.com>',
		REALTIME: {
			idFromName: (topic: string) => topic,
			get: () => ({ fetch: async () => new Response(null, { status: 204 }) })
		}
	} as unknown as Env;
	useTestEnv(env);
	await createOrgAndAdmin(env, { orgName: 'Acme', adminName: 'Ada', email: 'ada@acme.test' });
	await updateOrg(env, { allowedEmailDomain: 'acme.test', domainJoin });
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
		sqlite.prepare('SELECT to_address, subject, text_body FROM dev_mail ORDER BY rowid').all() as {
			to_address: string;
			subject: string;
			text_body: string;
		}[];
	const signIn = async (email: string, name: string) =>
		completeSignIn(env, await signInFacts(env, email, true), name, origin);
	const isMember = async (email: string) =>
		(await listMembers(env, { query: '', includeDeactivated: true })).some(
			(m) => m.email === email
		);
	const inbox = (userId: string) =>
		sqlite
			.prepare('SELECT kind, actor_id, url, title FROM notifications WHERE user_id = ?')
			.all(userId);
	/** Hands the queued events to the JOBS consumer, as the queue would. */
	const runJobs = async () => {
		const batch = jobs.splice(0).map((body) => ({ body, ack: () => {}, retry: () => {} }));
		await consumeJobs({ messages: batch } as unknown as MessageBatch<JobMessage>, env);
	};
	const jobLog = () =>
		sqlite.prepare('SELECT kind, status, error FROM job_log').all() as {
			kind: string;
			status: string;
			error: string | null;
		}[];
	return { env, sqlite, ada, mails, signIn, isMember, inbox, runJobs, jobLog };
}

/** Runs one of the members page's request actions as `who`, the way a form post would. */
function post(who: SignedIn, action: 'approve' | 'approveAll' | 'deny', userId = '') {
	const body = new FormData();
	body.set('userId', userId);
	const url = new URL(`${origin}/members?/${action}`);
	return actions[action]({
		locals: who,
		url,
		request: new Request(url, { method: 'POST', body })
	} as unknown as Parameters<(typeof actions)['approve']>[0]);
}

describe('joining with an address at the org’s domain', () => {
	it('refuses everyone without an invite when the setting needs one', async () => {
		const { signIn, isMember } = await orgAtDomain('off');

		expect(await signIn('rita@acme.test', 'Rita')).toEqual({
			kind: 'refused',
			reason: 'notMember'
		});
		expect(await isMember('rita@acme.test')).toBe(false);
	});

	it('makes them a member at once when the setting is to join directly', async () => {
		const { signIn, isMember } = await orgAtDomain('direct');

		expect(await signIn('rita@acme.test', 'Rita')).toMatchObject({ kind: 'signed-in' });
		expect(await isMember('rita@acme.test')).toBe(true);
	});

	it('still refuses an address at another domain', async () => {
		const { signIn } = await orgAtDomain('request');

		expect(await signIn('rita@elsewhere.test', 'Rita')).toEqual({
			kind: 'refused',
			reason: 'notMember'
		});
	});
});

describe('join requests', () => {
	it('tells every admin in their inbox and by email, once, without making a member', async () => {
		const { env, ada, mails, signIn, isMember, inbox, runJobs } = await orgAtDomain('request');

		expect(await signIn('rita@acme.test', 'Rita')).toEqual({ kind: 'asked', pending: false });
		await runJobs();
		expect(await isMember('rita@acme.test')).toBe(false);
		const [request] = await listJoinRequests(env);
		expect(request).toMatchObject({ name: 'Rita', email: 'rita@acme.test' });
		expect(inbox(ada.user.id)).toEqual([
			{
				kind: 'join_request',
				actor_id: request.userId,
				url: '/members?view=requests',
				title: 'rita@acme.test'
			}
		]);
		expect(mails()).toEqual([
			expect.objectContaining({
				to_address: 'ada@acme.test',
				subject: 'Rita asked to join Acme',
				text_body: expect.stringContaining(`${origin}/members?view=requests`)
			})
		]);

		expect(
			await signIn('rita@acme.test', 'Rita'),
			'signing in again while waiting asks nobody again'
		).toEqual({ kind: 'asked', pending: true });
		await runJobs();
		expect(mails()).toHaveLength(1);
		expect(await listJoinRequests(env)).toHaveLength(1);
	});

	it('keeps the request when telling the admins fails, and the requester stays asked', async () => {
		const { env, signIn, isMember, runJobs, jobLog } = await orgAtDomain('request');
		vi.stubGlobal('fetch', async () => new Response('daily quota reached', { status: 429 }));
		Object.assign(env, { EMAIL_TRANSPORT: 'resend', RESEND_API_KEY: 'test-key' });

		try {
			expect(await signIn('rita@acme.test', 'Rita')).toEqual({ kind: 'asked', pending: false });
			await runJobs();
		} finally {
			vi.unstubAllGlobals();
			Object.assign(env, { EMAIL_TRANSPORT: 'log', RESEND_API_KEY: undefined });
		}

		expect(jobLog(), 'the queue retries the failed mail').toEqual([
			{ kind: 'join.requested', status: 'failed', error: expect.stringContaining('429') }
		]);
		expect(await listJoinRequests(env)).toMatchObject([{ email: 'rita@acme.test' }]);
		expect(await isMember('rita@acme.test')).toBe(false);
		expect(await signIn('rita@acme.test', 'Rita')).toEqual({ kind: 'asked', pending: true });
	});

	it('makes the person a member on approval and emails them, after which they sign in', async () => {
		const { env, ada, mails, signIn, isMember } = await orgAtDomain('request');
		await signIn('rita@acme.test', 'Rita');
		const [request] = await listJoinRequests(env);

		expect(await post(ada, 'approve', request.userId)).toEqual({
			done: 'Rita is now a member.'
		});

		expect(await isMember('rita@acme.test')).toBe(true);
		expect(await listJoinRequests(env)).toEqual([]);
		expect(mails().at(-1)).toMatchObject({
			to_address: 'rita@acme.test',
			subject: 'You’ve joined Acme',
			text_body: expect.stringContaining(`${origin}/login`)
		});
		expect(await signIn('rita@acme.test', 'Rita')).toEqual({
			kind: 'signed-in',
			userId: request.userId
		});
	});

	it('emails the person when denied, leaves them out, and lets them ask again', async () => {
		const { env, ada, mails, signIn, isMember, inbox } = await orgAtDomain('request');
		await signIn('rita@acme.test', 'Rita');
		const [request] = await listJoinRequests(env);

		expect(await post(ada, 'deny', request.userId)).toEqual({
			done: 'Rita’s request was denied.'
		});

		expect(await isMember('rita@acme.test')).toBe(false);
		expect(await listJoinRequests(env)).toEqual([]);
		expect(inbox(ada.user.id), 'the answered request leaves the admin’s inbox').toEqual([]);
		expect(mails().at(-1)).toMatchObject({
			to_address: 'rita@acme.test',
			subject: 'Your request to join Acme'
		});
		expect(await post(ada, 'approve', request.userId), 'an answered request is gone').toMatchObject(
			{ status: 410 }
		);
		expect(await signIn('rita@acme.test', 'Rita')).toEqual({ kind: 'asked', pending: false });
	});

	it('lets someone who is waiting join through an invite instead, closing their request', async () => {
		const { env, ada, signIn, isMember } = await orgAtDomain('request');
		await signIn('rita@acme.test', 'Rita');
		const [request] = await listJoinRequests(env);
		await inviteEmails(env, {
			emails: ['rita@acme.test'],
			role: 'viewer',
			projectIds: [],
			invitedBy: { memberId: ada.member.id, name: ada.user.name },
			orgName: 'Acme',
			origin
		});

		expect(await signIn('rita@acme.test', 'Rita')).toEqual({
			kind: 'signed-in',
			userId: request.userId
		});
		expect(await isMember('rita@acme.test')).toBe(true);
		expect(await listJoinRequests(env)).toEqual([]);
	});

	it('lets someone who is waiting open an emailed invite instead, closing their request', async () => {
		const { env, ada, mails, signIn, isMember } = await orgAtDomain('request');
		await signIn('rita@acme.test', 'Rita');
		const [request] = await listJoinRequests(env);
		await inviteEmails(env, {
			emails: ['rita@acme.test'],
			role: 'viewer',
			projectIds: [],
			invitedBy: { memberId: ada.member.id, name: ada.user.name },
			orgName: 'Acme',
			origin
		});
		const token = mails()
			.at(-1)!
			.text_body.match(/\/invite\/([\w-]+)/)![1];
		const body = new FormData();
		body.set('name', 'Rita');
		const accepting = inviteActions.accept({
			params: { token },
			request: new Request(`${origin}/invite/${token}?/accept`, { method: 'POST', body }),
			cookies: { set: () => {} }
		} as unknown as Parameters<(typeof inviteActions)['accept']>[0]);

		await expect(accepting).rejects.toMatchObject({ status: 303, location: '/' });
		expect(await isMember('rita@acme.test')).toBe(true);
		expect(await signIn('rita@acme.test', 'Rita')).toEqual({
			kind: 'signed-in',
			userId: request.userId
		});
		expect(await listJoinRequests(env)).toEqual([]);
	});

	it('lets someone who is waiting join once the setting is to join directly', async () => {
		const { env, signIn, isMember } = await orgAtDomain('request');
		await signIn('rita@acme.test', 'Rita');
		const [request] = await listJoinRequests(env);
		await updateOrg(env, { domainJoin: 'direct' });

		expect(await signIn('rita@acme.test', 'Rita')).toEqual({
			kind: 'signed-in',
			userId: request.userId
		});
		expect(await isMember('rita@acme.test')).toBe(true);
		expect(await listJoinRequests(env)).toEqual([]);
	});

	it('approves every waiting request at once', async () => {
		const { env, ada, mails, signIn, isMember } = await orgAtDomain('request');
		for (const name of ['Rita', 'Sam', 'Tess', 'Uma']) {
			await signIn(`${name.toLowerCase()}@acme.test`, name);
		}

		expect(await post(ada, 'approveAll')).toEqual({ done: 'Approved 4 requests.' });

		expect(await listJoinRequests(env)).toEqual([]);
		for (const email of ['rita@acme.test', 'sam@acme.test', 'tess@acme.test', 'uma@acme.test']) {
			expect(await isMember(email), email).toBe(true);
		}
		expect(mails().filter((m) => m.subject === 'You’ve joined Acme')).toHaveLength(4);
		const member: SignedIn = { ...ada, member: { ...ada.member, role: 'member' } };
		await expect(post(member, 'approveAll')).rejects.toMatchObject({ status: 403 });
	});

	it('shows admins the waiting requests, newest first, under Members → Requests', async () => {
		const { ada, signIn } = await orgAtDomain('request');
		vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });
		try {
			await signIn('rita@acme.test', 'Rita');
			vi.setSystemTime(Date.now() + 60_000);
			await signIn('sam@acme.test', 'Sam');
		} finally {
			vi.useRealTimers();
		}
		const event = (who: SignedIn, path = '/members?view=requests') =>
			({ locals: who, url: new URL(`${origin}${path}`) }) as unknown as Parameters<typeof load>[0];

		expect(await load(event(ada))).toMatchObject({
			view: 'requests',
			requests: [
				{ name: 'Sam', email: 'sam@acme.test', avatarUrl: null },
				{ name: 'Rita', email: 'rita@acme.test', avatarUrl: null }
			]
		});
		expect(await load(event(ada, '/members'))).toMatchObject({ view: 'members' });
		const member: SignedIn = { ...ada, member: { ...ada.member, role: 'member' } };
		expect(await load(event(member))).toMatchObject({ view: 'members', requests: [] });
		await expect(post(member, 'approve', 'anyone')).rejects.toMatchObject({ status: 403 });
	});
});
