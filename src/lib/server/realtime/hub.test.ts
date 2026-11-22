import { describe, expect, it, vi } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import type { Role } from '#lib/server/db/schema/index.js';
import { upsertDevMember } from '#lib/server/dev-login.js';
import { db, schema } from '#lib/server/db/index.js';
import { suggestUsername } from '#lib/server/people/usernames.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { addProjectMember, createProject } from '#lib/server/posts/projects.js';
import { loadProject } from '#lib/server/posts/access.js';
import { createPost, parseBody, type BodyInput } from '#lib/server/posts/posts.js';
import { createGroup, startDm } from '#lib/server/chat/threads.js';
import { createNote, shareWithPeople } from '#lib/server/notes/notes.js';
import { loadNote } from '#lib/server/notes/access.js';
import { RealtimeHub } from './hub';

// A hibernating socket as the hub sees it: an attachment it can read back, and what it was sent.
class FakeSocket {
	sent: { topic: string; payload: { type: string; [k: string]: unknown } }[] = [];
	closed: number | null = null;
	readyState: number = WebSocket.OPEN;
	constructor(private attachment: unknown) {}
	serializeAttachment(value: unknown) {
		this.attachment = structuredClone(value);
	}
	deserializeAttachment() {
		return structuredClone(this.attachment);
	}
	send(message: string) {
		if (this.readyState !== WebSocket.OPEN) throw new TypeError('send() after close()');
		this.sent.push(JSON.parse(message));
	}
	close(code: number) {
		this.closed = code;
		this.readyState = WebSocket.CLOSED;
	}
}

async function world() {
	const { DB } = fakeD1();
	const env = {
		DB,
		JOBS: { send: async () => {} },
		REALTIME: {
			idFromName: (name: string) => name,
			get: () => ({ fetch: async () => Response.json([]) })
		}
	} as unknown as Env;
	useTestEnv(env);
	const person = async (name: string, role: Role): Promise<SignedIn> => {
		const email = `${name.toLowerCase()}@example.com`;
		const id = await upsertDevMember(env, { email, name, role });
		return {
			user: { id, name, username: suggestUsername(name), email, avatarUrl: null, theme: 'system' },
			member: { id: `m-${id}`, role }
		};
	};
	const sockets: FakeSocket[] = [];
	const ctx = {
		getWebSockets: (tag?: string) =>
			sockets.filter(
				(s) => !tag || tag === `user:${(s.deserializeAttachment() as { userId: string }).userId}`
			)
	} as unknown as DurableObjectState;
	const hub = new RealtimeHub(ctx, env);
	const connect = (who: SignedIn) => {
		const socket = new FakeSocket({ userId: who.user.id, topics: [] });
		sockets.push(socket);
		return socket;
	};
	const subscribe = async (socket: FakeSocket, topic: string) => {
		await hub.webSocketMessage(
			socket as unknown as WebSocket,
			JSON.stringify({ type: 'subscribe', topic })
		);
		return !socket.sent.some((m) => m.topic === topic && m.payload.type === 'denied');
	};
	const publish = (topic: string, payload: unknown) =>
		hub.fetch(
			new Request('https://realtime/publish', {
				method: 'POST',
				body: JSON.stringify({ topic, payload })
			})
		);
	return { env, person, hub, connect, subscribe, publish };
}

// Holds every D1 query until release() is called, as a slow subscribe check would be held.
function holdQueries(env: Env) {
	const DB = env.DB;
	let release!: () => void;
	const held = new Promise<void>((resolve) => (release = resolve));
	const hold = (statement: D1PreparedStatement): D1PreparedStatement =>
		new Proxy(statement, {
			get: (target, key: keyof D1PreparedStatement) =>
				key === 'bind'
					? (...params: unknown[]) => hold(target.bind(...params))
					: async (...args: never[]) => {
							await held;
							return (target[key] as (...a: never[]) => unknown).apply(target, args);
						}
		});
	env.DB = { prepare: (sql: string) => hold(DB.prepare(sql)) } as unknown as D1Database;
	return () => {
		env.DB = DB;
		release();
	};
}

