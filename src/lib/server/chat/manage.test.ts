import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { chatWorld, status, text } from '#lib/server/testing/chat-world.js';
import { loadNote } from '#lib/server/notes/access.js';
import { createNote, shareWithPeople, unshareWithPerson } from '#lib/server/notes/notes.js';
import { dropUnseenNoteFavorites, setFavorite, sidebarFavorites } from '#lib/server/favorites.js';
import {
	addPeople,
	createGroup,
	deleteThread,
	leaveThread,
	listThreads,
	loadThread,
	markRead,
	membershipUpdates,
	removePerson,
	renameThread,
	setNotificationLevel,
	setThreadPicture,
	setUnread,
	startDm,
	threadPictureKey
} from './threads';
import {
	deleteAttachments,
	deleteMessage,
	editMessage,
	listMessages,
	sendMessage
} from './messages';
import { storeAttachment } from '#lib/server/posts/attachments.js';
import { docAttachments } from '#lib/editor/doc.js';

async function cast() {
	const w = await chatWorld();
	const ada = await w.person('Ada', 'member');
	const bo = await w.person('Bo', 'member');
	const cy = await w.person('Cy', 'member');
	const dee = await w.person('Dee', 'member');
	const vic = await w.person('Vic', 'viewer');
	const gus = await w.person('Gus', 'guest');
	const max = await w.person('Max', 'admin');
	return { ...w, ada, bo, cy, dee, vic, gus, max };
}

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'face.png', { type: 'image/png' });

const note = (title: string) => ({ title, ...text(''), mentions: [] });

describe('a member’s own settings for a thread', () => {
	it('keeps each member’s notification level for the thread, and refuses a level that isn’t one', async () => {
		const { env, ada, bo, cy } = await cast();
		const id = await createGroup(env, ada, 'Crew', [bo.user.id]);

		await setNotificationLevel(env, bo, await loadThread(env, bo, id), 'mentions');

		expect((await loadThread(env, bo, id)).notificationLevel).toBe('mentions');
		expect((await loadThread(env, ada, id)).notificationLevel).toBe('all');
		expect(await status(setNotificationLevel(env, bo, await loadThread(env, bo, id), 'loud'))).toBe(
			400
		);
		expect(await status(loadThread(env, cy, id))).toBe(404);
	});

	it('keeps a thread marked unread for that member until they open it, on any device', async () => {
		const { env, ada, bo } = await cast();
		const id = await createGroup(env, ada, 'Crew', [bo.user.id]);

		await setUnread(env, bo, await loadThread(env, bo, id), true);
		expect(await listThreads(env, bo)).toMatchObject([{ id, unread: 0, markedUnread: true }]);
		expect(await listThreads(env, ada)).toMatchObject([{ markedUnread: false }]);

		// Opening the thread marks it read, as its page does.
		await markRead(env, bo, id);
		expect(await listThreads(env, bo)).toMatchObject([{ markedUnread: false }]);

		await setUnread(env, bo, await loadThread(env, bo, id), true);
		await setUnread(env, bo, await loadThread(env, bo, id), false);
		expect(await listThreads(env, bo)).toMatchObject([{ markedUnread: false }]);
	});
});

describe('a group’s name and picture', () => {
	it('lets anyone in a group rename it, live for the others, and goes back to names when cleared', async () => {
		const { env, published, ada, bo, cy } = await cast();
		const id = await createGroup(env, ada, '', [bo.user.id, cy.user.id]);
		expect((await loadThread(env, ada, id)).name).toBe('Bo and Cy');

		await renameThread(env, bo, await loadThread(env, bo, id), '  Launch crew ');
		expect((await loadThread(env, ada, id)).name).toBe('Launch crew');
		expect(published).toContainEqual({
			topic: `thread:${id}`,
			payload: { type: 'thread.updated' }
		});
		expect(published).toContainEqual({
			topic: `user:${cy.user.id}`,
			payload: { type: 'chat.threads' }
		});

		await renameThread(env, bo, await loadThread(env, bo, id), '');
		expect((await loadThread(env, ada, id)).name).toBe('Bo and Cy');
		expect((await listThreads(env, cy)).map((t) => t.name)).toEqual(['Ada and Bo']);
	});

	it('has no name or picture to change in a DM', async () => {
		const { env, ada, bo } = await cast();
		const dm = await loadThread(env, ada, await startDm(env, ada, bo.user.id));

		expect(await status(renameThread(env, ada, dm, 'Pair'))).toBe(403);
		expect(await status(setThreadPicture(env, ada, dm, png()))).toBe(403);
	});

	it('serves a group’s picture to its members only, and replaces the old one', async () => {
		const { env, objects, ada, bo, cy } = await cast();
		const id = await createGroup(env, ada, 'Crew', [bo.user.id]);

		expect(await setThreadPicture(env, ada, await loadThread(env, ada, id), png())).toBeNull();
		const first = await loadThread(env, bo, id);
		const name = first.pictureUrl!.split('/').at(-1)!;
		expect(first.pictureUrl).toBe(`/chat/${id}/picture/${name}`);
		expect(await threadPictureKey(env, bo, id, name)).toBe(first.imageKey);
		expect(await status(threadPictureKey(env, cy, id, name))).toBe(404);

		await setThreadPicture(env, bo, first, png());
		expect(objects.has(first.imageKey!)).toBe(false);
		expect(await status(threadPictureKey(env, bo, id, name))).toBe(404);
	});
});

