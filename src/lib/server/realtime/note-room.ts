import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { documentSchema } from '../../editor/extensions';
import type { DocNode } from '../../editor/doc';
import {
	bodyField,
	closeCodes,
	cursorHue,
	messageAwareness,
	messageQueryAwareness,
	messageSync,
	type LiveUser
} from '../../notes/live';
import { liveNoteAccess } from '../notes/access';
import { storedBody, saveLiveBody } from '../notes/notes';
import { markComment, unmarkComment } from './comment-marks';

/** What the Worker tells the hub about a note socket once it has checked the session. */
export type NoteSocketInit = { noteId: string; canWrite: boolean; name: string };

/** Which comment's mark, on which note, on whose behalf: what the Worker tells the hub. */
export type CommentMark = { noteId: string; commentId: string; userId: string };
/**
 * A new comment's passage: its start and end as Y.RelativePositions, encoded
 * (Y.encodeRelativePosition) and then base64, as the commenter's browser made them.
 */
export type CommentPassage = CommentMark & { start: string; end: string };

/**
 * A note socket's attachment: who it is, the awareness client ids (with clocks) it owns,
 * and when its access was last checked.
 */
export type NoteSocketState = NoteSocketInit & {
	userId: string;
	clients: Record<string, number>;
	checkedAt: number;
};

/** Snapshot to R2 and D1 once nobody has changed the note for this long. */
export const idleMs = 5_000;

/**
 * How long a socket's access holds before its next frame checks it again. Sharing changes
 * close the sockets at once; this catches the rest (project membership, roles, deactivation).
 * Browsers renew their awareness every 15 s, so even a silent reader is checked.
 */
export const recheckMs = 60_000;

export function snapshotKey(noteId: string): string {
	return `notes/${noteId}/ydoc.bin`;
}

/**
 * Who made a change the document applied: a socket's, or, with no socket, the hub's own on
 * someone's behalf (a comment's passage), which every socket is sent.
 */
type UpdateOrigin = { socket: WebSocket | null; userId: string };

type AwarenessEntry = { clientId: number; clock: number; state: Record<string, unknown> | null };

/** Whether this instance holds a note: not before its first socket, nor once the note is deleted. */
function holdsNote(ctx: DurableObjectState): boolean {
	return (
		ctx.storage.sql.exec(`SELECT 1 FROM sqlite_master WHERE name = 'note_room'`).toArray().length >
		0
	);
}

function frame(type: number, write: (encoder: encoding.Encoder) => void): Uint8Array {
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, type);
	write(encoder);
	return encoding.toUint8Array(encoder);
}

function readAwareness(update: Uint8Array): AwarenessEntry[] {
	const decoder = decoding.createDecoder(update);
	return Array.from({ length: decoding.readVarUint(decoder) }, () => ({
		clientId: decoding.readVarUint(decoder),
		clock: decoding.readVarUint(decoder),
		state: JSON.parse(decoding.readVarString(decoder))
	}));
}

function awarenessFrame(entries: AwarenessEntry[]): Uint8Array {
	return frame(messageAwareness, (encoder) => {
		const update = encoding.createEncoder();
		encoding.writeVarUint(update, entries.length);
		for (const { clientId, clock, state } of entries) {
			encoding.writeVarUint(update, clientId);
			encoding.writeVarUint(update, clock);
			encoding.writeVarString(update, JSON.stringify(state));
		}
		encoding.writeVarUint8Array(encoder, encoding.toUint8Array(update));
	});
}

/**
 * One note's live document, inside the RealtimeHub instance named `note:<id>`.
 * Every change is stored in the instance's SQLite (note_updates) before it is relayed, so
 * nothing is lost if the instance is evicted; after `idleMs` without changes, and when the
 * last person leaves, the document is written to R2, its derived body to D1, and the rows
 * are compacted into one. A fresh instance loads its rows, else the R2 snapshot, else seeds
 * the document once from the note's D1 body. Awareness is only relayed, never held: y-protocols'
 * Awareness runs a timer that would keep the instance awake.
 */
