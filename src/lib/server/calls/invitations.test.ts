import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import type { JobMessage } from '#lib/server/events.js';
import { consumeJobs } from '#lib/server/jobs/index.js';
import { createProject } from '#lib/server/posts/projects.js';
import { joinCall, leaveCall, loadCall, startCall } from './calls';
import {
	answerInvitation,
	callInvitations,
	invitablePeople,
	inviteToCall,
	ringingFor
} from './invitations';
import type { CallPlace } from './places';
import { callsWorld, status, type SentJob } from './testing';

const vapid = {
	VAPID_PUBLIC_KEY:
		'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
	VAPID_PRIVATE_KEY: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
	EMAIL_FROM: 'Campfire <campfire@example.com>' as const
};

/** Ada is in a live call in the place (a public project unless given); Bo and Cy are members, Gus a guest. */
async function world(placeOf?: (people: { env: Env; ada: SignedIn }) => Promise<CallPlace>) {
	const w = await callsWorld(vapid);
	const ada = await w.person('Ada', 'member');
	const bo = await w.person('Bo', 'member');
	const cy = await w.person('Cy', 'member');
	const gus = await w.person('Gus', 'guest');
	const place = placeOf
		? await placeOf({ env: w.env, ada })
		: {
				kind: 'project' as const,
				id: await createProject(w.env, ada, { name: 'Ops', description: '', private: false })
			};
	const callId = await startCall(w.env, ada, place, 0);
	const adaIn = await joinCall(w.env, ada, await loadCall(w.env, ada, callId, 0), 0);
	const call = (who: SignedIn = ada) => loadCall(w.env, who, callId, 0);
	const invite = async (...people: SignedIn[]) =>
		inviteToCall(
			w.env,
			ada,
			await call(),
			people.map((p) => p.user.id),
			0
		);
	const statusOf = async (who: SignedIn) =>
		(await callInvitations(w.env, callId)).find((i) => i.inviteeId === who.user.id)?.status;
	/** What the queue does once the job's delay is over. */
	const deliver = async (job: SentJob) => {
		const message = { body: job.body as JobMessage, ack() {}, retry() {} };
		await consumeJobs({ messages: [message] } as unknown as MessageBatch<JobMessage>, w.env);
	};
	const inbox = (who: SignedIn) =>
		w.sqlite
			.prepare('SELECT kind, actor_id, url, title FROM notifications WHERE user_id = ?')
			.all(who.user.id);
	return { ...w, ada, bo, cy, gus, place, callId, adaIn, call, invite, statusOf, deliver, inbox };
}

describe('ringing someone into a call', () => {
	it("rings the invitee's open tabs, and joins them to the call when they accept", async () => {
		const { env, bo, callId, invite, online, published, jobs, statusOf, sfu } = await world();
		online.push(bo.user.id);

		await invite(bo);

		expect(published).toContainEqual({
			topic: `user:${bo.user.id}`,
			payload: { type: 'call.ring' }
		});
		expect(jobs).toContainEqual({
			body: expect.objectContaining({ kind: 'call.ring.timeout' }),
			delaySeconds: 30
		});
		expect(sfu.some((r) => r.url.startsWith('https://push'))).toBe(false);
		const [ring] = await ringingFor(env, bo, 1_000);
		expect(ring).toMatchObject({ callId, from: 'Ada', place: 'Ops' });

		expect(await answerInvitation(env, bo, ring.id, 'accept', 2_000)).toEqual({ callId });
		expect(await statusOf(bo)).toBe('accepted');
		expect(await ringingFor(env, bo, 2_000)).toEqual([]);
	});

	it('tells the caller when the invitee declines', async () => {
		const { env, bo, callId, invite, published, statusOf } = await world();
		await invite(bo);
		const [ring] = await ringingFor(env, bo, 1_000);
		published.length = 0;

		await answerInvitation(env, bo, ring.id, 'decline', 2_000);

		expect(await statusOf(bo)).toBe('declined');
		expect(published).toContainEqual({ topic: `call:${callId}`, payload: { type: 'invitations' } });
		expect(published).toContainEqual({
			topic: `user:${bo.user.id}`,
			payload: { type: 'call.ring' }
		});
	});

	it('puts a missed call in the inbox when nobody answers in 30 seconds, once', async () => {
		const { env, ada, bo, callId, invite, jobs, deliver, statusOf, inbox, sqlite } = await world();
		await invite(bo);
		const timeout = jobs.find((j) => j.body.kind === 'call.ring.timeout')!;

		await deliver(timeout);
		await deliver(timeout);

		expect(await statusOf(bo)).toBe('missed');
		expect(inbox(bo)).toEqual([
			{ kind: 'call', actor_id: ada.user.id, url: `/calls/${callId}`, title: 'Ops' }
		]);
		expect(await ringingFor(env, bo, 1_000)).toEqual([]);
		const { id } = sqlite.prepare('SELECT id FROM call_invitations').get() as { id: string };
		expect(await status(answerInvitation(env, bo, id, 'accept', 40_000))).toBe(410);
	});

	it('leaves an answered ring alone when its timeout arrives', async () => {
		const { env, bo, invite, jobs, deliver, statusOf, inbox } = await world();
		await invite(bo);
		const [ring] = await ringingFor(env, bo, 1_000);
		await answerInvitation(env, bo, ring.id, 'decline', 2_000);

		await deliver(jobs.find((j) => j.body.kind === 'call.ring.timeout')!);

		expect(await statusOf(bo)).toBe('declined');
		expect(inbox(bo)).toEqual([]);
	});

	it('stops ringing when the call ends first', async () => {
		const { env, ada, bo, invite, adaIn, call, published, statusOf } = await world();
		await invite(bo);
		published.length = 0;

		await leaveCall(env, ada, await call(), adaIn.participantId, 5_000);

		expect(await statusOf(bo)).toBe('cancelled');
		expect(published).toContainEqual({
			topic: `user:${bo.user.id}`,
			payload: { type: 'call.ring' }
		});
	});

	it('counts joining the call another way as answering', async () => {
		const { env, bo, invite, call, statusOf } = await world();
		await invite(bo);

		await joinCall(env, bo, await call(bo), 3_000);

		expect(await statusOf(bo)).toBe('accepted');
	});

	it('rings someone again after a missed call', async () => {
		const { bo, invite, jobs, deliver, statusOf } = await world();
		await invite(bo);
		await deliver(jobs.find((j) => j.body.kind === 'call.ring.timeout')!);

		await invite(bo);

		expect(await statusOf(bo)).toBe('ringing');
	});
});

