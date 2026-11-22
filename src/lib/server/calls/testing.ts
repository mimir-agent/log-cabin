import { isHttpError } from '@sveltejs/kit';
import { afterEach, vi } from 'vitest';
import type { SignedIn } from '../auth/session';
import type { Role } from '../db/schema';
import { upsertDevMember } from '../dev-login';
import { fakeD1 } from '../testing/fake-d1';
import { useTestEnv } from '../testing/env';
import { loadProject } from '../posts/access';
import { addProjectMember, createProject } from '../posts/projects';

// What the calls tests share: a stand-in for Cloudflare's Realtime API, and an env whose
// realtime hub records what's published and answers presence from lists the test controls.

export const offer = { type: 'offer' as const, sdp: 'v=0 offer' };

/** A stand-in for Cloudflare's Realtime API: hands out sessions and accepts every track. */
export function fakeSfu() {
	const requests: {
		method: string;
		url: string;
		auth: string | null;
		headers: Headers;
		body: unknown;
	}[] = [];
	let sessions = 0;
	/** The mids of the tracks each session has opened. */
	const mids = new Map<string, string[]>();
	let adapters = 0;
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		// JSON for the Realtime API; a push service gets encrypted bytes.
		const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
		const headers = new Headers(init.headers);
		requests.push({
			method: init.method ?? 'GET',
			url,
			auth: headers.get('authorization'),
			headers,
			body
		});
		if (url.endsWith('/sessions/new')) return Response.json({ sessionId: `sfu-${++sessions}` });
		if (url.endsWith('/adapters/websocket/new')) {
			return Response.json({
				tracks: body.tracks.map((t: { trackName: string; endpoint: string }) => ({
					trackName: t.trackName,
					endpoint: t.endpoint,
					adapterId: `adapter-${++adapters}`
				}))
			});
		}
		if (url.endsWith('/adapters/websocket/close')) return Response.json({ tracks: body.tracks });
		if (url.endsWith('/tracks/new')) {
			const tracks = body.tracks.map((t: { trackName: string }, i: number) => ({
				...t,
				mid: `${i}`
			}));
			const sessionId = url.split('/sessions/')[1].split('/')[0];
			mids.set(sessionId, [
				...(mids.get(sessionId) ?? []),
				...tracks.map((t: { mid: string }) => t.mid)
			]);
			return Response.json({
				sessionDescription: { type: body.sessionDescription ? 'answer' : 'offer', sdp: 'v=0 sfu' },
				tracks
			});
		}
		const session = url.match(/\/sessions\/([^/]+)$/);
		if (session && (init.method ?? 'GET') === 'GET') {
			const active = mids.get(session[1]) ?? [];
			return Response.json({ tracks: active.map((mid) => ({ mid, status: 'active' })) });
		}
		if (url.includes('/turn/keys/')) {
			return Response.json(
				{
					iceServers: [
						{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
						{
							urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53'],
							username: 'u',
							credential: 'c'
						}
					]
				},
				{ status: 201 }
			);
		}
		return Response.json({});
	});
	return requests;
}

afterEach(() => vi.unstubAllGlobals());

export type Published = { topic: string; payload: { type: string; [key: string]: unknown } };
export type SentJob = { body: { kind: string; [key: string]: unknown }; delaySeconds?: number };

export async function callsWorld(vars: Partial<Env> = {}) {
	/** Who the hub sees on a call:<id> topic. */
	const present: string[] = [];
	/** Whose tabs are open: who the hub sees on their own user:<id> topic. */
	const online: string[] = [];
	const published: Published[] = [];
	const jobs: SentJob[] = [];
	const { DB, sqlite } = fakeD1();
	const env = {
		DB,
		REALTIME_APP_ID: 'app-1',
		REALTIME_APP_TOKEN: 'secret-token',
		...vars,
		JOBS: {
			send: async (body: SentJob['body'], options?: { delaySeconds?: number }) => {
				jobs.push({ body, delaySeconds: options?.delaySeconds });
			}
		},
		REALTIME: {
			idFromName: (name: string) => name,
			get: () => ({
				fetch: async (url: string, init?: RequestInit) => {
					if (url.includes('/presence')) {
						const topic = new URL(url).searchParams.get('topic')!;
						if (!topic.startsWith('user:')) return Response.json(present);
						return Response.json(online.filter((id) => topic === `user:${id}`));
					}
					published.push(JSON.parse(String(init?.body)));
					return Response.json({ delivered: 0 });
				}
			})
		}
	} as unknown as Env;
	useTestEnv(env);
	const person = async (name: string, role: Role): Promise<SignedIn> => {
		const email = `${name.toLowerCase()}@example.com`;
		const id = await upsertDevMember(env, { email, name, role });
		const member = sqlite
			.prepare(
				'SELECT members.id, users.username FROM members JOIN users ON users.id = members.user_id WHERE user_id = ?'
			)
			.get(id) as { id: string; username: string };
		return {
			user: { id, name, username: member.username, email, avatarUrl: null, theme: 'system' },
			member: { id: member.id, role }
		};
	};
	const privateProject = async (owner: SignedIn, ...others: SignedIn[]) => {
		const id = await createProject(env, owner, { name: 'Ops', description: '', private: true });
		for (const other of others) {
			await addProjectMember(env, owner, await loadProject(env, owner, id), other.user.id);
		}
		return { kind: 'project' as const, id };
	};
	return {
		env,
		sqlite,
		present,
		online,
		published,
		jobs,
		person,
		privateProject,
		sfu: fakeSfu()
	};
}

/** The HTTP status a server function failed with, or 'ok'. */
export async function status(promise: unknown): Promise<number | 'ok'> {
	try {
		await promise;
		return 'ok';
	} catch (e) {
		if (isHttpError(e)) return e.status;
		throw e;
	}
}