describe('who is in a group', () => {
	it('adds and removes people with a line for each, and the removed person loses the thread at once', async () => {
		const { env, hubCalls, ada, bo, cy, dee } = await cast();
		const id = await createGroup(env, ada, 'Crew', [bo.user.id]);
		await sendMessage(env, ada, await loadThread(env, ada, id), text('Before Cy came'), null);

		expect(await addPeople(env, bo, await loadThread(env, bo, id), [cy.user.id, dee.user.id])).toBe(
			id
		);
		// Added people see the thread and what was said before them.
		expect((await loadThread(env, cy, id)).people.map((p) => p.name)).toEqual([
			'Ada',
			'Bo',
			'Cy',
			'Dee'
		]);
		await removePerson(env, ada, await loadThread(env, ada, id), dee.user.id);

		expect(await status(loadThread(env, dee, id))).toBe(404);
		expect(await listThreads(env, dee)).toEqual([]);
		expect(hubCalls).toContainEqual({
			path: '/unsubscribe',
			body: { userId: dee.user.id, topic: `thread:${id}` }
		});
		expect(await membershipUpdates(env, id)).toMatchObject([
			{ actorName: 'Bo', added: ['Cy', 'Dee'], removed: [], left: false },
			{ actorName: 'Ada', added: [], removed: ['Dee'], left: false }
		]);
	});

	it('adds a guest only when they could already chat with everyone in the group', async () => {
		const { env, shareProject, ada, bo, gus } = await cast();
		const id = await createGroup(env, ada, 'Crew', [bo.user.id]);
		await shareProject(ada, gus);

		expect(await status(addPeople(env, ada, await loadThread(env, ada, id), [gus.user.id]))).toBe(
			403
		);
		await shareProject(bo, gus);
		expect(await status(addPeople(env, ada, await loadThread(env, ada, id), [gus.user.id]))).toBe(
			'ok'
		);
	});

	it('starts a new group when someone is added to a DM, and leaves the DM as it was', async () => {
		const { env, ada, bo, cy } = await cast();
		const dmId = await startDm(env, ada, bo.user.id);

		const groupId = await addPeople(env, ada, await loadThread(env, ada, dmId), [cy.user.id]);

		expect(groupId).not.toBe(dmId);
		expect((await loadThread(env, cy, groupId)).name).toBe('Ada and Bo');
		expect((await loadThread(env, ada, dmId)).people).toHaveLength(2);
		expect(await status(loadThread(env, cy, dmId))).toBe(404);
	});

	it('leaves a group after which the thread 404s, the favorite goes, and the others see a line', async () => {
		const { env, ada, bo, cy } = await cast();
		const id = await createGroup(env, ada, 'Crew', [bo.user.id, cy.user.id]);
		await setFavorite(env, bo, { type: 'thread', id }, true);

		await leaveThread(env, bo, await loadThread(env, bo, id));

		expect(await status(loadThread(env, bo, id))).toBe(404);
		expect((await sidebarFavorites(env, bo)).threads).toEqual([]);
		expect(await membershipUpdates(env, id)).toMatchObject([
			{ actorName: 'Bo', removed: ['Bo'], left: true }
		]);
	});

	it('has no leaving, adding to or removing from in a DM, only starting a group', async () => {
		const { env, ada, bo } = await cast();
		const dm = await loadThread(env, ada, await startDm(env, ada, bo.user.id));

		expect(await status(leaveThread(env, ada, dm))).toBe(403);
		expect(await status(removePerson(env, ada, dm, bo.user.id))).toBe(403);
	});

	it('refuses every change to someone no longer in the group', async () => {
		const { env, ada, bo, cy } = await cast();
		const id = await createGroup(env, ada, 'Crew', [bo.user.id, cy.user.id]);
		const bosView = await loadThread(env, bo, id);
		await removePerson(env, ada, await loadThread(env, ada, id), bo.user.id);

		// Every action loads the thread as its caller first; Bo's page now 404s there.
		expect(await status(loadThread(env, bo, id))).toBe(404);
		expect(bosView.people.map((p) => p.name)).toContain('Bo');
	});
});

