import { describe, expect, it, vi } from 'vitest';
import { chatWorld, status, text } from '#lib/server/testing/chat-world.js';
import { readAttachment, storeAttachment } from '#lib/server/posts/attachments.js';
import { newId } from '#lib/id.js';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import {
	canMessage,
	chatPeople,
	createGroup,
	listThreads,
	loadThread,
	markRead,
	startDm,
	threadName
} from './threads';
import {
	deleteMessage,
	editMessage,
	listMessages,
	olderPageStart,
	sendMessage,
	threadPreview,
	toggleMessageReaction
} from './messages';

describe('who a guest can chat with', () => {
	it('offers a guest only the people who share a project with them, and them only to those people', async () => {
		const { env, person, shareProject } = await chatWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const gus = await person('Gus', 'guest');
		await shareProject(ada, gus);

		expect((await chatPeople(env, gus)).map((p) => p.name)).toEqual(['Ada']);
		expect((await chatPeople(env, ada)).map((p) => p.name)).toEqual(['Bo', 'Gus']);
		expect((await chatPeople(env, bo)).map((p) => p.name)).toEqual(['Ada']);
	});

	it('offers "Message" for someone else this member may chat with, and no one else', async () => {
		const { env, person, shareProject } = await chatWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const gus = await person('Gus', 'guest');
		const dee = await person('Dee', 'member');
		await shareProject(ada, gus);
		await db(env)
			.update(schema.members)
			.set({ deactivatedAt: Date.now() })
			.where(eq(schema.members.userId, dee.user.id));

		expect(await canMessage(env, ada, bo.user.id)).toBe(true);
		expect(await canMessage(env, ada, gus.user.id)).toBe(true);
		expect(await canMessage(env, ada, ada.user.id)).toBe(false);
		expect(await canMessage(env, ada, dee.user.id)).toBe(false);
		expect(await canMessage(env, bo, gus.user.id)).toBe(false);
		expect(await canMessage(env, gus, bo.user.id)).toBe(false);
	});

	it('refuses a DM or a group that puts a guest with someone outside their projects', async () => {
		const { env, person, shareProject } = await chatWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const gus = await person('Gus', 'guest');
		await shareProject(ada, gus);

		expect(await status(startDm(env, gus, bo.user.id))).toBe(403);
		expect(await status(startDm(env, bo, gus.user.id))).toBe(403);
		expect(await status(createGroup(env, ada, 'Mixed', [gus.user.id, bo.user.id]))).toBe(403);
		expect(await status(startDm(env, gus, ada.user.id))).toBe('ok');
	});
});

describe('threads', () => {
	it('names a thread without a title by the other people in it, as Campsite does', () => {
		expect(threadName(null, [])).toBe('Just you');
		expect(threadName(null, ['Bo'])).toBe('Bo');
		expect(threadName('', ['Bo', 'Cy'])).toBe('Bo and Cy');
		expect(threadName('', ['Bo', 'Cy', 'Dee'])).toBe('Bo and 2 others');
		expect(threadName('Launch crew', ['Bo', 'Cy'])).toBe('Launch crew');
	});

	it('keeps one DM per pair, whoever starts it', async () => {
		const { env, person } = await chatWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');

		const first = await startDm(env, ada, bo.user.id);
		expect(await startDm(env, bo, ada.user.id)).toBe(first);
		expect((await loadThread(env, bo, first)).name).toBe('Ada');
	});

	it('hides a thread from people who are not in it', async () => {
		const { env, queries, person } = await chatWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const cy = await person('Cy', 'admin');
		const id = await createGroup(env, ada, 'Launch crew', [bo.user.id]);

		expect(await status(loadThread(env, cy, id))).toBe(404);
		expect(await status(loadThread(env, ada, 'no-such-thread'))).toBe(404);
		// The membership check rides on the thread's own query; the people come after it passes.
		queries.length = 0;
		expect((await loadThread(env, bo, id)).name).toBe('Launch crew');
		expect(queries).toHaveLength(2);
	});

	it('lists threads with the last message and what each person has not read', async () => {
		const { env, person } = await chatWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const id = await createGroup(env, ada, 'Launch crew', [bo.user.id]);
		const thread = await loadThread(env, ada, id);
		// Messages sent in the millisecond the thread was opened would count as already read.
		vi.useFakeTimers({ now: Date.now() + 1000, toFake: ['Date'] });

		await sendMessage(env, ada, thread, text('First'), null);
		await sendMessage(env, ada, thread, text('Second'), null);
		vi.useRealTimers();

		expect(await listThreads(env, bo)).toMatchObject([
			{ id, name: 'Launch crew', lastText: 'Second', unread: 2 }
		]);
		expect(await listThreads(env, ada)).toMatchObject([{ unread: 0 }]);
		await markRead(env, bo, id, Date.now() + 2000);
		expect(await listThreads(env, bo)).toMatchObject([{ unread: 0 }]);
	});

	it('gives each thread the faces of the other people in it, never the reader’s own', async () => {
		const { env, person } = await chatWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const cy = await person('Cy', 'member');
		const dee = await person('Dee', 'member');
		const eli = await person('Eli', 'member');
		await createGroup(env, ada, 'Launch crew', [bo.user.id, cy.user.id, dee.user.id, eli.user.id]);
		await startDm(env, ada, bo.user.id);

		const threads = await listThreads(env, ada);
		const group = threads.find((t) => t.group);
		const dm = threads.find((t) => !t.group);
		// Three faces at most, first by name: the cluster has room for no more.
		expect(group?.faces).toEqual(['Bo', 'Cy', 'Dee']);
		expect(dm?.faces).toEqual(['Bo']);
		const bos = await listThreads(env, bo);
		expect(bos.find((t) => t.group)?.faces).toEqual(['Ada', 'Cy', 'Dee']);
		expect(bos.find((t) => !t.group)?.faces).toEqual(['Ada']);
	});
});

