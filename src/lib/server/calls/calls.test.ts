import { describe, expect, it } from 'vitest';
import { createGroup } from '#lib/server/chat/threads.js';
import { canSubscribe } from '#lib/server/realtime/topics.js';
import {
	endCall,
	joinCall,
	leaveCall,
	liveCall,
	loadCall,
	publishTracks,
	startCall,
	subscribeTracks
} from './calls';
import { callsEnabled, iceServers } from './sfu';
import { callHistory } from './history';
import { callsWorld as world, offer, status } from './testing';

describe('starting a call', () => {
	it('announces the call on its project and hands everyone the same live call', async () => {
		const { env, person, privateProject, published } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const place = await privateProject(ada, bo);

		const first = await startCall(env, ada, place);
		const second = await startCall(env, bo, place);

		expect(second).toBe(first);
		expect(published).toContainEqual({ topic: `project:${place.id}`, payload: { type: 'call' } });
	});

	it('works in a chat thread for the people in it', async () => {
		const { env, person } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const thread = await createGroup(env, ada, 'Standup', [bo.user.id]);

		const id = await startCall(env, bo, { kind: 'thread', id: thread });

		expect((await loadCall(env, ada, id)).place).toEqual({ kind: 'thread', id: thread });
	});
});

describe('who can join a call', () => {
	it('refuses people who cannot see the private project, and lets its members in', async () => {
		const { env, person, privateProject } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const outsider = await person('Cy', 'admin');
		const guest = await person('Gus', 'guest');
		const id = await startCall(env, ada, await privateProject(ada, bo));

		expect(await status(loadCall(env, guest, id))).toBe(404);
		expect(await status(loadCall(env, bo, id))).toBe('ok');
		expect(await canSubscribe(env, guest.user.id, `call:${id}`)).toBe(false);
		expect(await canSubscribe(env, bo.user.id, `call:${id}`)).toBe(true);
		// Admins see every public project, but a private one only once added.
		expect(await canSubscribe(env, outsider.user.id, `call:${id}`)).toBe(false);
	});

	it('refuses people outside the chat thread', async () => {
		const { env, person } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const cy = await person('Cy', 'member');
		const thread = await createGroup(env, ada, 'Pair', [bo.user.id]);
		const id = await startCall(env, ada, { kind: 'thread', id: thread });

		expect(await status(loadCall(env, cy, id))).toBe(404);
		expect(await status(startCall(env, cy, { kind: 'thread', id: thread }))).toBe(404);
		expect(await canSubscribe(env, cy.user.id, `call:${id}`)).toBe(false);
	});

	it('opens an SFU session with the app token, which never goes back to the browser', async () => {
		const { env, person, privateProject, sfu } = await world();
		const ada = await person('Ada', 'member');
		const id = await startCall(env, ada, await privateProject(ada));

		const joined = await joinCall(env, ada, await loadCall(env, ada, id));

		expect(sfu).toContainEqual(
			expect.objectContaining({
				method: 'POST',
				url: 'https://rtc.live.cloudflare.com/v1/apps/app-1/sessions/new',
				auth: 'Bearer secret-token'
			})
		);
		expect(JSON.stringify(joined)).not.toContain('secret-token');
		expect(joined.iceServers).toEqual([{ urls: ['stun:stun.cloudflare.com:3478'] }]);
	});
});