describe('subscribing to a topic', () => {
	it('lets a member hear their own user topic and nobody else’s', async () => {
		const { person, connect, subscribe } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const socket = connect(ada);

		expect(await subscribe(socket, `user:${ada.user.id}`)).toBe(true);
		expect(await subscribe(socket, `user:${bo.user.id}`)).toBe(false);
	});

	it('lets only the people in a thread hear it', async () => {
		const { env, person, connect, subscribe } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const cy = await person('Cy', 'member');
		const threadId = await startDm(env, ada, bo.user.id);

		expect(await subscribe(connect(bo), `thread:${threadId}`)).toBe(true);
		expect(await subscribe(connect(cy), `thread:${threadId}`)).toBe(false);
	});

	it('keeps a guest out of a project and its posts until they are added to it', async () => {
		const { env, person, connect, subscribe } = await world();
		const ada = await person('Ada', 'member');
		const gus = await person('Gus', 'guest');
		const projectId = await createProject(env, ada, {
			name: 'Launch',
			description: '',
			private: false
		});
		const body = parseBody(
			JSON.stringify({
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }]
			})
		) as BodyInput;
		const postId = await createPost(env, ada, projectId, { title: 'Plan', ...body });

		expect(await subscribe(connect(gus), `project:${projectId}`)).toBe(false);
		expect(await subscribe(connect(gus), `post:${postId}`)).toBe(false);
		await addProjectMember(env, ada, await loadProject(env, ada, projectId), gus.user.id);
		expect(await subscribe(connect(gus), `project:${projectId}`)).toBe(true);
		expect(await subscribe(connect(gus), `post:${postId}`)).toBe(true);
		expect(await subscribe(connect(ada), `post:${postId}`)).toBe(true);
	});

	it('lets only the people a note is shared with hear it', async () => {
		const { env, person, connect, subscribe } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const cy = await person('Cy', 'admin');
		const noteId = await createNote(env, ada, {
			title: 'Draft',
			body: '',
			bodyText: '',
			mentions: []
		});
		await shareWithPeople(env, ada, await loadNote(env, ada, noteId), [bo.user.id], 'view');

		expect(await subscribe(connect(ada), `note:${noteId}`)).toBe(true);
		expect(await subscribe(connect(bo), `note:${noteId}`)).toBe(true);
		expect(await subscribe(connect(cy), `note:${noteId}`)).toBe(false);
	});

	it('keeps every topic when a socket subscribes to several at once', async () => {
		const { env, hub, person, connect, subscribe } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const topics = [`user:${ada.user.id}`, `thread:${await startDm(env, ada, bo.user.id)}`];
		const socket = connect(ada);

		// A browser (re)connecting sends one subscribe per open topic without waiting.
		await Promise.all(topics.map((topic) => subscribe(socket, topic)));

		for (const topic of topics) {
			const present = await hub.fetch(
				new Request(`https://realtime/presence?topic=${encodeURIComponent(topic)}`)
			);
			expect(await present.json(), topic).toEqual([ada.user.id]);
		}
	});

	it('does not bring back a topic left while another subscribe was being checked', async () => {
		const { env, hub, person, connect, subscribe } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const thread = `thread:${await startDm(env, ada, bo.user.id)}`;
		const socket = connect(ada);
		await subscribe(socket, thread);

		const checking = subscribe(socket, `user:${ada.user.id}`);
		await hub.webSocketMessage(
			socket as unknown as WebSocket,
			JSON.stringify({ type: 'unsubscribe', topic: thread })
		);
		await checking;

		const present = await hub.fetch(
			new Request(`https://realtime/presence?topic=${encodeURIComponent(thread)}`)
		);
		expect(await present.json()).toEqual([]);
	});

	it('leaves a topic unsubscribed right after subscribing, before the check finished', async () => {
		const { env, hub, person, connect, subscribe } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const thread = `thread:${await startDm(env, ada, bo.user.id)}`;
		const socket = connect(ada);

		const checking = subscribe(socket, thread);
		await hub.webSocketMessage(
			socket as unknown as WebSocket,
			JSON.stringify({ type: 'unsubscribe', topic: thread })
		);
		await checking;

		const present = await hub.fetch(
			new Request(`https://realtime/presence?topic=${encodeURIComponent(thread)}`)
		);
		expect(await present.json()).toEqual([]);
	});

	it('refuses topics of any other kind', async () => {
		const { person, connect, subscribe } = await world();
		const ada = await person('Ada', 'admin');
		expect(await subscribe(connect(ada), 'org:everything')).toBe(false);
	});
});