export class NoteRoom {
	private doc: Promise<Y.Doc> | undefined;
	/**
	 * The snapshot, delete or comment mark running now. Snapshots and deletes wait on R2 and
	 * D1, where other events can run, so each waits for the one before it: a snapshot can't
	 * write a deleted note back to R2, nor a mark land in a note's storage as it is deleted.
	 */
	private writing: Promise<void> = Promise.resolve();

	constructor(
		private ctx: DurableObjectState,
		private env: Env,
		readonly noteId: string
	) {}

	/**
	 * The note this instance holds, for an alarm that wakes it with nothing in memory.
	 * Undefined before the first socket, and after the note is deleted.
	 */
	static storedNoteId(ctx: DurableObjectState): string | undefined {
		if (!holdsNote(ctx)) return undefined;
		return ctx.storage.sql.exec<{ note_id: string }>('SELECT note_id FROM note_room').one().note_id;
	}

	private load(): Promise<Y.Doc> {
		this.doc ??= this.openDocument();
		return this.doc;
	}

	/**
	 * Creates the tables on first use, loads the document, and from then on stores and relays
	 * each change it applies.
	 */
	private async openDocument(): Promise<Y.Doc> {
		const { sql } = this.ctx.storage;
		if (!holdsNote(this.ctx)) {
			sql.exec(
				'CREATE TABLE note_updates (id INTEGER PRIMARY KEY, data BLOB NOT NULL, user_id TEXT)'
			);
			sql.exec('CREATE TABLE note_room (note_id TEXT NOT NULL)');
			sql.exec('INSERT INTO note_room VALUES (?)', this.noteId);
		}
		const doc = new Y.Doc();
		const rows = sql.exec<{ data: ArrayBuffer }>('SELECT data FROM note_updates ORDER BY id');
		const stored = rows.toArray();
		for (const row of stored) Y.applyUpdate(doc, new Uint8Array(row.data));
		if (stored.length === 0) {
			const snapshot = await this.env.BUCKET.get(snapshotKey(this.noteId));
			const update = snapshot ? new Uint8Array(await snapshot.arrayBuffer()) : await this.seed();
			Y.applyUpdate(doc, update);
			sql.exec('INSERT INTO note_updates (data) VALUES (?)', update);
		}
		doc.on('update', (update: Uint8Array, origin: UpdateOrigin) =>
			this.persistAndRelay(update, origin)
		);
		return doc;
	}

	/** Stores a change, sends it to everyone else here, and moves the snapshot `idleMs` out. */
	private persistAndRelay(update: Uint8Array, origin: UpdateOrigin): void {
		this.ctx.storage.sql.exec(
			'INSERT INTO note_updates (data, user_id) VALUES (?, ?)',
			update,
			origin.userId
		);
		this.broadcast(
			frame(messageSync, (e) => sync.writeUpdate(e, update)),
			origin.socket
		);
		void this.ctx.storage.setAlarm(Date.now() + idleMs);
	}

	/** A note written before live editing has a body in D1 and no document yet. */
	private async seed(): Promise<Uint8Array> {
		const seeded = new Y.Doc();
		const body = await storedBody(this.env, this.noteId);
		prosemirrorJSONToYXmlFragment(documentSchema(), body, seeded.getXmlFragment(bodyField));
		return Y.encodeStateAsUpdate(seeded);
	}

	/** A new socket gets the server's state vector, so it sends whatever the server lacks. */
	async join(socket: WebSocket): Promise<void> {
		const doc = await this.load();
		socket.send(frame(messageSync, (e) => sync.writeSyncStep1(e, doc)));
	}

