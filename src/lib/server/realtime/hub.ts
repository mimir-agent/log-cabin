import { DurableObject } from 'cloudflare:workers';
import { canSubscribe } from './topics';
import { fromBase64 } from './comment-marks';
import {
	NoteRoom,
	type CommentMark,
	type CommentPassage,
	type NoteSocketInit,
	type NoteSocketState
} from './note-room';
import { closeCodes } from '../../notes/live';
import { touchLastSeen } from '../people/seen';
import { seenThrottleMs } from '../../people/seen';

/** The header the Worker sets on an upgrade once it has checked the session cookie. */
export const userIdHeader = 'x-campfire-user-id';
/** Set, as JSON NoteSocketInit, on an upgrade to a note's hub once the Worker checked access. */
export const noteSocketHeader = 'x-campfire-note-socket';

/** What each hibernating org socket remembers: whose it is and what it listens to. */
type SocketState = { userId: string; topics: string[] };

/** What a browser may send. typing is relayed to the topic's other subscribers. */
type ClientMessage = { type: 'subscribe' | 'unsubscribe' | 'typing'; topic: string };

function isNoteSocket(state: SocketState | NoteSocketState): state is NoteSocketState {
	return 'noteId' in state;
}

/**
 * The realtime hub. The org's instance (`idFromName('org')`) carries topics: browsers connect
 * through the Worker's /realtime route, subscribe to topics they may see, and get every payload
 * published to those topics as `{ topic, payload }`. Each note edited live has its own
 * instance (`idFromName('note:<id>')`) holding the note's shared document in a NoteRoom.
 * Sockets hibernate between messages; each is tagged with its user, and its state lives in
 * its attachment, since tags can't change after a socket is accepted.
 */
export class RealtimeHub extends DurableObject<Env> {
	private room: NoteRoom | undefined;
	/**
	 * Each socket's topic messages, one at a time in the order they came. A subscribe awaits
	 * its check between reading the socket's topics and writing them back; run side by side,
	 * two of a socket's messages would each write back their own copy and one would be lost.
	 * A socket's topics are its own, so one socket's checks never hold up another's messages.
	 */
	private topicMessages = new WeakMap<WebSocket, Promise<void>>();

	private noteRoom(noteId: string): NoteRoom {
		this.room ??= new NoteRoom(this.ctx, this.env, noteId);
		return this.room;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (request.headers.get('upgrade') === 'websocket') {
			return request.headers.has(noteSocketHeader)
				? this.acceptNote(request)
				: this.accept(request);
		}
		// Everything below is for Worker code holding this hub's stub, never a browser:
		// connectRealtime forwards only upgrades, which the branch above takes.
		if (request.method === 'POST' && url.pathname === '/publish') {
			const { topic, payload } = await request.json<{ topic: string; payload: unknown }>();
			return Response.json({ delivered: this.send(topic, payload) });
		}
		if (request.method === 'GET' && url.pathname === '/presence') {
			return Response.json(this.present(url.searchParams.get('topic') ?? ''));
		}
		if (request.method === 'POST' && url.pathname === '/disconnect') {
			const { userId } = await request.json<{ userId: string }>();
			for (const socket of this.ctx.getWebSockets(`user:${userId}`)) {
				socket.close(4001, 'signed out');
			}
			return new Response(null, { status: 204 });
		}
		if (request.method === 'POST' && url.pathname === '/unsubscribe') {
			const { userId, topic } = await request.json<{ userId: string; topic: string }>();
			this.unsubscribe(userId, topic);
			return new Response(null, { status: 204 });
		}
		if (request.method === 'POST' && url.pathname === '/note/close') {
			const { noteId } = await request.json<{ noteId: string }>();
			this.noteRoom(noteId).close(closeCodes.accessChanged, 'who may see this note changed');
			return new Response(null, { status: 204 });
		}
		if (request.method === 'POST' && url.pathname === '/note/delete') {
			const { noteId } = await request.json<{ noteId: string }>();
			await this.noteRoom(noteId).delete();
			this.room = undefined;
			return new Response(null, { status: 204 });
		}
		if (request.method === 'POST' && url.pathname === '/note/mark-comment') {
			const { noteId, commentId, userId, start, end } = await request.json<CommentPassage>();
			const room = this.noteRoom(noteId);
			const marked = await room.markComment(commentId, userId, fromBase64(start), fromBase64(end));
			return Response.json({ marked });
		}
		if (request.method === 'POST' && url.pathname === '/note/unmark-comment') {
			const { noteId, commentId, userId } = await request.json<CommentMark>();
			const unmarked = await this.noteRoom(noteId).unmarkComment(commentId, userId);
			return Response.json({ unmarked });
		}
		return new Response(`RealtimeHub: no route for ${request.method} ${url.pathname}`, {
			status: 404
		});
	}

	private userOf(request: Request): string {
		const userId = request.headers.get(userIdHeader);
		if (!userId) throw new Error(`RealtimeHub: upgrade without ${userIdHeader}`);
		return userId;
	}

	private accept(request: Request): Response {
		const userId = this.userOf(request);
		const [client, server] = Object.values(new WebSocketPair());
		this.ctx.acceptWebSocket(server, [`user:${userId}`]);
		server.serializeAttachment({ userId, topics: [] } satisfies SocketState);
		return new Response(null, { status: 101, webSocket: client });
	}