describe('publishing', () => {
	it('reaches the sockets subscribed to the topic and no others', async () => {
		const { env, person, connect, subscribe, publish } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const cy = await person('Cy', 'member');
		const threadId = await createGroup(env, ada, 'Launch crew', [bo.user.id]);
		const adaSocket = connect(ada);
		const boSocket = connect(bo);
		const cySocket = connect(cy);
		await subscribe(adaSocket, `thread:${threadId}`);
		await subscribe(boSocket, `thread:${threadId}`);
		await subscribe(cySocket, `user:${cy.user.id}`);

		const response = await publish(`thread:${threadId}`, { type: 'message.created' });

		expect(await response.json()).toEqual({ delivered: 2 });
		for (const socket of [adaSocket, boSocket]) {
			expect(socket.sent).toContainEqual({
				topic: `thread:${threadId}`,
				payload: { type: 'message.created' }
			});
		}
		expect(cySocket.sent).toEqual([]);
	});

	it('relays typing to the thread’s other people and tells them who is here', async () => {
		const { env, hub, person, connect, subscribe } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const threadId = await startDm(env, ada, bo.user.id);
		const topic = `thread:${threadId}`;
		const adaSocket = connect(ada);
		const boSocket = connect(bo);
		await subscribe(adaSocket, topic);
		await subscribe(boSocket, topic);

		await hub.webSocketMessage(
			adaSocket as unknown as WebSocket,
			JSON.stringify({ type: 'typing', topic })
		);

		expect(boSocket.sent).toContainEqual({
			topic,
			payload: { type: 'typing', userId: ada.user.id }
		});
		expect(adaSocket.sent.some((m) => m.payload.type === 'typing')).toBe(false);
		expect(adaSocket.sent.at(-1)).toEqual({
			topic,
			payload: { type: 'presence', userIds: [ada.user.id, bo.user.id] }
		});
	});

	it('relays typing while another socket’s subscribe is still being checked', async () => {
		const { env, hub, person, connect, subscribe } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const cy = await person('Cy', 'member');
		const topic = `thread:${await startDm(env, ada, bo.user.id)}`;
		const adaSocket = connect(ada);
		const boSocket = connect(bo);
		await subscribe(adaSocket, topic);
		await subscribe(boSocket, topic);

		const release = holdQueries(env);
		const checking = subscribe(connect(cy), `user:${cy.user.id}`);
		const typing = hub.webSocketMessage(
			adaSocket as unknown as WebSocket,
			JSON.stringify({ type: 'typing', topic })
		);
		await new Promise((resolve) => setTimeout(resolve));
		const relayedWhileChecking = boSocket.sent.some((m) => m.payload.type === 'typing');
		release();
		await Promise.all([checking, typing]);

		expect(relayedWhileChecking).toBe(true);
	});

	it('stops a user hearing a topic it is told to take them off, and tells the thread they left', async () => {
		const { env, hub, person, connect, subscribe } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const topic = `thread:${await startDm(env, ada, bo.user.id)}`;
		const adaTab = connect(ada);
		const boTab = connect(bo);
		for (const socket of [adaTab, boTab]) await subscribe(socket, topic);

		await hub.fetch(
			new Request('https://realtime/unsubscribe', {
				method: 'POST',
				body: JSON.stringify({ userId: ada.user.id, topic })
			})
		);
		await hub.fetch(
			new Request('https://realtime/publish', {
				method: 'POST',
				body: JSON.stringify({ topic, payload: { type: 'message.created' } })
			})
		);

		expect(adaTab.sent.at(-1)).toEqual({ topic, payload: { type: 'denied' } });
		expect(adaTab.closed).toBeNull();
		expect(boTab.sent.slice(-2)).toEqual([
			{ topic, payload: { type: 'presence', userIds: [bo.user.id] } },
			{ topic, payload: { type: 'message.created' } }
		]);
	});

	it('closes every socket of a user it is told to disconnect, and tells the thread they left', async () => {
		const { env, hub, person, connect, subscribe } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const topic = `thread:${await startDm(env, ada, bo.user.id)}`;
		const adaTabs = [connect(ada), connect(ada)];
		const boTab = connect(bo);
		for (const socket of [...adaTabs, boTab]) await subscribe(socket, topic);

		await hub.fetch(
			new Request('https://realtime/disconnect', {
				method: 'POST',
				body: JSON.stringify({ userId: ada.user.id })
			})
		);
		// The runtime then reports each closed socket to the hub.
		for (const socket of adaTabs) await hub.webSocketClose(socket as unknown as WebSocket);

		expect(adaTabs.map((s) => s.closed)).toEqual([4001, 4001]);
		expect(boTab.closed).toBeNull();
		expect(boTab.sent.at(-1)).toEqual({
			topic,
			payload: { type: 'presence', userIds: [bo.user.id] }
		});
	});

	it('tells a call’s pages, the one opening included, whenever one opens or closes', async () => {
		const { env, hub, person, connect, subscribe } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const threadId = await startDm(env, ada, bo.user.id);
		const callId = 'call-1';
		await db(env)
			.insert(schema.calls)
			.values({ id: callId, threadId, startedBy: ada.user.id, startedAt: 0 });
		const topic = `call:${callId}`;
		const boPage = connect(bo);
		await subscribe(boPage, topic);
		const adaPage = connect(ada);

		await subscribe(adaPage, topic);
		const presence = { type: 'presence', userIds: [bo.user.id, ada.user.id] };
		expect(adaPage.sent.at(-1)).toEqual({ topic, payload: presence });
		expect(boPage.sent.at(-1)).toEqual({ topic, payload: presence });

		await hub.webSocketClose(adaPage as unknown as WebSocket);
		expect(boPage.sent.at(-1)).toEqual({
			topic,
			payload: { type: 'presence', userIds: [bo.user.id] }
		});
	});
});