describe('messages', () => {
	it('keeps messages sent in the same millisecond in the order they were sent', async () => {
		const { env, person } = await chatWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const thread = await loadThread(env, ada, await startDm(env, ada, bo.user.id));
		vi.useFakeTimers({ now: Date.now() + 1000, toFake: ['Date'] });
		const sent = ['one', 'two', 'three', 'four', 'five', 'six'];
		for (const word of sent) await sendMessage(env, ada, thread, text(word), null);
		vi.useRealTimers();

		expect((await listMessages(env, bo, thread)).map((m) => m.bodyText)).toEqual(sent);
		expect(await listThreads(env, bo)).toMatchObject([{ lastText: 'six' }]);
	});

	it('pages back 20 at a time with no gap or repeat, each page with its reactions and replies', async () => {
		const { env, person } = await chatWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const thread = await loadThread(env, ada, await startDm(env, ada, bo.user.id));
		// Half of them in one millisecond, as a fast sender's would be.
		vi.useFakeTimers({ now: Date.now() - 60_000, toFake: ['Date'] });
		const sent: string[] = [];
		for (let n = 0; n < 300; n++) {
			if (n === 150) vi.useRealTimers();
			await sendMessage(env, ada, thread, text(`m${n}`), null);
			sent.push(`m${n}`);
		}
		const first = await db(env)
			.select({ id: schema.messages.id })
			.from(schema.messages)
			.where(eq(schema.messages.bodyText, 'm0'))
			.get();
		const reply = await sendMessage(env, bo, thread, text('reply to m0'), first!.id);
		await toggleMessageReaction(env, bo, thread, reply, '🎉');

		let page = await listMessages(env, ada, thread);
		const seen = [...page];
		for (let from = await olderPageStart(env, thread, page[0].id); from;) {
			page = await listMessages(env, ada, thread, from);
			const older = page.slice(
				0,
				page.findIndex((m) => m.id === seen[0].id)
			);
			expect(older.length).toBeLessThanOrEqual(20);
			seen.unshift(...older);
			from = await olderPageStart(env, thread, page[0].id);
		}

		expect(seen.map((m) => m.bodyText)).toEqual([...sent, 'reply to m0']);
		const latest = await listMessages(env, ada, thread);
		expect(latest).toHaveLength(20);
		expect(latest.at(-1)).toMatchObject({
			replyTo: { authorId: ada.user.id, authorName: 'Ada', text: 'm0' },
			reactions: [{ emoji: '🎉', count: 1, names: ['Bo'], mine: false }]
		});
	});

	it('tells the thread live and notifies the people in it who are not looking at it', async () => {
		const w = await chatWorld();
		const ada = await w.person('Ada', 'member');
		const bo = await w.person('Bo', 'member');
		const cy = await w.person('Cy', 'member');
		const id = await createGroup(w.env, ada, 'Launch crew', [bo.user.id, cy.user.id]);
		const thread = await loadThread(w.env, ada, id);
		w.present.push(bo.user.id);

		const messageId = await sendMessage(w.env, ada, thread, text('Hello'), null);

		expect(w.published).toContainEqual({
			topic: `thread:${id}`,
			payload: { type: 'message.created' }
		});
		expect(w.published).toContainEqual({
			topic: `user:${bo.user.id}`,
			payload: { type: 'chat.threads' }
		});
		expect(w.jobs).toEqual([
			expect.objectContaining({
				kind: 'message.created',
				messageId,
				threadId: id,
				authorId: ada.user.id,
				recipientIds: [cy.user.id]
			})
		]);
	});

	it('lets the author edit and delete their own message, and nobody else', async () => {
		const { env, person } = await chatWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const id = await startDm(env, ada, bo.user.id);
		const thread = await loadThread(env, ada, id);
		const boThread = await loadThread(env, bo, id);
		const first = await sendMessage(env, ada, thread, text('Hello'), null);
		const reply = await sendMessage(env, bo, boThread, text('Hi back'), first);

		expect(await status(editMessage(env, bo, boThread, first, text('Changed')))).toBe(403);
		expect(await status(deleteMessage(env, bo, boThread, first))).toBe(403);
		await editMessage(env, ada, thread, first, text('Hello there'));
		let messages = await listMessages(env, ada, thread);
		expect(messages[0]).toMatchObject({ editedAt: expect.any(Number) });
		expect(messages[1]).toMatchObject({
			id: reply,
			replyTo: { authorId: ada.user.id, authorName: 'Ada', text: 'Hello there' }
		});

		await deleteMessage(env, ada, thread, first);
		messages = await listMessages(env, bo, boThread);
		expect(messages[0]).toMatchObject({ body: null, deletedAt: expect.any(Number) });
		expect(messages[1].replyTo).toEqual({ authorId: ada.user.id, authorName: 'Ada', text: null });
	});

	it('stores a message sent again under the same id once, and refuses that id elsewhere', async () => {
		const { env, jobs, published, person } = await chatWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const cy = await person('Cy', 'member');
		const thread = await loadThread(env, ada, await startDm(env, ada, bo.user.id));
		const boThread = await loadThread(env, bo, thread.id);
		const other = await loadThread(env, ada, await startDm(env, ada, cy.user.id));
		const id = newId();

		await sendMessage(env, ada, thread, text('Once'), null, id);
		const told = [published.length, jobs.length];
		expect(await sendMessage(env, ada, thread, text('Once'), null, id)).toBe(id);
		expect(await listMessages(env, ada, thread)).toHaveLength(1);
		expect([published.length, jobs.length], 'nobody is told twice').toEqual(told);
		expect(await status(sendMessage(env, bo, boThread, text('Mine'), null, id))).toBe(409);
		expect(await status(sendMessage(env, ada, other, text('Moved'), null, id))).toBe(409);
	});

	it('toggles a reaction on a message', async () => {
		const { env, person } = await chatWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const id = await startDm(env, ada, bo.user.id);
		const thread = await loadThread(env, ada, id);
		const messageId = await sendMessage(env, ada, thread, text('Ship it'), null);
		const boThread = await loadThread(env, bo, id);

		await toggleMessageReaction(env, bo, boThread, messageId, '🎉');
		expect((await listMessages(env, ada, thread))[0].reactions).toEqual([
			{ emoji: '🎉', count: 1, names: ['Bo'], mine: false }
		]);
		await toggleMessageReaction(env, bo, boThread, messageId, '🎉');
		expect((await listMessages(env, ada, thread))[0].reactions).toEqual([]);
		expect(await status(toggleMessageReaction(env, bo, boThread, messageId, 'nope'))).toBe(400);
	});

	it('serves a thread’s attachment to the people in it and 404s for everyone else', async () => {
		const { env, person } = await chatWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const cy = await person('Cy', 'admin');
		const id = await startDm(env, ada, bo.user.id);
		const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });
		const stored = await storeAttachment(env, ada, { threadId: id }, file);

		expect((await readAttachment(env, bo, stored.id)).row.name).toBe('notes.txt');
		expect(await status(readAttachment(env, cy, stored.id))).toBe(404);
	});
});

describe('a thread’s preview on hover', () => {
	it('shows its latest messages to a member without marking them read, and nothing to others', async () => {
		const { env, person } = await chatWorld();
		const ada = await person('Ada', 'member');
		const bo = await person('Bo', 'member');
		const cy = await person('Cy', 'member');
		const id = await createGroup(env, ada, 'Launch crew', [bo.user.id]);
		const thread = await loadThread(env, ada, id);
		vi.useFakeTimers({ now: Date.now() + 1000, toFake: ['Date'] });
		for (const n of [1, 2, 3, 4, 5, 6, 7])
			await sendMessage(env, ada, thread, text(`Note ${n}`), null);
		vi.useRealTimers();

		const preview = await threadPreview(env, bo, id);

		expect(preview.name).toBe('Launch crew');
		expect(preview.messages.map((m) => [m.authorName, m.text])).toEqual(
			[3, 4, 5, 6, 7].map((n) => ['Ada', `Note ${n}`])
		);
		expect(await listThreads(env, bo)).toMatchObject([{ unread: 7 }]);
		expect(await status(threadPreview(env, cy, id))).toBe(404);
	});
});
