import { describe, expect, it } from 'vitest';
import { createSession, type SignedIn } from '../auth/session';
import type { Role } from '../db/schema';
import { upsertDevMember } from '../dev-login';
import { suggestUsername } from '../people/usernames';
import { fakeD1 } from '../testing/fake-d1';
import { useTestEnv } from '../testing/env';
import { createNote, shareWithPeople, validateNoteInput } from '../notes/notes';
import { loadNote } from '../notes/access';
import { connectRealtime, isRealtimePath } from './connect';
import { noteSocketHeader, userIdHeader } from './hub';

async function world() {
	const { DB } = fakeD1();
	const reached: { hub: string; user: string | null; note: unknown }[] = [];
	/** Every request any hub got, with what RealtimeHub.fetch dispatches on. */
	const asked: { hub: string; method: string; path: string; upgrade: string | null }[] = [];
	const env = {
		DB,
		JOBS: { send: async () => {} },
		REALTIME: {
			idFromName: (name: string) => name,
			get: (hub: string) => ({
				fetch: async (input: Request | string, init?: RequestInit) => {
					const request = new Request(input, init);
					asked.push({
						hub,
						method: request.method,
						path: new URL(request.url).pathname,
						upgrade: request.headers.get('upgrade')
					});
					// The hubs' other routes (publish, /note/close) answer like the real ones.
					if (request.headers.get('upgrade') !== 'websocket') {
						return new Response(null, { status: 204 });
					}
					const note = request.headers.get(noteSocketHeader);
					reached.push({
						hub,
						user: request.headers.get(userIdHeader),
						note: note && JSON.parse(note)
					});
					return new Response('upgraded');
				}
			})
		}
	} as unknown as Env;
	useTestEnv(env);
	const person = async (name: string, role: Role = 'member'): Promise<SignedIn> => {
		const email = `${name.toLowerCase()}@example.com`;
		const id = await upsertDevMember(env, { email, name, role });
		return {
			user: { id, name, username: suggestUsername(name), email, avatarUrl: null, theme: 'system' },
			member: { id: `m-${id}`, role }
		};
	};
	const ada = await person('Ada');
	const input = validateNoteInput({ title: 'Trip', body: '{"type":"doc","content":[]}' });
	if (!input.ok) throw new Error(input.message);
	const noteId = await createNote(env, ada, input.input);
	const open = async (
		who: SignedIn,
		path = `/realtime/note/${noteId}`,
		extra: Record<string, string> = {}
	) => {
		const { token } = await createSession(env, who.user.id);
		return connectRealtime(
			new Request(`https://campfire.test${path}`, {
				headers: {
					...extra,
					upgrade: 'websocket',
					origin: 'https://campfire.test',
					cookie: `campfire_session=${token}`
				}
			}),
			env
		);
	};
	return { env, reached, asked, person, ada, noteId, open };
}

describe('opening a note’s live socket', () => {
	it('refuses a member the note isn’t shared with, before any hub sees them', async () => {
		const { reached, person, open } = await world();
		const dee = await person('Dee', 'admin');
		const response = await open(dee);
		expect(response.status).toBe(403);
		expect(reached).toEqual([]);
	});

	it('answers a note that doesn’t exist the same way', async () => {
		const { reached, ada, open } = await world();
		const response = await open(ada, '/realtime/note/01NOSUCHNOTE00000000000000');
		expect(response.status).toBe(403);
		expect(reached).toEqual([]);
	});

	it('connects an editor read-write and a viewer read-only, to the note’s own hub', async () => {
		const { env, reached, person, ada, noteId, open } = await world();
		const bo = await person('Bo');
		await shareWithPeople(env, ada, await loadNote(env, ada, noteId), [bo.user.id], 'view');

		expect((await open(ada)).status).toBe(200);
		expect((await open(bo)).status).toBe(200);
		expect(reached).toEqual([
			{ hub: `note:${noteId}`, user: ada.user.id, note: { noteId, canWrite: true, name: 'Ada' } },
			{ hub: `note:${noteId}`, user: bo.user.id, note: { noteId, canWrite: false, name: 'Bo' } }
		]);
	});

	it('still sends /realtime to the org’s hub', async () => {
		const { reached, ada, open } = await world();
		await open(ada, '/realtime');
		expect(reached).toEqual([{ hub: 'org', user: ada.user.id, note: null }]);
	});

	it('passes on none of the hub’s own headers a client sends, on either route', async () => {
		const { reached, person, ada, noteId, open } = await world();
		const dee = await person('Dee');
		const forged = {
			[noteSocketHeader]: JSON.stringify({ noteId, canWrite: true, name: 'Ada' }),
			[userIdHeader]: ada.user.id
		};

		expect((await open(dee, '/realtime', forged)).status).toBe(200);
		expect((await open(dee, `/realtime/note/${noteId}`, forged)).status).toBe(403);
		expect(reached).toEqual([{ hub: 'org', user: dee.user.id, note: null }]);
	});
});

describe('the hub’s routes for the Worker’s own use, such as marking a comment’s passage', () => {
	it('can’t be reached from a browser: /realtime passes on only socket upgrades, at its own paths', async () => {
		const { env, asked, ada, noteId } = await world();
		const { token } = await createSession(env, ada.user.id);
		const mark = JSON.stringify({
			noteId,
			commentId: 'x',
			userId: ada.user.id,
			start: 'AQ==',
			end: 'AQ=='
		});
		const send = (path: string, headers: Record<string, string> = {}) =>
			connectRealtime(
				new Request(`https://campfire.test${path}`, {
					method: 'POST',
					body: mark,
					headers: {
						...headers,
						origin: 'https://campfire.test',
						cookie: `campfire_session=${token}`,
						'content-type': 'application/json'
					}
				}),
				env
			);

		expect(isRealtimePath('/note/mark-comment'), 'the Worker never routes the hub’s path').toBe(
			false
		);
		expect((await send('/realtime')).status, 'a POST to /realtime').toBe(426);
		expect((await send(`/realtime/note/${noteId}`)).status, 'a POST to the note’s socket').toBe(
			426
		);
		expect(asked, 'no hub hears a request that isn’t an upgrade').toEqual([]);

		expect((await send('/realtime/note/mark-comment', { upgrade: 'websocket' })).status).toBe(403);
		await send('/realtime', { upgrade: 'websocket' });
		await send(`/realtime/note/${noteId}`, { upgrade: 'websocket' });
		// RealtimeHub.fetch takes every upgrade to its socket branch before any other route.
		expect(asked.map(({ hub, path, upgrade }) => ({ hub, path, upgrade }))).toEqual([
			{ hub: 'org', path: '/realtime', upgrade: 'websocket' },
			{ hub: `note:${noteId}`, path: `/realtime/note/${noteId}`, upgrade: 'websocket' }
		]);
	});
});