describe('deleting a thread', () => {
	it('lets an admin or member in the thread delete it for everyone, live', async () => {
		const { env, published, objects, ada, bo, max } = await cast();
		const id = await createGroup(env, ada, 'Crew', [bo.user.id, max.user.id]);
		await sendMessage(env, bo, await loadThread(env, bo, id), text('Hello'), null);

		await deleteThread(env, max, await loadThread(env, max, id));

		for (const person of [ada, bo, max])
			expect(await status(loadThread(env, person, id))).toBe(404);
		expect(
			await db(env).select().from(schema.messages).where(eq(schema.messages.threadId, id))
		).toEqual([]);
		expect(published).toContainEqual({
			topic: `thread:${id}`,
			payload: { type: 'thread.deleted' }
		});
		expect(objects.size).toBe(0);
		const second = await createGroup(env, ada, 'Again', [bo.user.id]);
		expect(await status(deleteThread(env, ada, await loadThread(env, ada, second)))).toBe('ok');
	});

	it('refuses a viewer or a guest in the thread, and anyone not in it', async () => {
		const { env, shareProject, ada, vic, gus, max } = await cast();
		await shareProject(ada, gus);
		const id = await createGroup(env, ada, 'Crew', [vic.user.id]);
		const withGuest = await createGroup(env, ada, 'Guests', [gus.user.id]);

		expect(await status(deleteThread(env, vic, await loadThread(env, vic, id)))).toBe(403);
		expect(await status(deleteThread(env, gus, await loadThread(env, gus, withGuest)))).toBe(403);
		expect(await status(loadThread(env, max, id))).toBe(404);
		expect((await loadThread(env, ada, id)).name).toBe('Crew');
	});
});

describe('favorite threads and notes', () => {
	it('lists favorite threads with their unread state and favorite notes, and forgets a note once it’s out of reach', async () => {
		const { env, ada, bo, cy } = await cast();
		const id = await createGroup(env, ada, '', [bo.user.id, cy.user.id]);
		const noteId = await createNote(env, ada, note('Plan'));
		await shareWithPeople(env, ada, await loadNote(env, ada, noteId), [bo.user.id], 'view');

		await setFavorite(env, bo, { type: 'thread', id }, true);
		await setFavorite(env, bo, { type: 'note', id: noteId }, true);
		vi.useFakeTimers({ now: Date.now() + 1000, toFake: ['Date'] });
		await sendMessage(env, ada, await loadThread(env, ada, id), text('Hi'), null);
		vi.useRealTimers();

		expect(await sidebarFavorites(env, bo)).toEqual({
			threads: [
				{
					id,
					name: 'Ada and Cy',
					group: true,
					faces: ['Ada', 'Cy'],
					pictureUrl: null,
					unread: true
				}
			],
			notes: [{ id: noteId, title: 'Plan' }],
			hiddenNotes: false
		});

		await unshareWithPerson(env, ada, await loadNote(env, ada, noteId), bo.user.id);
		expect(await sidebarFavorites(env, bo)).toMatchObject({ notes: [], hiddenNotes: true });
		// Reading the sidebar deletes nothing: back in reach, the favorite is still there.
		await shareWithPeople(env, ada, await loadNote(env, ada, noteId), [bo.user.id], 'view');
		expect((await sidebarFavorites(env, bo)).notes).toEqual([{ id: noteId, title: 'Plan' }]);

		await unshareWithPerson(env, ada, await loadNote(env, ada, noteId), bo.user.id);
		await dropUnseenNoteFavorites(env, bo);
		// Shared again, it isn't a favorite any more: the lost one was deleted, not hidden.
		await shareWithPeople(env, ada, await loadNote(env, ada, noteId), [bo.user.id], 'view');
		expect((await sidebarFavorites(env, bo)).notes).toEqual([]);

		await setFavorite(env, bo, { type: 'thread', id }, false);
		expect((await sidebarFavorites(env, bo)).threads).toEqual([]);
	});

	it('refuses a favorite of a thread or note the member can’t see', async () => {
		const { env, ada, bo, cy } = await cast();
		const id = await createGroup(env, ada, 'Crew', [bo.user.id]);
		const noteId = await createNote(env, ada, note('Private'));

		expect(await status(setFavorite(env, cy, { type: 'thread', id }, true))).toBe(404);
		expect(await status(setFavorite(env, cy, { type: 'note', id: noteId }, true))).toBe(404);
	});
});

