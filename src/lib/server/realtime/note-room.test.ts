import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';
import * as buf from 'lib0/buffer';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import {
	absolutePositionToRelativePosition,
	initProseMirrorDoc,
	yXmlFragmentToProsemirrorJSON
} from '@tiptap/y-tiptap';
import { documentSchema } from '../../editor/extensions';
import type { DocNode } from '../../editor/doc';
import { newId } from '../../id';
import type { SignedIn } from '../auth/session';
import type { Role } from '../db/schema';
import { upsertDevMember } from '../dev-login';
import { suggestUsername } from '../people/usernames';
import type { JobMessage } from '../events';
import { fakeD1 } from '../testing/fake-d1';
import { useTestEnv } from '../testing/env';
import { FakeSocket, fakeBucket, fakeDurableObjectState } from '../testing/fake-durable-object';
import { createNote, deleteNote, shareWithPeople, validateNoteInput } from '../notes/notes';
import { loadNote } from '../notes/access';
import { search } from '../search/search';
import {
	bodyField,
	closeCodes,
	cursorHue,
	messageAwareness,
	messageQueryAwareness,
	messageSync
} from '../../notes/live';
import { RealtimeHub } from './hub';
import { idleMs, NoteRoom, recheckMs, snapshotKey, type NoteSocketState } from './note-room';

function frame(type: number, write: (e: encoding.Encoder) => void): ArrayBuffer {
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, type);
	write(encoder);
	return encoding.toUint8Array(encoder).slice().buffer;
}

/**
 * A browser tab on the note, speaking the same frames as src/lib/notes/connection.ts: it
 * sends its own changes as they happen and applies whatever the hub sent once `flush`ed.
 */
class Tab {
	readonly doc = new Y.Doc();
	readonly awareness = new Awareness(this.doc);
	socket!: FakeSocket;
	private read = 0;
	private sending: Promise<void>[] = [];

	constructor(
		private world: TabWorld,
		readonly who: SignedIn,
		private canWrite: boolean
	) {
		this.doc.on('update', (update: Uint8Array, origin: unknown) => {
			if (origin === this || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
			this.sending.push(this.send(frame(messageSync, (e) => sync.writeUpdate(e, update))));
		});
		this.awareness.setLocalStateField('user', { name: 'Anyone at all', hue: 'red' });
	}

	async connect() {
		const state: NoteSocketState = {
			noteId: this.world.noteId,
			canWrite: this.canWrite,
			name: this.who.user.name,
			userId: this.who.user.id,
			clients: {},
			checkedAt: Date.now()
		};
		this.socket = new FakeSocket(state);
		this.read = 0;
		this.world.ctx.acceptWebSocket(this.socket as unknown as WebSocket);
		await this.world.room().join(this.socket as unknown as WebSocket);
		await this.send(frame(messageSync, (e) => sync.writeSyncStep1(e, this.doc)));
		await this.sendAwareness();
		await this.send(frame(messageQueryAwareness, () => {}));
	}

	send(data: ArrayBuffer) {
		const state = this.socket.deserializeAttachment() as NoteSocketState;
		return this.world.room().receive(this.socket as unknown as WebSocket, state, data);
	}

	/** Applies what the hub sent since the last flush, replying as the browser would. */
	async flush() {
		await Promise.all(this.sending);
		while (this.read < this.socket.sent.length) {
			const decoder = decoding.createDecoder(this.socket.sent[this.read++] as Uint8Array);
			const type = decoding.readVarUint(decoder);
			if (type === messageSync) {
				const step = decoding.readVarUint(decoder);
				if (step === sync.messageYjsSyncStep1) {
					const sv = decoding.readVarUint8Array(decoder);
					if (this.canWrite) {
						await this.send(frame(messageSync, (e) => sync.writeSyncStep2(e, this.doc, sv)));
					}
				} else {
					Y.applyUpdate(this.doc, decoding.readVarUint8Array(decoder), this);
				}
			} else if (type === messageAwareness) {
				applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this);
			} else if (type === messageQueryAwareness) {
				await this.sendAwareness();
			}
		}
	}

