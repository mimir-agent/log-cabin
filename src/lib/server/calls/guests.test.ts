import { describe, expect, it } from 'vitest';
import {
	heartbeat,
	joinCall,
	leaveCall,
	loadCall,
	publishTracks,
	startCall,
	subscribeTracks
} from './calls';
import { createGuestPass, readGuestPass } from './guests';
import { callsWorld, offer, status } from './testing';

const minute = 60_000;

/** Ada started a call in a private project at minute 14; Grace has a pass for it from minute 10 to 20. */
async function world() {
	const w = await callsWorld();
	const ada = await w.person('Ada', 'member');
	const callId = await startCall(w.env, ada, await w.privateProject(ada), 14 * minute);
	const otherCallId = await startCall(w.env, ada, { kind: 'room', id: ada.user.id }, 14 * minute);
	const { token } = await createGuestPass(
		w.env,
		{
			callId,
			name: 'Grace',
			notBefore: 10 * minute,
			expiresAt: 20 * minute,
			createdBy: ada.user.id
		},
		0
	);
	return { ...w, ada, callId, otherCallId, token };
}

describe('a guest pass', () => {
	it('lets its guest in only during its window', async () => {
		const { env, callId, token } = await world();

		expect(await readGuestPass(env, token, callId, 10 * minute - 1)).toBeNull();
		expect(await readGuestPass(env, token, callId, 10 * minute)).toEqual({
			guest: { passId: expect.any(String), callId, name: 'Grace' }
		});
		expect(await readGuestPass(env, token, callId, 20 * minute)).toBeNull();
	});

	it('is refused for any other call, and a made-up token for every call', async () => {
		const { env, callId, otherCallId, token } = await world();
		const grace = (await readGuestPass(env, token, callId, 15 * minute))!;

		expect(await readGuestPass(env, token, otherCallId, 15 * minute)).toBeNull();
		expect(await readGuestPass(env, 'not-a-token', callId, 15 * minute)).toBeNull();
		expect(await status(loadCall(env, grace, otherCallId, 15 * minute))).toBe(404);
	});

	it('sends camera and microphone into the call, never a screen, and receives the others', async () => {
		const { env, ada, callId, token } = await world();
		const grace = (await readGuestPass(env, token, callId, 15 * minute))!;
		const call = () => loadCall(env, ada, callId, 15 * minute);
		const adaIn = await joinCall(env, ada, await call(), 15 * minute);
		await publishTracks(env, ada, await call(), adaIn.participantId, {
			sessionDescription: offer,
			tracks: [{ location: 'local', mid: '0', trackName: 'video' }]
		});
		const graceIn = await joinCall(env, grace, await call(), 15 * minute);
		const publish = async (trackName: string) =>
			publishTracks(env, grace, await call(), graceIn.participantId, {
				sessionDescription: offer,
				tracks: [{ location: 'local', mid: '1', trackName }]
			});

		expect(await status(publish('screen'))).toBe(400);
		await publish('video');
		await subscribeTracks(env, grace, await call(), graceIn.participantId, [
			{ sessionId: adaIn.sessionId, trackName: 'video' }
		]);
		expect((await call()).participants).toEqual([
			expect.objectContaining({ name: 'Ada' }),
			expect.objectContaining({ name: 'Grace', userId: null, tracks: ['video'] })
		]);
	});

	it("can't drive a member's session in the call", async () => {
		const { env, ada, callId, token } = await world();
		const grace = (await readGuestPass(env, token, callId, 15 * minute))!;
		const call = () => loadCall(env, ada, callId, 15 * minute);
		const adaIn = await joinCall(env, ada, await call(), 15 * minute);

		expect(
			await status(
				publishTracks(env, grace, await call(), adaIn.participantId, {
					sessionDescription: offer,
					tracks: [{ location: 'local', mid: '0', trackName: 'audio' }]
				})
			)
		).toBe(403);
	});

	it('keeps a guest in while their browser checks in, and ends the call once it stops', async () => {
		const { env, ada, callId, token } = await world();
		const grace = (await readGuestPass(env, token, callId, 15 * minute))!;
		const at = (t: number) => loadCall(env, grace, callId, t);
		const adaIn = await joinCall(env, ada, await at(15 * minute), 15 * minute);
		const graceIn = await joinCall(env, grace, await at(15 * minute), 15 * minute);
		await leaveCall(env, ada, await at(15 * minute), adaIn.participantId, 15 * minute);

		await heartbeat(env, grace, await at(16 * minute), graceIn.participantId, 16 * minute);
		const second = 1_000;
		const stillIn = await at(17 * minute + 29 * second);
		expect(stillIn.participants.map((p) => p.name)).toEqual(['Grace']);
		expect(stillIn.endedAt, 'a guest heard from 89 s ago is still in the call').toBeNull();

		const after = await at(17 * minute + 31 * second);
		expect(after.participants, 'a guest unheard for over 90 s is gone').toEqual([]);
		expect(after.endedAt, 'the call ends with its last guest gone').not.toBeNull();
	});

	it('takes a guest out when their pass runs out, and stops their media', async () => {
		const { env, ada, callId, token, present, sfu } = await world();
		present.push(ada.user.id);
		const grace = (await readGuestPass(env, token, callId, 15 * minute))!;
		const call = (t: number) => loadCall(env, ada, callId, t);
		await joinCall(env, ada, await call(15 * minute), 15 * minute);
		const graceIn = await joinCall(env, grace, await call(19 * minute), 19 * minute);
		await publishTracks(env, grace, await call(19 * minute), graceIn.participantId, {
			sessionDescription: offer,
			tracks: [{ location: 'local', mid: '0', trackName: 'video' }]
		});
		await heartbeat(
			env,
			grace,
			await call(20 * minute - 1),
			graceIn.participantId,
			20 * minute - 1
		);

		const after = await call(20 * minute);

		expect(after.participants.map((p) => p.name)).toEqual(['Ada']);
		const closed = sfu.filter((r) => r.url.endsWith(`/sessions/${graceIn.sessionId}/tracks/close`));
		expect(closed.map((r) => r.body)).toEqual([{ tracks: [{ mid: '0' }], force: true }]);
		expect(await status(heartbeat(env, grace, after, graceIn.participantId, 20 * minute))).toBe(
			403
		);
	});

	it('stops the media of a guest taken out for going silent', async () => {
		const { env, ada, callId, token, present, sfu } = await world();
		present.push(ada.user.id);
		const grace = (await readGuestPass(env, token, callId, 15 * minute))!;
		const call = (t: number) => loadCall(env, ada, callId, t);
		await joinCall(env, ada, await call(15 * minute), 15 * minute);
		const graceIn = await joinCall(env, grace, await call(15 * minute), 15 * minute);
		await publishTracks(env, grace, await call(15 * minute), graceIn.participantId, {
			sessionDescription: offer,
			tracks: [{ location: 'local', mid: '0', trackName: 'video' }]
		});

		const after = await call(17 * minute);

		expect(after.participants.map((p) => p.name)).toEqual(['Ada']);
		const closed = sfu.filter((r) => r.url.endsWith(`/sessions/${graceIn.sessionId}/tracks/close`));
		expect(closed.map((r) => r.body)).toEqual([{ tracks: [{ mid: '0' }], force: true }]);
	});

	it('stops the media of a guest who leaves', async () => {
		const { env, ada, callId, token, present, sfu } = await world();
		present.push(ada.user.id);
		const grace = (await readGuestPass(env, token, callId, 15 * minute))!;
		const call = () => loadCall(env, ada, callId, 15 * minute);
		await joinCall(env, ada, await call(), 15 * minute);
		const graceIn = await joinCall(env, grace, await call(), 15 * minute);
		await publishTracks(env, grace, await call(), graceIn.participantId, {
			sessionDescription: offer,
			tracks: [{ location: 'local', mid: '0', trackName: 'video' }]
		});

		await leaveCall(env, grace, await call(), graceIn.participantId, 15 * minute);

		const closed = sfu.filter((r) => r.url.endsWith(`/sessions/${graceIn.sessionId}/tracks/close`));
		expect(closed.map((r) => r.body)).toEqual([{ tracks: [{ mid: '0' }], force: true }]);
	});

	it('refuses a pass with no name or an empty window', async () => {
		const { env, ada, callId } = await world();
		const pass = { callId, createdBy: ada.user.id, notBefore: 0, expiresAt: minute };

		await expect(createGuestPass(env, { ...pass, name: ' ' })).rejects.toThrow(/expected a name/);
		await expect(createGuestPass(env, { ...pass, name: 'Grace', expiresAt: 0 })).rejects.toThrow(
			/expected notBefore before expiresAt/
		);
	});
});