describe('media in a call', () => {
	async function twoInACall() {
		const w = await world();
		const ada = await w.person('Ada', 'member');
		const bo = await w.person('Bo', 'member');
		const id = await startCall(w.env, ada, await w.privateProject(ada, bo));
		const adaIn = await joinCall(w.env, ada, await loadCall(w.env, ada, id));
		const boIn = await joinCall(w.env, bo, await loadCall(w.env, bo, id));
		const call = () => loadCall(w.env, ada, id);
		return { ...w, ada, bo, id, adaIn, boIn, call };
	}

	it('publishes tracks and lets the others subscribe to them', async () => {
		const { env, ada, bo, adaIn, boIn, call, sfu } = await twoInACall();
		await publishTracks(env, ada, await call(), adaIn.participantId, {
			sessionDescription: offer,
			tracks: [
				{ location: 'local', mid: '0', trackName: 'audio' },
				{ location: 'local', mid: '1', trackName: 'video' }
			]
		});

		const tracks = [{ sessionId: adaIn.sessionId, trackName: 'video' }];
		const answer = await subscribeTracks(env, bo, await call(), boIn.participantId, tracks);

		const ada_ = (await call()).participants.find((p) => p.userId === ada.user.id);
		expect(ada_?.tracks).toEqual(['audio', 'video']);
		expect(answer.sessionDescription?.type).toBe('offer');
		expect(sfu.at(-1)).toMatchObject({
			url: `https://rtc.live.cloudflare.com/v1/apps/app-1/sessions/${boIn.sessionId}/tracks/new`,
			body: { tracks: [{ location: 'remote', sessionId: adaIn.sessionId, trackName: 'video' }] }
		});
	});

	it("refuses subscribing to a session that isn't publishing in this call", async () => {
		const { env, bo, adaIn, boIn, call } = await twoInACall();
		const unpublished = [{ sessionId: adaIn.sessionId, trackName: 'video' }];
		const elsewhere = [{ sessionId: 'sfu-from-another-call', trackName: 'video' }];

		expect(
			await status(subscribeTracks(env, bo, await call(), boIn.participantId, unpublished))
		).toBe(400);
		expect(
			await status(subscribeTracks(env, bo, await call(), boIn.participantId, elsewhere))
		).toBe(400);
	});

	it("refuses driving someone else's session", async () => {
		const { env, bo, adaIn, call } = await twoInACall();
		const input = {
			sessionDescription: offer,
			tracks: [{ location: 'local' as const, mid: '0', trackName: 'audio' }]
		};

		expect(await status(publishTracks(env, bo, await call(), adaIn.participantId, input))).toBe(
			403
		);
	});
});

describe('telling every page which calls are live', () => {
	it('publishes when a call starts, someone joins, someone leaves and the call ends', async () => {
		const { env, person, privateProject, published } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const place = await privateProject(ada, bo);
		const live = () => published.filter((p) => p.topic === 'calls:live').length;

		const id = await startCall(env, ada, place, 1_000);
		expect(live()).toBe(1);
		const adaIn = await joinCall(env, ada, await loadCall(env, ada, id, 1_000), 1_000);
		const boIn = await joinCall(env, bo, await loadCall(env, bo, id, 2_000), 2_000);
		expect(live()).toBe(3);
		await leaveCall(env, ada, await loadCall(env, ada, id, 3_000), adaIn.participantId, 3_000);
		expect(live()).toBe(4);
		await leaveCall(env, bo, await loadCall(env, bo, id, 3_000), boIn.participantId, 4_000);
		expect(live()).toBe(5);
		expect(published.at(-1)).toEqual({ topic: 'calls:live', payload: { type: 'live' } });
	});

	it('lets any member hear it, and nobody ask for another topic of that kind', async () => {
		const { env, person } = await world();
		const ada = await person('Ada', 'member');

		expect(await canSubscribe(env, ada.user.id, 'calls:live')).toBe(true);
		expect(await canSubscribe(env, ada.user.id, 'calls:other')).toBe(false);
	});
});