	async receive(socket: WebSocket, state: NoteSocketState, raw: ArrayBuffer | string) {
		if (typeof raw === 'string') {
			socket.close(1003, 'note sockets expect binary y-protocols frames, got text');
			return;
		}
		if (!(await this.recheckAccessOrClose(socket, state))) return;
		const decoder = decoding.createDecoder(new Uint8Array(raw));
		const type = decoding.readVarUint(decoder);
		if (type === messageSync) await this.receiveSync(socket, state, decoder);
		else if (type === messageAwareness) this.receiveAwareness(socket, state, decoder);
		else if (type === messageQueryAwareness) {
			this.broadcast(
				frame(messageQueryAwareness, () => {}),
				socket
			);
		} else socket.close(1003, `note sockets expect message type 0, 1 or 3, got ${type}`);
	}

	/**
	 * Checks the socket's access again once `recheckMs` has passed. If it changed, the socket
	 * is closed, and the browser reconnects through the Worker's check.
	 */
	private async recheckAccessOrClose(socket: WebSocket, state: NoteSocketState): Promise<boolean> {
		if (Date.now() - state.checkedAt < recheckMs) return true;
		const access = await liveNoteAccess(this.env, state.userId, this.noteId);
		if (access !== (state.canWrite ? 'edit' : 'view')) {
			socket.close(closeCodes.accessChanged, `access to note ${this.noteId} is now ${access}`);
			return false;
		}
		state.checkedAt = Date.now();
		socket.serializeAttachment(state);
		return true;
	}

	private async receiveSync(socket: WebSocket, state: NoteSocketState, decoder: decoding.Decoder) {
		const doc = await this.load();
		const step = decoding.readVarUint(decoder);
		if (step === sync.messageYjsSyncStep1) {
			const reply = encoding.createEncoder();
			encoding.writeVarUint(reply, messageSync);
			sync.readSyncStep1(decoder, reply, doc);
			socket.send(encoding.toUint8Array(reply));
		} else if (step === sync.messageYjsSyncStep2 || step === sync.messageYjsUpdate) {
			if (!state.canWrite) {
				socket.close(closeCodes.readOnly, `note ${this.noteId} is read-only for this socket`);
				return;
			}
			const update = decoding.readVarUint8Array(decoder);
			Y.applyUpdate(doc, update, { socket, userId: state.userId });
		} else {
			socket.close(1003, `note sockets expect sync step 0, 1 or 2, got ${step}`);
		}
	}

	/**
	 * Relays awareness with each state's `user` replaced by who the socket really is, and
	 * drops entries for client ids another socket already owns, so nobody can move or
	 * remove someone else's cursor.
	 */
	private receiveAwareness(socket: WebSocket, state: NoteSocketState, decoder: decoding.Decoder) {
		const owned = new Set(
			this.others(socket).flatMap((s) =>
				Object.keys((s.deserializeAttachment() as NoteSocketState).clients)
			)
		);
		const user: LiveUser = { id: state.userId, name: state.name, hue: cursorHue(state.userId) };
		const entries = readAwareness(decoding.readVarUint8Array(decoder))
			.filter((entry) => !owned.has(String(entry.clientId)))
			.map((entry) => ({ ...entry, state: entry.state && { ...entry.state, user } }));
		for (const { clientId, clock, state: s } of entries) {
			if (s) state.clients[clientId] = clock;
			else delete state.clients[clientId];
		}
		socket.serializeAttachment(state);
		if (entries.length) this.broadcast(awarenessFrame(entries), socket);
	}

	/** Takes the socket's cursors away, and snapshots when it was the last one here. */
	async leave(socket: WebSocket, state: NoteSocketState): Promise<void> {
		const gone = Object.entries(state.clients).map(([clientId, clock]) => ({
			clientId: Number(clientId),
			clock: clock + 1,
			state: null
		}));
		if (gone.length) this.broadcast(awarenessFrame(gone), socket);
		if (this.others(socket).length === 0) await this.snapshot();
	}