describe('someone else’s message', () => {
	it('lets an admin in the thread edit or delete anyone’s message, and refuses a member', async () => {
		const { env, ada, bo, max } = await cast();
		const id = await createGroup(env, ada, 'Crew', [bo.user.id, max.user.id]);
		const thread = await loadThread(env, ada, id);
		const first = await sendMessage(env, bo, thread, text('Bo wrote this'), null);
		const second = await sendMessage(env, bo, thread, text('And this'), null);

		expect(await status(editMessage(env, ada, thread, first, text('Ada says so')))).toBe(403);
		expect(await status(deleteMessage(env, ada, thread, first))).toBe(403);
		await editMessage(env, max, thread, first, text('Tidied by an admin'));
		await deleteMessage(env, max, thread, second);

		const [edited, deleted] = await listMessages(env, bo, thread);
		expect(edited.bodyText).toBe('Tidied by an admin');
		expect(deleted.body).toBeNull();
	});
});

describe('a DM with someone deactivated', () => {
	it('stays readable under their name, and refuses anything new', async () => {
		const { env, ada, bo } = await cast();
		const id = await startDm(env, ada, bo.user.id);
		await sendMessage(env, bo, await loadThread(env, bo, id), text('Bye for now'), null);
		await db(env)
			.update(schema.members)
			.set({ deactivatedAt: Date.now() })
			.where(eq(schema.members.userId, bo.user.id));

		const thread = await loadThread(env, ada, id);
		expect(thread.name).toBe('Bo');
		expect(thread.people.find((p) => p.id === bo.user.id)?.deactivated).toBe(true);
		expect((await listMessages(env, ada, thread)).map((m) => m.bodyText)).toEqual(['Bye for now']);
		expect(await status(sendMessage(env, ada, thread, text('Still there?'), null))).toBe(403);
	});
});

describe('deleting some of a message’s attachments', () => {
	const file = (name: string) => new File(['x'], name, { type: 'application/pdf' });

	it('removes the chosen files and keeps the text and the rest, live, for the sender or an admin', async () => {
		const { env, ada, bo, max, published, objects } = await cast();
		const id = await createGroup(env, ada, 'Crew', [bo.user.id, max.user.id]);
		const thread = await loadThread(env, ada, id);
		const stored = [];
		for (const name of ['a.pdf', 'b.pdf', 'c.pdf']) {
			stored.push(await storeAttachment(env, ada, { threadId: id }, file(name)));
		}
		const doc = {
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: 'Three files' }] },
				...stored.map((a) => ({ type: 'attachment', attrs: a }))
			]
		};
		const messageId = await sendMessage(
			env,
			ada,
			thread,
			{ body: JSON.stringify(doc), bodyText: 'Three files' },
			null
		);
		published.length = 0;

		expect(await status(deleteAttachments(env, bo, thread, messageId, [stored[0].id]))).toBe(403);
		await deleteAttachments(env, ada, thread, messageId, [stored[0].id]);
		await deleteAttachments(env, max, thread, messageId, [stored[1].id]);

		const [message] = await listMessages(env, bo, thread);
		expect(message.bodyText).toContain('Three files');
		expect(docAttachments(message.body)).toEqual([stored[2].id]);
		expect(objects.has(`attachments/${stored[0].id}`)).toBe(false);
		expect(objects.has(`attachments/${stored[2].id}`)).toBe(true);
		expect(published).toContainEqual({
			topic: `thread:${id}`,
			payload: { type: 'message.updated' }
		});
	});

	it('refuses a file that isn’t in the message', async () => {
		const { env, ada, bo } = await cast();
		const id = await createGroup(env, ada, 'Crew', [bo.user.id]);
		const thread = await loadThread(env, ada, id);
		const messageId = await sendMessage(env, ada, thread, text('No files'), null);

		expect(await status(deleteAttachments(env, ada, thread, messageId, ['nope']))).toBe(400);
	});
});