	sendAwareness(clients = [this.doc.clientID]) {
		return this.send(
			frame(messageAwareness, (e) =>
				encoding.writeVarUint8Array(e, encodeAwarenessUpdate(this.awareness, clients))
			)
		);
	}

	async leave() {
		this.socket.readyState = WebSocket.CLOSED;
		const state = this.socket.deserializeAttachment() as NoteSocketState;
		await this.world.room().leave(this.socket as unknown as WebSocket, state);
	}

	/** Types into the first paragraph at `index`, the way the editor binding does. */
	type(text: string, index = 0) {
		const paragraph = this.doc.getXmlFragment(bodyField).get(0) as Y.XmlElement;
		(paragraph.get(0) as Y.XmlText).insert(index, text);
	}

	text() {
		return this.doc.getXmlFragment(bodyField).toString();
	}
}

/** What a tab needs of the world: the note, and the hub instance holding it. */
type TabWorld = { noteId: string; ctx: DurableObjectState; room: () => NoteRoom };

async function world() {
	const { DB, sqlite } = fakeD1();
	const { bucket, objects } = fakeBucket();
	const jobs: JobMessage[] = [];
	const env = {
		DB,
		BUCKET: bucket,
		JOBS: { send: async (message: JobMessage) => void jobs.push(message) },
		REALTIME: {
			idFromName: (name: string) => name,
			get: () => ({ fetch: async () => new Response(null, { status: 204 }) })
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
	const author = await person('Ada');
	const body = {
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Packing list' }] }]
	};
	const input = validateNoteInput({ title: 'Trip', body: JSON.stringify(body) });
	if (!input.ok) throw new Error(input.message);
	const noteId = await createNote(env, author, input.input);
	let state = fakeDurableObjectState();
	let current: NoteRoom | undefined;
	const w = {
		env,
		sqlite,
		objects,
		jobs,
		person,
		author,
		noteId,
		get ctx() {
			return state.ctx;
		},
		alarm: () => state.alarm(),
		room: () => (current ??= new NoteRoom(state.ctx, env, noteId)),
		/** The instance is evicted: memory is gone, its SQLite storage stays. */
		evict: () => void (current = undefined),
		/** A different instance with empty storage, as after its storage was lost. */
		freshStorage: () => {
			state = fakeDurableObjectState();
			current = undefined;
		},
		tab: async (who: SignedIn, canWrite = true) => {
			const tab = new Tab(w, who, canWrite);
			await tab.connect();
			return tab;
		},
		storedNote: () =>
			sqlite
				.prepare('SELECT body, body_text, version, updated_by FROM notes WHERE id = ?')
				.get(noteId) as {
				body: string;
				body_text: string;
				version: number;
				updated_by: string;
			}
	};
	return w;
}

/** Flushes every tab until nothing more arrives. */
async function settle(...tabs: Tab[]) {
	for (let round = 0; round < 4; round++) for (const tab of tabs) await tab.flush();
}

describe('editing a note together', () => {
	it('converges when two people type in the same paragraph at once', async () => {
		const w = await world();
		const bo = await w.person('Bo');
		const ada = await w.tab(w.author);
		const boTab = await w.tab(bo);
		await settle(ada, boTab);
		expect(ada.text()).toBe('<paragraph>Packing list</paragraph>');

		ada.type('Tents. ');
		boTab.type('Stoves. ');
		await settle(ada, boTab);

		expect(ada.text()).toBe(boTab.text());
		expect(ada.text()).toContain('Tents. ');
		expect(ada.text()).toContain('Stoves. ');
		expect(ada.text()).toContain('Packing list');
	});

	it('shows each person by the name and colour the server knows, whatever they claim', async () => {
		const w = await world();
		const bo = await w.person('Bo');
		const ada = await w.tab(w.author);
		const boTab = await w.tab(bo);
		await settle(ada, boTab);

		const seenByAda = ada.awareness.getStates().get(boTab.doc.clientID);
		expect(seenByAda?.user).toEqual({ id: bo.user.id, name: 'Bo', hue: cursorHue(bo.user.id) });
		const seenByBo = boTab.awareness.getStates().get(ada.doc.clientID);
		expect(seenByBo?.user).toEqual({
			id: w.author.user.id,
			name: 'Ada',
			hue: cursorHue(w.author.user.id)
		});
	});

	it("doesn't let one person move or remove someone else's cursor", async () => {
		const w = await world();
		const bo = await w.person('Bo');
		const ada = await w.tab(w.author);
		const boTab = await w.tab(bo);
		await settle(ada, boTab);

		// Bo claims Ada's client id and sends a state for it.
		boTab.awareness.states.set(ada.doc.clientID, { cursor: 'forged' });
		boTab.awareness.meta.set(ada.doc.clientID, { clock: 99, lastUpdated: Date.now() });
		await boTab.sendAwareness([ada.doc.clientID]);
		await settle(ada, boTab);

		expect(ada.awareness.getStates().get(ada.doc.clientID)?.cursor).toBeUndefined();
	});

	it('takes a person away from everyone else when they leave', async () => {
		const w = await world();
		const bo = await w.person('Bo');
		const ada = await w.tab(w.author);
		const boTab = await w.tab(bo);
		await settle(ada, boTab);
		expect(ada.awareness.getStates().has(boTab.doc.clientID)).toBe(true);

		await boTab.leave();
		await settle(ada);
		expect(ada.awareness.getStates().has(boTab.doc.clientID)).toBe(false);
	});
});

describe('a person the note is shared with to view', () => {
	it('sees live changes, and every change they send is refused', async () => {
		const w = await world();
		const cy = await w.person('Cy');
		const ada = await w.tab(w.author);
		const viewer = await w.tab(cy, false);
		await settle(ada, viewer);

		ada.type('Tents. ');
		await settle(ada, viewer);
		expect(viewer.text()).toContain('Tents. Packing list');

		// A forged update: the browser never sends one for a read-only note.
		const forged = new Y.Doc();
		Y.applyUpdate(forged, Y.encodeStateAsUpdate(viewer.doc));
		const paragraph = forged.getXmlFragment(bodyField).get(0) as Y.XmlElement;
		(paragraph.get(0) as Y.XmlText).insert(0, 'Hacked. ');
		const update = Y.encodeStateAsUpdate(forged, Y.encodeStateVector(viewer.doc));
		const sentToAda = ada.socket.sent.length;
		await viewer.send(frame(messageSync, (e) => sync.writeUpdate(e, update)));

		expect(viewer.socket.closed?.code).toBe(closeCodes.readOnly);
		expect(ada.socket.sent.length).toBe(sentToAda);
		await ada.leave();
		expect(w.storedNote().body_text).toBe('Tents. Packing list');
		const snapshot = new Y.Doc();
		Y.applyUpdate(snapshot, w.objects.get(snapshotKey(w.noteId))!);
		expect(snapshot.getXmlFragment(bodyField).toString()).not.toContain('Hacked');
	});

	it('refuses sync step 2 from a read-only socket too', async () => {
		const w = await world();
		const cy = await w.person('Cy');
		const viewer = await w.tab(cy, false);
		const state = viewer.socket.deserializeAttachment() as NoteSocketState;
		const step2 = frame(messageSync, (e) => {
			encoding.writeVarUint(e, sync.messageYjsSyncStep2);
			encoding.writeVarUint8Array(e, Y.encodeStateAsUpdate(new Y.Doc()));
		});
		await w.room().receive(viewer.socket as unknown as WebSocket, state, step2);
		expect(viewer.socket.closed?.code).toBe(closeCodes.readOnly);
	});
});

describe('keeping what was written', () => {
	it('stores the merged document in R2 and its text in D1 when the last person leaves', async () => {
		const w = await world();
		const bo = await w.person('Bo');
		await shareWithPeople(
			w.env,
			w.author,
			await loadNote(w.env, w.author, w.noteId),
			[bo.user.id],
			'edit'
		);
		const ada = await w.tab(w.author);
		const boTab = await w.tab(bo);
		await settle(ada, boTab);
		ada.type('Tents. ');
		boTab.type('Zephyrquartz stoves. ');
		await settle(ada, boTab);
		const merged = ada.text();

		await ada.leave();
		expect(w.objects.has(snapshotKey(w.noteId))).toBe(false);
		await boTab.leave();

		const snapshot = new Y.Doc();
		Y.applyUpdate(snapshot, w.objects.get(snapshotKey(w.noteId))!);
		expect(snapshot.getXmlFragment(bodyField).toString()).toBe(merged);
		const stored = w.storedNote();
		expect(stored.version).toBe(2);
		expect(stored.updated_by).toBe(bo.user.id);
		expect(stored.body_text).toContain('Zephyrquartz stoves.');
		expect(JSON.parse(stored.body).content[0].type).toBe('paragraph');
		const hits = await search(w.env, w.author, 'zephyrquartz', { limit: 10 });
		expect(hits.map((h) => h.id)).toEqual([w.noteId]);
	});

	it('snapshots after a pause in editing, from the alarm, even after the instance was evicted', async () => {
		const w = await world();
		const ada = await w.tab(w.author);
		await settle(ada);
		const before = Date.now();
		ada.type('Tents. ');
		await settle(ada);
		expect(w.alarm()).toBeGreaterThanOrEqual(before + idleMs);

		w.evict();
		await new RealtimeHub(w.ctx, w.env).alarm();
		expect(w.storedNote().body_text).toBe('Tents. Packing list');
		expect(w.objects.has(snapshotKey(w.noteId))).toBe(true);
	});

	it('writes nothing when nothing changed since the last snapshot', async () => {
		const w = await world();
		const ada = await w.tab(w.author);
		await settle(ada);
		await ada.leave();
		expect(w.objects.has(snapshotKey(w.noteId))).toBe(false);
		expect(w.storedNote().version).toBe(1);
	});

	it('tells a person newly mentioned in the live document, once', async () => {
		const w = await world();
		const bo = await w.person('Bo');
		await shareWithPeople(
			w.env,
			w.author,
			await loadNote(w.env, w.author, w.noteId),
			[bo.user.id],
			'view'
		);
		const ada = await w.tab(w.author);
		await settle(ada);
		const paragraph = ada.doc.getXmlFragment(bodyField).get(0) as Y.XmlElement;
		const mention = new Y.XmlElement('mention');
		mention.setAttribute('id', bo.user.id);
		mention.setAttribute('label', 'Bo');
		paragraph.insert(1, [mention]);
		await settle(ada);
		await w.room().snapshot();
		ada.type('Hi ');
		await settle(ada);
		await w.room().snapshot();

		const mentions = w.jobs.filter((j) => j.kind === 'mention');
		expect(mentions).toEqual([
			expect.objectContaining({
				subjectId: w.noteId,
				mentionedUserId: bo.user.id,
				authorId: w.author.user.id
			})
		]);
	});
});

describe('a note written before live editing', () => {
	it('opens with its stored body, seeded into the document only once', async () => {
		const w = await world();
		const ada = await w.tab(w.author);
		await settle(ada);
		expect(ada.text()).toBe('<paragraph>Packing list</paragraph>');
		ada.type('Tents. ');
		await settle(ada);

		// The stored body changes behind the document's back; a new instance must not reseed.
		w.sqlite.prepare(`UPDATE notes SET body = ? WHERE id = ?`).run(
			JSON.stringify({
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Other' }] }]
			}),
			w.noteId
		);
		w.evict();
		const again = await w.tab(w.author);
		await settle(again);
		expect(again.text()).toBe('<paragraph>Tents. Packing list</paragraph>');
	});

	it('loads the R2 snapshot, not the stored body, into an instance with empty storage', async () => {
		const w = await world();
		const ada = await w.tab(w.author);
		await settle(ada);
		ada.type('Tents. ');
		await settle(ada);
		await ada.leave();

		w.freshStorage();
		const again = await w.tab(w.author);
		await settle(again);
		// Merging the old tab's document must not duplicate the seeded paragraph.
		Y.applyUpdate(again.doc, Y.encodeStateAsUpdate(ada.doc));
		expect(again.text()).toBe('<paragraph>Tents. Packing list</paragraph>');
	});
});

describe('coming back after being offline', () => {
	it('merges what was typed offline with what others typed meanwhile', async () => {
		const w = await world();
		const bo = await w.person('Bo');
		const ada = await w.tab(w.author);
		const boTab = await w.tab(bo);
		await settle(ada, boTab);

		await ada.leave();
		ada.type('Offline tents. ');
		boTab.type('Online stoves. ');
		await settle(boTab);
		expect(boTab.text()).not.toContain('Offline tents.');

		await ada.connect();
		await settle(ada, boTab);
		expect(ada.text()).toBe(boTab.text());
		expect(ada.text()).toContain('Offline tents. ');
		expect(ada.text()).toContain('Online stoves. ');
	});
});

describe('when the note changes hands', () => {
	it('cuts off someone who lost access, at their next frame after the recheck interval', async () => {
		const w = await world();
		const bo = await w.person('Bo');
		await shareWithPeople(
			w.env,
			w.author,
			await loadNote(w.env, w.author, w.noteId),
			[bo.user.id],
			'edit'
		);
		const ada = await w.tab(w.author);
		const boTab = await w.tab(bo);
		await settle(ada, boTab);

		// Access ends without anything closing the socket, as when Bo leaves the note's project.
		w.sqlite.prepare('DELETE FROM note_shares WHERE user_id = ?').run(bo.user.id);
		boTab.type('Still here? ');
		await settle(ada, boTab);
		expect(ada.text()).toContain('Still here? ');

		const stale = boTab.socket.deserializeAttachment() as NoteSocketState;
		boTab.socket.serializeAttachment({ ...stale, checkedAt: Date.now() - recheckMs });
		boTab.type('Gone? ');
		await settle(ada, boTab);
		expect(boTab.socket.closed?.code).toBe(closeCodes.accessChanged);
		expect(ada.text()).not.toContain('Gone? ');
	});
	it('closes every socket on a deleted note and forgets its document', async () => {
		const w = await world();
		const ada = await w.tab(w.author);
		await settle(ada);
		ada.type('Tents. ');
		await settle(ada);
		await ada.leave();
		const other = await w.tab(w.author);
		const thumbnails = [`notes/${w.noteId}/thumb-3.png`, `notes/${w.noteId}/thumb-3-grid.png`];
		for (const key of thumbnails) w.objects.set(key, new Uint8Array([1]));
		w.objects.set('notes/another/thumb-1.png', new Uint8Array([1]));

		await w.room().delete();
		expect(other.socket.closed?.code).toBe(closeCodes.deleted);
		expect(w.objects.has(snapshotKey(w.noteId))).toBe(false);
		expect(
			thumbnails.filter((key) => w.objects.has(key)),
			'its thumbnails deleted'
		).toEqual([]);
		expect(w.objects.has('notes/another/thumb-1.png'), 'another note’s kept').toBe(true);
		expect(NoteRoom.storedNoteId(w.ctx)).toBeUndefined();
		expect(w.alarm()).toBeNull();
	});

	it('leaves nothing of a note deleted while a snapshot is being written', async () => {
		const w = await world();
		const ada = await w.tab(w.author);
		await settle(ada);
		ada.type('Tents. ');
		await settle(ada);
		let release!: () => void;
		const put = w.env.BUCKET.put.bind(w.env.BUCKET);
		w.env.BUCKET.put = (async (...args: Parameters<R2Bucket['put']>) => {
			await new Promise<void>((resolve) => (release = resolve));
			return put(...args);
		}) as R2Bucket['put'];

		const snapshotting = w.room().snapshot();
		await deleteNote(w.env, w.author, await loadNote(w.env, w.author, w.noteId));
		const deleting = w.room().delete();
		release();
		await Promise.all([snapshotting, deleting]);

		expect(w.objects.has(snapshotKey(w.noteId))).toBe(false);
		expect(w.sqlite.prepare('SELECT count(*) AS n FROM notes').get()).toEqual({ n: 0 });
		expect(NoteRoom.storedNoteId(w.ctx)).toBeUndefined();
	});
});

/**
 * A passage of the tab's copy of the document, from the start of `phrase` to the end of
 * `through`, as the browser encodes it: ProseMirror positions made relative with the binding's
 * mapping, then Y.encodeRelativePosition and base64.
 */
function passage(tab: Tab, phrase: string, through = phrase) {
	const fragment = tab.doc.getXmlFragment(bodyField);
	const { doc, mapping } = initProseMirrorDoc(fragment, documentSchema());
	const find = (words: string) => {
		let at = -1;
		doc.descendants((node, pos) => {
			if (at < 0 && node.isText && node.text!.includes(words)) at = pos + node.text!.indexOf(words);
		});
		if (at < 0) throw new Error(`expected "${words}" in ${fragment.toString()}`);
		return at;
	};
	const encode = (pos: number) =>
		buf.toBase64(
			Y.encodeRelativePosition(absolutePositionToRelativePosition(pos, fragment, mapping))
		);
	return { start: encode(find(phrase)), end: encode(find(through) + through.length) };
}

/** The words the comment's mark covers in the tab's copy, one entry per paragraph. */
function marked(tab: Tab, commentId: string): string[] {
	const body = yXmlFragmentToProsemirrorJSON(tab.doc.getXmlFragment(bodyField)) as DocNode;
	return (body.content ?? [])
		.map((paragraph) =>
			(paragraph.content ?? [])
				.filter((node) =>
					node.marks?.some((m) => m.type === 'noteComment' && m.attrs?.commentId === commentId)
				)
				.map((node) => node.text)
				.join('')
		)
		.filter(Boolean);
}

describe('a comment made on a passage of the note', () => {
	/** Ada edits; Cy may only view, so his tab's socket is read-only. */
	async function commenting() {
		const w = await world();
		const cy = await w.person('Cy');
		const ada = await w.tab(w.author);
		const viewer = await w.tab(cy, false);
		await settle(ada, viewer);
		const mark = (commentId: string, at: { start: string; end: string }) =>
			w.room().markComment(commentId, cy.user.id, buf.fromBase64(at.start), buf.fromBase64(at.end));
		return { w, cy, ada, viewer, mark };
	}

	it('marks exactly the words chosen, for everyone, though the commenter can only view', async () => {
		const { ada, viewer, mark } = await commenting();
		const id = newId();
		expect(await mark(id, passage(viewer, 'list')), 'a viewer’s passage is marked').toBe(true);
		await settle(ada, viewer);
		expect(marked(ada, id)).toEqual(['list']);
		expect(marked(viewer, id)).toEqual(['list']);
		expect(viewer.socket.closed, 'the read-only socket stays open').toBeNull();
	});

	it('keeps covering the words when someone types before and inside them first', async () => {
		const { ada, viewer, mark } = await commenting();
		const id = newId();
		const at = passage(viewer, 'list');
		ada.type('Tent ', 0);
		ada.type('-', 'Tent Packing li'.length);
		await settle(ada, viewer);
		expect(ada.text()).toContain('Tent Packing li-st');

		await mark(id, at);
		await settle(ada, viewer);
		expect(marked(ada, id)).toEqual(['li-st']);
		expect(marked(viewer, id)).toEqual(['li-st']);
	});

	it('keeps covering the words when someone types before and inside them after', async () => {
		const { ada, viewer, mark } = await commenting();
		const id = newId();
		await mark(id, passage(viewer, 'list'));
		await settle(ada, viewer);
		ada.type('Tent ', 0);
		ada.type('-', 'Tent Packing li'.length);
		await settle(ada, viewer);
		expect(marked(ada, id)).toEqual(['li-st']);
		expect(marked(viewer, id)).toEqual(['li-st']);
	});

	it('marks both parts of a passage across two paragraphs', async () => {
		const { ada, viewer, mark } = await commenting();
		const second = new Y.XmlElement('paragraph');
		second.insert(0, [new Y.XmlText('Stoves and fuel')]);
		ada.doc.getXmlFragment(bodyField).insert(1, [second]);
		await settle(ada, viewer);
		const id = newId();
		await mark(id, passage(viewer, 'list', 'Stoves'));
		await settle(ada, viewer);
		expect(marked(ada, id)).toEqual(['list', 'Stoves']);
		expect(marked(viewer, id)).toEqual(['list', 'Stoves']);
	});

	it('changes nothing when the words were deleted before the mark arrived', async () => {
		const { w, ada, viewer, mark } = await commenting();
		const at = passage(viewer, 'list');
		const paragraph = ada.doc.getXmlFragment(bodyField).get(0) as Y.XmlElement;
		(paragraph.get(0) as Y.XmlText).delete('Packing '.length, 'list'.length);
		await settle(ada, viewer);
		const before = Y.encodeStateVector(ada.doc);
		const sent = ada.socket.sent.length;

		expect(await mark(newId(), at), 'a passage whose words are gone is not marked').toBe(false);
		await settle(ada, viewer);
		expect(ada.socket.sent.length, 'nothing relayed').toBe(sent);
		expect(Y.encodeStateVector(ada.doc)).toEqual(before);
		const rows = w.ctx.storage.sql.exec('SELECT count(*) AS n FROM note_updates').one();
		expect(rows.n, 'only the seed and the deletion stored').toBe(2);
	});

	it('takes a deleted comment’s mark off everywhere it is, and leaves other comments’', async () => {
		const { w, cy, ada, viewer, mark } = await commenting();
		const [gone, kept] = [newId(), newId()];
		await mark(gone, passage(viewer, 'Packing list'));
		await mark(kept, passage(viewer, 'list'));
		await settle(ada, viewer);
		expect(marked(ada, gone)).toEqual(['Packing list']);

		expect(await w.room().unmarkComment(gone, cy.user.id), 'the mark is taken off').toBe(true);
		await settle(ada, viewer);
		expect(marked(ada, gone)).toEqual([]);
		expect(marked(viewer, gone)).toEqual([]);
		expect(marked(viewer, kept), 'the other comment keeps its words').toEqual(['list']);
		expect(await w.room().unmarkComment(gone, cy.user.id), 'nothing left to take off').toBe(false);
	});

	it('marks a passage the Worker asks the hub for, kept for someone who opens the note later', async () => {
		const { w, cy, viewer } = await commenting();
		const id = newId();
		const at = passage(viewer, 'Packing');
		await viewer.leave();
		w.evict();
		const response = await new RealtimeHub(w.ctx, w.env).fetch(
			new Request('https://realtime/note/mark-comment', {
				method: 'POST',
				body: JSON.stringify({ noteId: w.noteId, commentId: id, userId: cy.user.id, ...at })
			})
		);
		expect(await response.json()).toEqual({ marked: true });
		const later = await w.tab(w.author);
		await settle(later);
		expect(marked(later, id)).toEqual(['Packing']);
	});

	it('marks nothing, and keeps no document, for a note deleted before the mark arrived', async () => {
		const { w, cy, viewer, mark } = await commenting();
		const at = passage(viewer, 'list');
		await w.room().delete();
		w.evict();
		expect(await mark(newId(), at), 'no mark for a deleted note').toBe(false);
		expect(
			await w.room().unmarkComment(newId(), cy.user.id),
			'no mark to take off a deleted note'
		).toBe(false);
		expect(NoteRoom.storedNoteId(w.ctx), 'nothing seeded for the deleted note').toBeUndefined();
	});
});
