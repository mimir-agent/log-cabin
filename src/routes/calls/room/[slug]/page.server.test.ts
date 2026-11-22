import { isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import { canSubscribe } from '#lib/server/realtime/topics.js';
import { joinCall, leaveCall, loadCall } from '#lib/server/calls/calls.js';
import { resolveRoomSlug, roomPath, roomSlug } from '#lib/server/calls/rooms.js';
import { callsWorld, status } from '#lib/server/calls/testing.js';
import { setDeactivated, getMember } from '#lib/server/members.js';
import { changeUsername } from '#lib/server/people/usernames.js';
import { actions, load } from './+page.server';

function event(who: SignedIn, slug: string, method = 'GET') {
	const request = new Request(`https://campfire.test/calls/room/${slug}`, { method });
	return {
		locals: who,
		params: { slug },
		url: new URL(request.url),
		request,
		depends() {}
	} as never;
}

/** Where the room's join action sends this person. */
async function join(who: SignedIn, slug: string): Promise<string> {
	try {
		await actions.join(event(who, slug, 'POST'));
	} catch (e) {
		if (isRedirect(e)) return e.location;
		throw e;
	}
	throw new Error(`expected the join action for room ${slug} to redirect, it returned`);
}

describe('/calls/room/<slug>', () => {
	it('gives every member a permanent room another member can join', async () => {
		const { env, person } = await callsWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'viewer');
		const slug = roomSlug(ada.user);

		const adaGoesTo = await join(ada, slug);
		const boGoesTo = await join(bo, slug);

		expect(boGoesTo).toBe(adaGoesTo);
		const callId = adaGoesTo.split('/').at(-1)!;
		await joinCall(env, bo, await loadCall(env, bo, callId));
		expect((await loadCall(env, ada, callId)).participants.map((p) => p.name)).toEqual(['Bo']);
		expect(await load(event(bo, slug))).toMatchObject({
			owner: { name: 'Ada', isMe: false },
			live: { id: callId, names: ['Bo'] }
		});
	});

	it('is at the owner’s username, and the old URL redirects after they change it', async () => {
		const { env, person } = await callsWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		expect(roomPath(ada.user)).toBe('/calls/room/ada');

		await changeUsername(env, ada.user.id, 'ada-o');
		const moved = await Promise.resolve(load(event(bo, 'ada'))).catch((e: unknown) => e);
		expect(moved).toMatchObject({ status: 301, location: '/calls/room/ada-o' });
		expect(await load(event(bo, 'ada-o'))).toMatchObject({ owner: { name: 'Ada' } });
	});

	it('is the same room after a call in it ends', async () => {
		const { env, person } = await callsWorld();
		const ada = await person('Ada', 'member');
		const slug = roomSlug(ada.user);
		const first = (await join(ada, slug)).split('/').at(-1)!;
		const me = await joinCall(env, ada, await loadCall(env, ada, first));
		await leaveCall(env, ada, await loadCall(env, ada, first), me.participantId);

		const second = (await join(ada, slug)).split('/').at(-1)!;

		expect(second).not.toBe(first);
		expect((await loadCall(env, ada, second)).place).toEqual({ kind: 'room', id: ada.user.id });
	});

	it("keeps guests out of other people's rooms, but not out of their own", async () => {
		const { env, person } = await callsWorld();
		const ada = await person('Ada', 'member');
		const gus = await person('Gus', 'guest');

		expect(await status(load(event(gus, roomSlug(ada.user))))).toBe(404);
		expect(await status(join(gus, roomSlug(ada.user)))).toBe(404);
		expect(await status(load(event(gus, roomSlug(gus.user))))).toBe('ok');
		expect(await canSubscribe(env, gus.user.id, `room:${ada.user.id}`)).toBe(false);
	});

	it('has no room for a deactivated member or a made-up slug', async () => {
		const { env, person } = await callsWorld();
		const ada = await person('Ada', 'admin');
		const bo = await person('Bo', 'member');
		await setDeactivated(env, (await getMember(env, bo.member.id))!, true);

		expect(await resolveRoomSlug(env, roomSlug(bo.user))).toBeNull();
		expect(await status(load(event(ada, roomSlug(bo.user))))).toBe(404);
		expect(await status(load(event(ada, 'no-such-member')))).toBe(404);
	});

	it("shows a room's past calls to its owner and the people in them, not to other members", async () => {
		const { env, person } = await callsWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const cy = await person('Cy', 'admin');
		const callId = (await join(bo, roomSlug(ada.user))).split('/').at(-1)!;
		const boIn = await joinCall(env, bo, await loadCall(env, bo, callId));
		await leaveCall(env, bo, await loadCall(env, bo, callId), boIn.participantId);

		expect(await status(loadCall(env, ada, callId))).toBe('ok');
		expect(await status(loadCall(env, bo, callId))).toBe('ok');
		expect(await status(loadCall(env, cy, callId))).toBe(404);
		expect(await canSubscribe(env, cy.user.id, `call:${callId}`)).toBe(false);
	});
});
