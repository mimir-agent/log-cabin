import { describe, expect, it } from 'vitest';
import { startCall } from '#lib/server/calls/calls.js';
import { createGuestPass } from '#lib/server/calls/guests.js';
import { callsWorld, status } from '#lib/server/calls/testing.js';
import { POST } from './+server';

/** The route as a browser with no session calls it, holding guestPass in the guest cookie. */
function sfuRequest(callId: string, body: Record<string, unknown>, guestPass?: string) {
	const url = `https://campfire.test/calls/${callId}/sfu`;
	return POST({
		params: { id: callId },
		locals: { user: null, member: null },
		url: new URL(url),
		request: new Request(url, { method: 'POST', body: JSON.stringify(body) }),
		cookies: { get: (name: string) => (name === 'campfire_guest' ? guestPass : undefined) }
	} as never);
}

describe('POST /calls/<id>/sfu', () => {
	it('lets a guest with a pass join without an account, and nobody else', async () => {
		const { env, person, privateProject } = await callsWorld();
		const ada = await person('Ada', 'member');
		const now = Date.now();
		const callId = await startCall(env, ada, await privateProject(ada), now);
		const otherCallId = await startCall(env, ada, { kind: 'room', id: ada.user.id }, now);
		const window = { notBefore: now - 60_000, expiresAt: now + 60_000, createdBy: ada.user.id };
		const { token } = await createGuestPass(env, { callId, name: 'Grace', ...window });
		const expired = await createGuestPass(env, {
			callId,
			name: 'Late',
			...window,
			expiresAt: now - 1
		});

		const joined = await sfuRequest(callId, { op: 'join', participantId: '' }, token);

		expect(joined.status).toBe(200);
		expect(await joined.json()).toMatchObject({ participantId: expect.any(String) });
		for (const [id, guestPass] of [
			[otherCallId, token],
			[callId, 'made-up'],
			[callId, expired.token]
		]) {
			expect(await status(sfuRequest(id, { op: 'join', participantId: '' }, guestPass))).toBe(404);
		}
	});
});
