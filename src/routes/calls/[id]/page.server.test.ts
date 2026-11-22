import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import { joinCall, leaveCall, loadCall, startCall } from '#lib/server/calls/calls.js';
import { callsWorld } from '#lib/server/calls/testing.js';
import { load } from './+page.server';

function event(who: SignedIn, id: string) {
	return {
		locals: who,
		params: { id },
		url: new URL(`https://campfire.test/calls/${id}`),
		request: new Request(`https://campfire.test/calls/${id}`),
		depends() {}
	} as never;
}

describe('/calls/<id>', () => {
	it('says when a call that is over started, how long it lasted and who was in it', async () => {
		const { env, person } = await callsWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const place = { kind: 'room' as const, id: ada.user.id };
		const id = await startCall(env, ada, place, 1_000);
		const joined = [];
		for (const who of [ada, bo]) {
			joined.push(await joinCall(env, who, await loadCall(env, who, id, 1_000), 1_000));
		}
		for (const [i, who] of [ada, bo].entries()) {
			await leaveCall(
				env,
				who,
				await loadCall(env, who, id, 1_000),
				joined[i].participantId,
				181_000
			);
		}

		const data = (await load(event(bo, id))) as { past: unknown };

		expect(data.past).toEqual({
			startedAt: 1_000,
			durationMs: 180_000,
			names: expect.arrayContaining(['Ada', 'Bo'])
		});
	});

	it('has no past for a call still going on', async () => {
		const { env, person } = await callsWorld();
		const ada = await person('Ada', 'member');
		const id = await startCall(env, ada, { kind: 'room', id: ada.user.id });

		expect(await load(event(ada, id))).toMatchObject({ past: null });
	});
});
