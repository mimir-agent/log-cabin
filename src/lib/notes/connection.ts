// The browser's live connection to one note: a Y.Doc and its awareness, kept in step with
// the note's hub over /realtime/note/<id>. Edits made while the socket is down stay in the
// doc and are exchanged on reconnect (each side sends the other what its state vector lacks).
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';
import {
	Awareness,
	applyAwarenessUpdate,
	encodeAwarenessUpdate,
	removeAwarenessStates
} from 'y-protocols/awareness';
import {
	closeCodes,
	messageAwareness,
	messageQueryAwareness,
	messageSync,
	type LiveUser
} from './live';

/** connecting: no socket yet. live: synced with the hub. offline: changes wait for the reconnect. closed: no retry. */
export type LiveStatus = 'connecting' | 'live' | 'offline' | 'closed';

/** Close codes after which reconnecting can't help. */
const final: number[] = [closeCodes.deleted, closeCodes.readOnly];

function frame(type: number, write: (encoder: encoding.Encoder) => void): Uint8Array {
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, type);
	write(encoder);
	return encoding.toUint8Array(encoder);
}

export class NoteConnection {
	readonly doc = new Y.Doc();
	readonly awareness = new Awareness(this.doc);
	private socket: WebSocket | null = null;
	private attempts = 0;
	private retry: ReturnType<typeof setTimeout> | undefined;
	private stopped = false;

	constructor(
		private noteId: string,
		private canWrite: boolean,
		readonly user: LiveUser,
		private onstatus: (status: LiveStatus) => void
	) {
		this.awareness.setLocalStateField('user', user);
		this.doc.on('update', this.sendUpdate);
		this.awareness.on('update', this.sendAwareness);
		addEventListener('offline', this.dropSocket);
		addEventListener('online', this.reconnectNow);
		this.onstatus('connecting');
		this.connect();
	}

	private connect() {
		const url = new URL(`/realtime/note/${this.noteId}`, location.href);
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
		const ws = new WebSocket(url);
		ws.binaryType = 'arraybuffer';
		this.socket = ws;
		ws.onopen = () => {
			this.attempts = 0;
			this.send(frame(messageSync, (e) => sync.writeSyncStep1(e, this.doc)));
			this.send(this.awarenessFrame([this.doc.clientID]));
			this.send(frame(messageQueryAwareness, () => {}));
		};
		ws.onmessage = (event) => this.receive(new Uint8Array(event.data));
		ws.onclose = (event) => this.closed(event.code);
	}

	/** The socket is gone: forget the others' cursors, then reconnect unless told not to. */
	private closed(code: number) {
		this.socket = null;
		const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID);
		removeAwarenessStates(this.awareness, others, this);
		if (this.stopped) return;
		if (final.includes(code)) {
			this.onstatus('closed');
			return;
		}
		this.onstatus('offline');
		// Access changed: be checked again at once. Otherwise 1s, 2s, 4s … capped at 30s, with jitter.
		const delay =
			code === closeCodes.accessChanged
				? 0
				: Math.min(30_000, 1000 * 2 ** this.attempts++) * (0.5 + Math.random() / 2);
		this.retry = setTimeout(() => this.connect(), delay);
	}

	private receive(data: Uint8Array) {
		const decoder = decoding.createDecoder(data);
		const type = decoding.readVarUint(decoder);
		if (type === messageSync) {
			const step = decoding.readVarUint(decoder);
			if (step === sync.messageYjsSyncStep1) {
				// The hub's state vector: send what it lacks. A read-only socket never sends changes.
				if (!this.canWrite) return;
				const reply = encoding.createEncoder();
				encoding.writeVarUint(reply, messageSync);
				sync.readSyncStep1(decoder, reply, this.doc);
				this.send(encoding.toUint8Array(reply));
			} else {
				Y.applyUpdate(this.doc, decoding.readVarUint8Array(decoder), this);
				if (step === sync.messageYjsSyncStep2) this.onstatus('live');
			}
		} else if (type === messageAwareness) {
			applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this);
		} else if (type === messageQueryAwareness) {
			this.send(this.awarenessFrame([this.doc.clientID]));
		}
	}

	private sendUpdate = (update: Uint8Array, origin: unknown) => {
		if (origin !== this) this.send(frame(messageSync, (e) => sync.writeUpdate(e, update)));
	};

	private sendAwareness = (
		changes: { added: number[]; updated: number[]; removed: number[] },
		origin: unknown
	) => {
		if (origin !== 'local') return;
		this.send(this.awarenessFrame([...changes.added, ...changes.updated, ...changes.removed]));
	};

	private awarenessFrame(clients: number[]) {
		return frame(messageAwareness, (e) =>
			encoding.writeVarUint8Array(e, encodeAwarenessUpdate(this.awareness, clients))
		);
	}

	private send(message: Uint8Array) {
		if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(message);
	}

	/**
	 * The browser says the network is gone. The socket can take a long time to notice, and
	 * its close handshake can't finish offline, so it is let go of at once.
	 */
	private dropSocket = () => {
		const ws = this.socket;
		if (!ws) return;
		ws.onclose = ws.onmessage = null;
		ws.close();
		this.closed(1006);
	};

	private reconnectNow = () => {
		if (this.socket || this.stopped) return;
		clearTimeout(this.retry);
		this.attempts = 0;
		this.connect();
	};

	destroy() {
		this.stopped = true;
		clearTimeout(this.retry);
		removeEventListener('offline', this.dropSocket);
		removeEventListener('online', this.reconnectNow);
		this.awareness.destroy();
		this.socket?.close(1000);
		this.doc.destroy();
	}
}