	private async acceptNote(request: Request): Promise<Response> {
		const userId = this.userOf(request);
		const init: NoteSocketInit = JSON.parse(request.headers.get(noteSocketHeader)!);
		const [client, server] = Object.values(new WebSocketPair());
		this.ctx.acceptWebSocket(server, [`user:${userId}`]);
		server.serializeAttachment({
			...init,
			userId,
			clients: {},
			checkedAt: Date.now()
		} satisfies NoteSocketState);
		await this.noteRoom(init.noteId).join(server);
		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
		const state = socket.deserializeAttachment() as SocketState | NoteSocketState;
		try {
			if (isNoteSocket(state)) return await this.noteRoom(state.noteId).receive(socket, state, raw);
			const previous = this.topicMessages.get(socket) ?? Promise.resolve();
			const turn = previous.then(() => this.topicMessage(socket, raw));
			// A failed message still fails for the runtime, but doesn't stop the ones after it.
			this.topicMessages.set(
				socket,
				turn.catch(() => {})
			);
			return await turn;
		} finally {
			await this.recordSeen(state.userId);
		}
	}

	private async topicMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
		const state = socket.deserializeAttachment() as SocketState;
		let message: ClientMessage;
		try {
			message = JSON.parse(String(raw));
		} catch {
			socket.close(1007, 'expected JSON { type, topic }');
			return;
		}
		const { type, topic } = message;
		if (type === 'subscribe') {
			if (!(await canSubscribe(this.env, state.userId, topic))) {
				socket.send(JSON.stringify({ topic, payload: { type: 'denied' } }));
				return;
			}
			if (!state.topics.includes(topic)) state.topics.push(topic);
			socket.serializeAttachment(state);
			this.announcePresence(topic);
		} else if (type === 'unsubscribe') {
			state.topics = state.topics.filter((t) => t !== topic);
			socket.serializeAttachment(state);
			this.announcePresence(topic);
		} else if (type === 'typing' && state.topics.includes(topic)) {
			this.send(topic, { type: 'typing', userId: state.userId }, socket);
		}
	}

	async webSocketClose(socket: WebSocket): Promise<void> {
		const state = socket.deserializeAttachment() as SocketState | NoteSocketState;
		try {
			if (isNoteSocket(state)) return await this.noteRoom(state.noteId).leave(socket, state);
			for (const topic of state.topics) this.announcePresence(topic, socket);
		} finally {
			await this.recordSeen(state.userId);
		}
	}

	/**
	 * A live connection counts as being here. It's recorded after the socket's own work, and a
	 * failed write is only logged, so last seen can never cost a message or a leave. The map
	 * spares the database between writes.
	 */
	private lastSeen = new Map<string, number>();
	private async recordSeen(userId: string): Promise<void> {
		const now = Date.now();
		const known = this.lastSeen.get(userId);
		try {
			await touchLastSeen(this.env, userId, now, known);
		} catch (error) {
			console.error(
				`RealtimeHub.recordSeen: expected to record ${userId} as seen at ${now}`,
				error
			);
			return;
		}
		if (known === undefined || now - known >= seenThrottleMs) this.lastSeen.set(userId, now);
	}

	/**
	 * Only note instances set alarms: the snapshot after a pause in editing. Deleting a note
	 * removes its alarm before its storage, so an alarm always finds the note it was set for.
	 */
	async alarm(): Promise<void> {
		const noteId = NoteRoom.storedNoteId(this.ctx);
		if (!noteId)
			throw new Error(`RealtimeHub.alarm: expected a note instance, ${this.ctx.id} holds none`);
		await this.noteRoom(noteId).snapshot();
	}

	/**
	 * Takes a topic off every socket of this user, as when they're removed from a thread: they
	 * hear nothing more on it, and each page is told it's denied, as a refused subscribe is.
	 */
	private unsubscribe(userId: string, topic: string): void {
		for (const socket of this.ctx.getWebSockets(`user:${userId}`)) {
			const state = socket.deserializeAttachment() as SocketState;
			if (!state.topics.includes(topic)) continue;
			state.topics = state.topics.filter((t) => t !== topic);
			socket.serializeAttachment(state);
			socket.send(JSON.stringify({ topic, payload: { type: 'denied' } }));
		}
		this.announcePresence(topic);
	}

	/** Sends to every socket on the topic except `skip`; returns how many it reached. */
	private send(topic: string, payload: unknown, skip?: WebSocket): number {
		const message = JSON.stringify({ topic, payload });
		const sockets = this.subscribers(topic, skip);
		for (const socket of sockets) socket.send(message);
		return sockets.length;
	}

	/** Open sockets listening to the topic, other than `skip`. Closed ones linger until reported. */
	private subscribers(topic: string, skip?: WebSocket): WebSocket[] {
		return this.ctx
			.getWebSockets()
			.filter(
				(s) =>
					s !== skip &&
					s.readyState === WebSocket.OPEN &&
					(s.deserializeAttachment() as SocketState).topics.includes(topic)
			);
	}

	private present(topic: string, skip?: WebSocket): string[] {
		const ids = this.subscribers(topic, skip).map(
			(s) => (s.deserializeAttachment() as SocketState).userId
		);
		return [...new Set(ids)];
	}

	/**
	 * Who's looking at a chat thread or a call. A call's pages reload who's in it on each
	 * change: the hub's presence is what keeps someone in a call, and the page opening hears
	 * it too, once it's subscribed, so a leave that landed before then isn't missed.
	 */
	private announcePresence(topic: string, closing?: WebSocket): void {
		if (!topic.startsWith('thread:') && !topic.startsWith('call:')) return;
		this.send(topic, { type: 'presence', userIds: this.present(topic, closing) }, closing);
		// Someone arriving at or dropping out of a call changes the live calls too; a page that
		// reloads them also settles a call whose last browser closed without leaving.
		if (topic.startsWith('call:')) this.send('calls:live', { type: 'live' }, closing);
	}
}