	/**
	 * Writes the document to R2 and its derived body to D1, then compacts the rows it wrote
	 * into one. Changes that arrive meanwhile keep their rows and their own alarm.
	 */
	snapshot(): Promise<void> {
		return this.inTurn(() => this.writeSnapshot());
	}

	private async writeSnapshot(): Promise<void> {
		const { sql } = this.ctx.storage;
		if (!holdsNote(this.ctx)) return;
		const rows = sql
			.exec<{ n: number; last: number }>('SELECT count(*) AS n, max(id) AS last FROM note_updates')
			.one();
		if (rows.n <= 1) return;
		const doc = await this.load();
		const update = Y.encodeStateAsUpdate(doc);
		const editor = sql
			.exec<{ user_id: string }>(
				'SELECT user_id FROM note_updates WHERE user_id IS NOT NULL ORDER BY id DESC LIMIT 1'
			)
			.one().user_id;
		const body = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(bodyField)) as DocNode;
		await this.env.BUCKET.put(snapshotKey(this.noteId), update);
		await saveLiveBody(this.env, this.noteId, body, editor);
		this.ctx.storage.transactionSync(() => {
			sql.exec('DELETE FROM note_updates WHERE id <= ?', rows.last);
			sql.exec('INSERT INTO note_updates (id, data) VALUES (?, ?)', rows.last, update);
		});
	}

	/**
	 * Marks the passage between two relative positions, made by the commenter's browser from
	 * its copy of this document, with the comment: stored and relayed like any change, as
	 * `userId`'s. False, changing nothing, when the passage is gone; also when this instance
	 * holds no document, which, since the browser's positions came from it, means the note
	 * was deleted, so none is seeded for it.
	 */
	markComment(commentId: string, userId: string, start: Uint8Array, end: Uint8Array) {
		return this.inTurn(async () => {
			if (!holdsNote(this.ctx)) return false;
			const doc = await this.load();
			return markComment(doc, commentId, start, end, {
				socket: null,
				userId
			} satisfies UpdateOrigin);
		});
	}

	/** Takes a deleted comment's mark off its passage, wherever it is now. */
	unmarkComment(commentId: string, userId: string) {
		return this.inTurn(async () => {
			if (!holdsNote(this.ctx)) return false;
			const doc = await this.load();
			return unmarkComment(doc, commentId, { socket: null, userId } satisfies UpdateOrigin);
		});
	}

	/** Closes every socket on the note with `code`; the browser reconnects unless told not to. */
	close(code: number, reason: string): void {
		for (const socket of this.ctx.getWebSockets()) socket.close(code, reason);
	}

	/**
	 * The note is gone: close its sockets and forget the document everywhere it was kept, with
	 * everything else under its R2 prefix (its thumbnails, see notes/thumbnails.ts).
	 */
	delete(): Promise<void> {
		this.close(closeCodes.deleted, `note ${this.noteId} was deleted`);
		return this.inTurn(async () => {
			await this.ctx.storage.deleteAlarm();
			await this.ctx.storage.deleteAll();
			// Its snapshot and a thumbnail or two: far below one listing's 1000 keys. A note never
			// snapshotted or drawn has none.
			const { objects } = await this.env.BUCKET.list({ prefix: `notes/${this.noteId}/` });
			if (objects.length) await this.env.BUCKET.delete(objects.map((o) => o.key));
		});
	}

	/** Runs `write` once the previous snapshot, delete or mark has finished, failed or not. */
	private inTurn<T>(write: () => Promise<T>): Promise<T> {
		const run = this.writing.then(write);
		// A failure belongs to whoever awaits `run`; the next write still gets its turn.
		this.writing = run.then(
			() => {},
			() => {}
		);
		return run;
	}

	private others(socket: WebSocket | null): WebSocket[] {
		return this.ctx.getWebSockets().filter((s) => s !== socket && s.readyState === WebSocket.OPEN);
	}

	private broadcast(message: Uint8Array, skip: WebSocket | null): void {
		for (const socket of this.others(skip)) socket.send(message);
	}
}
