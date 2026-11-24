import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import { joinCall, leaveCall, loadCall, startCall } from '#lib/server/calls/calls.js';
import { callsWorld } from '#lib/server/calls/testing.js';
import { load } from './+page.server';

function event(who: SignedIn, query = '') {
	const url = new URL(`https://campfire.test/calls${query}`);
	return { locals: who, url, request: new Request(url), depends: () => {} } as never;
}

describe('/calls', () => {
	it('puts the calls going on now beside the ones that ended, and your room’s link', async () => {
		const { env, person } = await callsWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const over = await startCall(env, ada, { kind: 'room', id: ada.user.id }, 1_000);
		const me = await joinCall(env, ada, await loadCall(env, ada, over, 1_000), 1_000);
		await leaveCall(env, ada, await loadCall(env, ada, over, 1_000), me.participantId, 61_000);
		const live = await startCall(env, bo, { kind: 'room', id: bo.user.id }, Date.now());

		const data = await load(event(ada));

		expect(data).toMatchObject({
			enabled: true,
			roomPath: '/calls/room/ada',
			live: [{ id: live, place: { name: 'Bo’s room' }, people: [] }],
			calls: [{ id: over }]
		});
	});
});