describe('who can be rung', () => {
	it('only people who can see the call, and only by someone in it', async () => {
		const { env, ada, bo, cy, gus, call, invite } = await world(async ({ env, ada }) => ({
			kind: 'project',
			id: await createProject(env, ada, { name: 'Ops', description: '', private: true })
		}));

		expect(await invitablePeople(env, ada, await call())).toEqual([]);
		expect(await status(invite(cy))).toBe(400);
		expect(await status(invite(gus))).toBe(400);
		expect(await status(call(bo))).toBe(404);
	});

	it("keeps guests out of a personal room's ring list", async () => {
		const { env, ada, call } = await world(async ({ ada }) => ({ kind: 'room', id: ada.user.id }));

		expect((await invitablePeople(env, ada, await call())).map((p) => p.name)).toEqual([
			'Bo',
			'Cy'
		]);
	});

	it("refuses ringing from someone who isn't in the call, and answering someone else's ring", async () => {
		const { env, bo, cy, call, invite } = await world();
		await invite(bo);
		const [ring] = await ringingFor(env, bo, 1_000);

		expect(await status(inviteToCall(env, cy, await call(cy), [bo.user.id], 0))).toBe(403);
		expect(await status(answerInvitation(env, cy, ring.id, 'accept', 1_000))).toBe(410);
	});
});

describe('ringing someone with no tab open', () => {
	/** Decrypts a web push body (RFC 8291, aes128gcm) with the browser's keys. */
	async function decrypt(
		body: Uint8Array<ArrayBuffer>,
		browser: CryptoKeyPair,
		auth: Uint8Array<ArrayBuffer>
	) {
		const salt = body.slice(0, 16);
		const serverPublic = body.slice(21, 86);
		const browserPublic = new Uint8Array(
			(await crypto.subtle.exportKey('raw', browser.publicKey)) as ArrayBuffer
		);
		const server = await crypto.subtle.importKey(
			'raw',
			serverPublic,
			{ name: 'ECDH', namedCurve: 'P-256' },
			false,
			[]
		);
		const shared = await crypto.subtle.deriveBits(
			{ name: 'ECDH', public: server },
			browser.privateKey,
			256
		);
		const text = (s: string) => new TextEncoder().encode(s);
		const hkdf = async (salt: BufferSource, ikm: BufferSource, info: BufferSource, bytes: number) =>
			new Uint8Array(
				await crypto.subtle.deriveBits(
					{ name: 'HKDF', hash: 'SHA-256', salt, info },
					await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']),
					bytes * 8
				)
			);
		const keyInfo = new Uint8Array([...text('WebPush: info\0'), ...browserPublic, ...serverPublic]);
		const ikm = await hkdf(auth, shared, keyInfo, 32);
		const cek = await hkdf(salt, ikm, text('Content-Encoding: aes128gcm\0'), 16);
		const nonce = await hkdf(salt, ikm, text('Content-Encoding: nonce\0'), 12);
		const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
		const padded = new Uint8Array(
			await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.slice(86))
		);
		return JSON.parse(new TextDecoder().decode(padded.slice(0, padded.lastIndexOf(2))));
	}

	it('pushes the ring, encrypted, to each of their devices', async () => {
		const { bo, callId, invite, sqlite, sfu } = await world();
		const browser = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
			'deriveBits'
		])) as CryptoKeyPair;
		const auth = crypto.getRandomValues(new Uint8Array(16));
		const p256dh = new Uint8Array(
			(await crypto.subtle.exportKey('raw', browser.publicKey)) as ArrayBuffer
		);
		sqlite
			.prepare('INSERT INTO push_subscriptions VALUES (?, ?, ?, ?, ?, 0)')
			.run(
				's1',
				bo.user.id,
				'https://push.example.net/sub/1',
				Buffer.from(p256dh).toString('base64url'),
				Buffer.from(auth).toString('base64url')
			);

		await invite(bo);

		const push = sfu.find((r) => r.url === 'https://push.example.net/sub/1')!;
		expect(push.headers.get('content-encoding')).toBe('aes128gcm');
		expect(push.auth).toMatch(/^vapid t=.+, k=BP4z9/);
		expect(await decrypt(push.body as Uint8Array<ArrayBuffer>, browser, auth)).toEqual({
			title: 'Ada invited you to a call',
			body: 'Ops',
			url: `/calls/${callId}`,
			unread: 0
		});
	});
});