describe('leaving and ending', () => {
	it('ends the call when the last person leaves, and keeps who was in it and for how long', async () => {
		const { env, person, privateProject, published } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const place = await privateProject(ada, bo);
		const id = await startCall(env, ada, place, 1_000);
		const adaIn = await joinCall(env, ada, await loadCall(env, ada, id, 1_000), 1_000);
		const boIn = await joinCall(env, bo, await loadCall(env, bo, id, 2_000), 2_000);

		await leaveCall(env, ada, await loadCall(env, ada, id, 3_000), adaIn.participantId, 3_000);
		expect((await loadCall(env, bo, id, 3_000)).endedAt).toBeNull();
		await leaveCall(env, bo, await loadCall(env, bo, id, 3_000), boIn.participantId, 91_000);

		expect((await loadCall(env, ada, id)).endedAt).toBe(91_000);
		expect(await liveCall(env, place)).toBeNull();
		expect((await callHistory(env, ada, { place })).calls).toMatchObject([
			{
				id,
				startedAt: 1_000,
				durationMs: 90_000,
				place: { kind: 'project', name: 'Ops', href: `/projects/${place.id}` },
				names: expect.arrayContaining(['Ada', 'Bo'])
			}
		]);
		expect(published).toContainEqual({ topic: `call:${id}`, payload: { type: 'ended' } });
	});

	it('lets only the person who started it, or an admin, end it for everyone', async () => {
		const { env, person, privateProject } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const id = await startCall(env, ada, await privateProject(ada, bo));
		const boIn = await joinCall(env, bo, await loadCall(env, bo, id));

		expect(await status(endCall(env, bo, await loadCall(env, bo, id)))).toBe(403);
		await endCall(env, ada, await loadCall(env, ada, id));

		const call = await loadCall(env, bo, id);
		expect(call.endedAt).not.toBeNull();
		expect(call.participants).toEqual([]);
		expect(await status(leaveCall(env, bo, call, boIn.participantId))).toBe(410);
	});

	it('drops someone whose browser closed without leaving, and ends the call if nobody is left', async () => {
		const { env, person, privateProject, present } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const place = await privateProject(ada, bo);
		const id = await startCall(env, ada, place, 0);
		await joinCall(env, ada, await loadCall(env, ada, id, 0), 0);
		await joinCall(env, bo, await loadCall(env, bo, id, 0), 0);

		present.push(bo.user.id);
		expect(await liveCall(env, place, 60_000)).toMatchObject({ id, names: ['Bo'] });
		present.length = 0;
		expect(await liveCall(env, place, 120_000)).toBeNull();
	});

	it('closes a call nobody joined after two minutes, and leaves it out of recent calls', async () => {
		const { env, person, privateProject } = await world();
		const ada = await person('Ada', 'member');
		const place = await privateProject(ada);
		const id = await startCall(env, ada, place, 0);

		expect(await liveCall(env, place, 60_000)).toMatchObject({ id, names: [] });
		expect(await liveCall(env, place, 121_000)).toBeNull();
		expect((await callHistory(env, ada, { place })).calls).toEqual([]);
	});
});

describe('when calls are available', () => {
	it('hides calls until both Realtime secrets are set', () => {
		expect(callsEnabled({ REALTIME_APP_ID: 'a' } as Env)).toBe(false);
		expect(callsEnabled({ REALTIME_APP_ID: 'a', REALTIME_APP_TOKEN: 't' } as Env)).toBe(true);
	});

	it('hands browsers short-lived TURN credentials when a TURN key is set, without port 53', async () => {
		const { env, sfu } = await world();
		expect(await iceServers(env)).toEqual([{ urls: ['stun:stun.cloudflare.com:3478'] }]);

		const servers = await iceServers({
			...env,
			REALTIME_TURN_KEY_ID: 'key-1',
			REALTIME_TURN_KEY_TOKEN: 'turn-token'
		} as Env);

		expect(sfu.at(-1)).toMatchObject({
			url: 'https://rtc.live.cloudflare.com/v1/turn/keys/key-1/credentials/generate-ice-servers',
			auth: 'Bearer turn-token',
			body: { ttl: 86400 }
		});
		expect(servers.flatMap((s) => s.urls)).not.toContainEqual(expect.stringContaining(':53'));
		expect(servers[1]).toMatchObject({ username: 'u', credential: 'c' });
	});
});