describe('last seen', () => {
	// Every write to users fails, as a D1 outage would fail touchLastSeen; reads still work.
	function failUserWrites(env: Env) {
		const DB = env.DB;
		env.DB = {
			prepare: (sql: string) =>
				/^update "users"/.test(sql)
					? { bind: () => ({ run: async () => Promise.reject(new Error('D1 is down')) }) }
					: DB.prepare(sql)
		} as unknown as D1Database;
	}

	it('relays a message and announces a leave even when the write fails', async () => {
		const { env, hub, person, connect, subscribe } = await world();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const topic = `thread:${await startDm(env, ada, bo.user.id)}`;
		failUserWrites(env);
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const adaSocket = connect(ada);
		const boSocket = connect(bo);
		await subscribe(adaSocket, topic);
		await subscribe(boSocket, topic);

		await hub.webSocketMessage(
			adaSocket as unknown as WebSocket,
			JSON.stringify({ type: 'typing', topic })
		);
		expect(boSocket.sent).toContainEqual({
			topic,
			payload: { type: 'typing', userId: ada.user.id }
		});

		adaSocket.close(1000);
		await hub.webSocketClose(adaSocket as unknown as WebSocket);
		expect(boSocket.sent.at(-1)).toEqual({
			topic,
			payload: { type: 'presence', userIds: [bo.user.id] }
		});
		expect(errors).toHaveBeenCalled();
		errors.mockRestore();
	});
});
