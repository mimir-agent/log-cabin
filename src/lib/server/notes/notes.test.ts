import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '../auth/session';
import type { Role } from '../db/schema';
import { upsertDevMember } from '../dev-login';
import { suggestUsername } from '../people/usernames';
import type { JobMessage } from '../events';
import { fakeD1, tableScans } from '../testing/fake-d1';
import { useTestEnv } from '../testing/env';
import { addProjectMember, createProject, setProjectArchived } from '../posts/projects';
import { loadProject } from '../posts/access';
import { setFavorite } from '../favorites';
import { loadNote, type LoadedNote } from './access';
import { newId } from '../../id';
import {
	createNoteComment,
	deleteNoteComment,
	listNoteComments,
	noteReactionSummaries,
	setNoteCommentResolved,
	tickNoteComment,
	toggleNoteReaction
} from './discussion';
import {
	createNote,
	deleteNote,
	listNotes,
	noteProject,
	noteQuery,
	setProjectShare,
	shareWithPeople,
	unshareWithPerson,
	renameNote,
	saveLiveBody,
	validateNoteInput,
	type NoteInput,
	type NoteQuery
} from './notes';

function world() {
	const { DB, sqlite, queries } = fakeD1();
	const jobs: JobMessage[] = [];
	const published: { topic: string; payload: unknown }[] = [];
	const noteHubCalls: string[] = [];
	const env = {
		DB,
		JOBS: { send: async (message: JobMessage) => void jobs.push(message) },
		REALTIME: {
			idFromName: (name: string) => name,
			get: (hub: string) => ({
				fetch: async (url: string, init: RequestInit) => {
					if (hub === 'org') published.push(JSON.parse(init.body as string));
					else noteHubCalls.push(`${hub} ${new URL(url).pathname}`);
					return new Response(null, { status: 204 });
				}
			})
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
	return { env, sqlite, queries, jobs, published, noteHubCalls, person };
}

function input(title: string, text = 'Body', mentions: { id: string; label: string }[] = []) {
	const doc = {
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [{ type: 'text', text }, ...mentions.map((attrs) => ({ type: 'mention', attrs }))]
			}
		]
	};
	const result = validateNoteInput({ title, body: JSON.stringify(doc) });
	if (!result.ok) throw new Error(`test note didn't validate: ${result.message}`);
	return result.input;
}

const comment = (text: string): NoteInput => input('', text);

async function httpStatus(promise: Promise<unknown>): Promise<number | 'ok'> {
	try {
		await promise;
		return 'ok';
	} catch (e) {
		if (isHttpError(e)) return e.status;
		throw e;
	}
}

async function team() {
	const w = world();
	const author = await w.person('Ada', 'member');
	const member = await w.person('Max', 'member');
	const admin = await w.person('Ann', 'admin');
	const viewer = await w.person('Vic', 'viewer');
	const guest = await w.person('Gus', 'guest');
	const open = await createProject(w.env, author, {
		name: 'Open',
		description: '',
		private: false
	});
	const noteId = await createNote(w.env, author, input('Plan', 'Draft plan'));
	return { ...w, author, member, admin, viewer, guest, open, noteId };
}

const canSee = async (env: Env, who: SignedIn, id: string) => httpStatus(loadNote(env, who, id));

const everyNote: NoteQuery = {
	filter: 'all',
	sort: 'activity',
	q: '',
	cursor: null,
	projectId: null
};
const listed = async (env: Env, who: SignedIn, change: Partial<NoteQuery> = {}) =>
	(await listNotes(env, who, { ...everyNote, ...change })).notes;

describe('who can see a note', () => {
	it('keeps a new note private to its author, even from admins', async () => {
		const { env, author, member, admin, viewer, guest, noteId } = await team();
		expect(await canSee(env, author, noteId)).toBe('ok');
		for (const other of [member, admin, viewer, guest]) {
			expect(await canSee(env, other, noteId), other.user.name).toBe(404);
		}
		expect((await listed(env, member)).map((n) => n.id)).toEqual([]);
	});

	it('lets a person it is shared with see it, and edit it only with edit', async () => {
		const { env, author, member, noteId } = await team();
		await shareWithPeople(
			env,
			author,
			await loadNote(env, author, noteId),
			[member.user.id],
			'view'
		);
		const asViewer = await loadNote(env, member, noteId);
		expect(asViewer.access).toBe('view');
		expect(await httpStatus(renameNote(env, member, asViewer, 'Mine now'))).toBe(403);

		await shareWithPeople(
			env,
			author,
			await loadNote(env, author, noteId),
			[member.user.id],
			'edit'
		);
		const asEditor = await loadNote(env, member, noteId);
		await renameNote(env, member, asEditor, 'Plan v2');
		expect((await loadNote(env, author, noteId)).title).toBe('Plan v2');

		expect((await listed(env, member)).map((n) => n.id)).toEqual([noteId]);
		expect(await listed(env, member, { filter: 'created' })).toEqual([]);

		await unshareWithPerson(env, author, await loadNote(env, author, noteId), member.user.id);
		expect(await canSee(env, member, noteId)).toBe(404);
	});

	it('never lets a viewer edit, even when the note is shared with them to edit', async () => {
		const { env, author, viewer, noteId } = await team();
		await shareWithPeople(
			env,
			author,
			await loadNote(env, author, noteId),
			[viewer.user.id],
			'edit'
		);
		expect((await loadNote(env, viewer, noteId)).access).toBe('view');
		expect(await httpStatus(createNote(env, viewer, input('Mine')))).toBe(403);
	});

	it('shares with a project: its members see it, a guest only once added to that project', async () => {
		const { env, author, member, guest, open, noteId } = await team();
		const note = await loadNote(env, author, noteId);
		await setProjectShare(env, author, note, { projectId: open, permission: 'edit' });
		expect((await loadNote(env, member, noteId)).access).toBe('edit');
		expect(await canSee(env, guest, noteId)).toBe(404);
		expect(await listed(env, guest)).toEqual([]);

		await addProjectMember(env, author, await loadProject(env, author, open), guest.user.id);
		expect((await loadNote(env, guest, noteId)).access).toBe('edit');
		expect((await listed(env, guest, { filter: 'forMe' })).map((n) => n.id)).toEqual([noteId]);

		await setProjectShare(env, author, await loadNote(env, author, noteId), null);
		expect(await canSee(env, guest, noteId)).toBe(404);
		expect(await canSee(env, member, noteId)).toBe(404);
	});

	it('lets a guest see a note shared with them by name, but not other notes', async () => {
		const { env, author, guest, noteId } = await team();
		const other = await createNote(env, author, input('Other'));
		await shareWithPeople(
			env,
			author,
			await loadNote(env, author, noteId),
			[guest.user.id],
			'view'
		);
		expect((await loadNote(env, guest, noteId)).access).toBe('view');
		expect(await canSee(env, guest, other)).toBe(404);
		expect((await listed(env, guest)).map((n) => n.id)).toEqual([noteId]);
	});

	it('names a note’s project only to people who can see that project', async () => {
		const { env, author, member, noteId } = await team();
		const secret = await createProject(env, author, {
			name: 'Secret',
			description: '',
			private: true
		});
		await setProjectShare(env, author, await loadNote(env, author, noteId), {
			projectId: secret,
			permission: 'view'
		});
		await shareWithPeople(
			env,
			author,
			await loadNote(env, author, noteId),
			[member.user.id],
			'view'
		);

		const [own] = await listed(env, author, { filter: 'created' });
		expect(own).toMatchObject({ projectId: secret, projectName: 'Secret', projectPrivate: true });
		expect(await noteProject(env, author, await loadNote(env, author, noteId))).toMatchObject({
			id: secret,
			name: 'Secret'
		});

		const [shared] = await listed(env, member);
		expect(shared).toMatchObject({ id: noteId, projectId: null, projectName: null });
		expect(await noteProject(env, member, await loadNote(env, member, noteId))).toBeNull();
	});

	it('marks the notes the reader has favorited, and no one else’s favorites', async () => {
		const { env, author, noteId } = await team();
		const other = await createNote(env, author, input('Other'));
		await setFavorite(env, author, { type: 'note', id: noteId }, true);

		const rows = await listed(env, author, { filter: 'created' });
		expect(rows.map((n) => [n.id, n.favorite]).sort()).toEqual(
			[
				[noteId, true],
				[other, false]
			].sort()
		);
	});

	it('makes a project share read-only once the project is archived', async () => {
		const { env, author, member, open, noteId } = await team();
		await setProjectShare(env, author, await loadNote(env, author, noteId), {
			projectId: open,
			permission: 'edit'
		});
		await setProjectArchived(env, author, await loadProject(env, author, open), true);
		expect((await loadNote(env, member, noteId)).access).toBe('view');
	});
});

const sharedRows = (sqlite: ReturnType<typeof world>['sqlite'], noteId: string) =>
	sqlite
		.prepare('SELECT user_id AS userId, permission FROM note_shares WHERE note_id = ?')
		.all(noteId);

/** What a sharing change must refuse, for each kind of person who can't make it. */
async function sharingRefusals(env: Env, who: SignedIn, note: LoadedNote, someone: string) {
	return [
		await httpStatus(shareWithPeople(env, who, note, [someone], 'view')),
		await httpStatus(unshareWithPerson(env, who, note, someone)),
		await httpStatus(setProjectShare(env, who, note, null))
	];
}

describe('who manages a note’s sharing', () => {
	it('an editor who isn’t the author adds three people at once, and only they hear about it', async () => {
		const w = await team();
		const { env, jobs, published, noteHubCalls, author, member, noteId } = w;
		const [bo, cy, dee] = [
			await w.person('Bo', 'member'),
			await w.person('Cy', 'member'),
			await w.person('Dee', 'member')
		];
		await shareWithPeople(
			env,
			author,
			await loadNote(env, author, noteId),
			[member.user.id],
			'edit'
		);
		jobs.length = published.length = noteHubCalls.length = 0;

		const ids = [bo.user.id, cy.user.id, dee.user.id];
		await shareWithPeople(env, member, await loadNote(env, member, noteId), ids, 'view');
		for (const who of [bo, cy, dee]) {
			expect((await loadNote(env, who, noteId)).access, who.user.name).toBe('view');
		}
		expect(jobs, 'one note.shared naming the three people').toEqual([
			expect.objectContaining({
				kind: 'note.shared',
				noteId,
				sharedWith: ids,
				authorId: member.user.id
			})
		]);
		expect(published, 'one sharing update').toHaveLength(1);
		expect(noteHubCalls, 'live sockets closed once').toEqual([`note:${noteId} /note/close`]);
	});

	it('changes the permission of people already shared with, telling only the new ones', async () => {
		const w = await team();
		const { env, sqlite, jobs, author, member, noteId } = w;
		const bo = await w.person('Bo', 'member');
		const note = () => loadNote(env, author, noteId);
		await shareWithPeople(env, author, await note(), [member.user.id], 'view');
		jobs.length = 0;

		await shareWithPeople(env, author, await note(), [member.user.id, bo.user.id], 'edit');
		expect(sharedRows(sqlite, noteId)).toEqual(
			expect.arrayContaining([
				{ userId: member.user.id, permission: 'edit' },
				{ userId: bo.user.id, permission: 'edit' }
			])
		);
		expect(jobs.map((j) => j.kind === 'note.shared' && j.sharedWith)).toEqual([[bo.user.id]]);

		jobs.length = 0;
		await shareWithPeople(env, author, await note(), [bo.user.id], 'view');
		expect((await loadNote(env, bo, noteId)).access).toBe('view');
		expect(jobs, 'a permission change alone tells nobody').toEqual([]);
	});

	it('lets an editor remove a person and change the project share', async () => {
		const w = await team();
		const { env, author, member, open, noteId } = w;
		const bo = await w.person('Bo', 'member');
		await shareWithPeople(
			env,
			author,
			await loadNote(env, author, noteId),
			[member.user.id, bo.user.id],
			'edit'
		);
		const asEditor = () => loadNote(env, member, noteId);
		await unshareWithPerson(env, member, await asEditor(), bo.user.id);
		expect(await canSee(env, bo, noteId)).toBe(404);
		await setProjectShare(env, member, await asEditor(), { projectId: open, permission: 'view' });
		expect((await loadNote(env, bo, noteId)).access).toBe('view');
	});

	it('lets someone who edits through the note’s project manage its sharing', async () => {
		const w = await team();
		const { env, author, member, open, noteId } = w;
		const bo = await w.person('Bo', 'member');
		await setProjectShare(env, author, await loadNote(env, author, noteId), {
			projectId: open,
			permission: 'edit'
		});
		await shareWithPeople(env, member, await loadNote(env, member, noteId), [bo.user.id], 'view');
		expect(sharedRows(w.sqlite, noteId)).toEqual([{ userId: bo.user.id, permission: 'view' }]);
	});

	it('refuses every sharing change to anyone who can only view the note', async () => {
		const w = await team();
		const { env, author, member, admin, viewer, noteId } = w;
		const bo = await w.person('Bo', 'member');
		const note = await loadNote(env, author, noteId);
		await shareWithPeople(env, author, note, [member.user.id, admin.user.id], 'view');
		// A viewer only ever views, even when the note is shared with them to edit.
		await shareWithPeople(env, author, note, [viewer.user.id, bo.user.id], 'edit');
		for (const who of [member, admin, viewer]) {
			const theirs = await loadNote(env, who, noteId);
			expect(await sharingRefusals(env, who, theirs, bo.user.id), who.user.name).toEqual([
				403, 403, 403
			]);
		}
		expect(sharedRows(w.sqlite, noteId)).toContainEqual({ userId: bo.user.id, permission: 'edit' });
	});

	it('refuses an empty list, more than fifty people, yourself, and anyone who isn’t a member', async () => {
		const { env, author, member, noteId } = await team();
		const note = await loadNote(env, author, noteId);
		const share = (ids: string[]) => httpStatus(shareWithPeople(env, author, note, ids, 'view'));
		expect(await share([])).toBe(400);
		expect(await share(Array.from({ length: 51 }, (_, i) => `someone-${i}`))).toBe(400);
		expect(await share([member.user.id, author.user.id])).toBe(400);
		expect(await share([member.user.id, 'nobody'])).toBe(400);
		expect(await canSee(env, member, noteId), 'a refused share adds nobody').toBe(404);
	});

	it('shares with fifty people in one go', async () => {
		const w = await team();
		const people: SignedIn[] = [];
		for (let i = 0; i < 50; i++) people.push(await w.person(`Fay${i}`, 'member'));
		const note = await loadNote(w.env, w.author, w.noteId);
		const ids = people.map((p) => p.user.id);
		await shareWithPeople(w.env, w.author, note, ids, 'view');
		expect(sharedRows(w.sqlite, w.noteId)).toHaveLength(50);
	});
});

describe('who can delete a note', () => {
	it('refuses everyone who can open the note but is neither its author nor an admin', async () => {
		const w = await team();
		const { env, author, member, viewer, guest, noteId } = w;
		const bo = await w.person('Bo', 'member');
		const note = await loadNote(env, author, noteId);
		await shareWithPeople(env, author, note, [member.user.id, viewer.user.id], 'edit');
		await shareWithPeople(env, author, note, [bo.user.id, guest.user.id], 'view');
		for (const who of [member, viewer, bo, guest]) {
			const theirs = await loadNote(env, who, noteId);
			expect(await httpStatus(deleteNote(env, who, theirs)), who.user.name).toBe(403);
		}
		expect(await canSee(env, author, noteId), 'the note is still there').toBe('ok');
	});

	it('lets an admin who can open the note delete it, though they didn’t write it', async () => {
		const { env, author, admin, noteId } = await team();
		await shareWithPeople(
			env,
			author,
			await loadNote(env, author, noteId),
			[admin.user.id],
			'view'
		);
		await deleteNote(env, admin, await loadNote(env, admin, noteId));
		expect(await canSee(env, author, noteId)).toBe(404);
	});

	it('lets the author delete their note', async () => {
		const { env, author, noteId } = await team();
		await deleteNote(env, author, await loadNote(env, author, noteId));
		expect(await canSee(env, author, noteId)).toBe(404);
	});
});

describe('sharing a note by name and with projects', () => {
	it('lets a guest edit through a project’s share but refuses them sharing by name', async () => {
		const { env, author, member, guest, open, noteId } = await team();
		await setProjectShare(env, author, await loadNote(env, author, noteId), {
			projectId: open,
			permission: 'edit'
		});
		await addProjectMember(env, author, await loadProject(env, author, open), guest.user.id);
		const asGuest = await loadNote(env, guest, noteId);
		expect(await httpStatus(shareWithPeople(env, guest, asGuest, [member.user.id], 'view'))).toBe(
			403
		);
		await setProjectShare(env, guest, asGuest, { projectId: open, permission: 'view' });
		expect((await loadNote(env, member, noteId)).access).toBe('view');
	});

	it('refuses a guest sharing by name, so their notes reveal nobody in the organization', async () => {
		const { env, guest, member } = await team();
		const id = await createNote(env, guest, input('Guest note'));
		const note = await loadNote(env, guest, id);
		expect(await httpStatus(shareWithPeople(env, guest, note, [member.user.id], 'view'))).toBe(403);
	});

	it('refuses sharing with a project the author cannot see', async () => {
		const { env, admin, guest } = await team();
		const secret = await createProject(env, admin, {
			name: 'Secret',
			description: '',
			private: true
		});
		const id = await createNote(env, guest, input('Guest note'));
		const note = await loadNote(env, guest, id);
		expect(
			await httpStatus(setProjectShare(env, guest, note, { projectId: secret, permission: 'view' }))
		).toBe(404);
	});

	it('tells the person a note is shared with', async () => {
		const { env, jobs, author, member, noteId } = await team();
		await shareWithPeople(
			env,
			author,
			await loadNote(env, author, noteId),
			[member.user.id],
			'view'
		);
		expect(jobs).toContainEqual(
			expect.objectContaining({
				kind: 'note.shared',
				noteId,
				sharedWith: [member.user.id],
				authorId: author.user.id
			})
		);
	});
});

describe('a note started in a project', () => {
	it('is shared with the project at view, so another member opens it at once', async () => {
		const { env, author, member, open } = await team();
		const id = await createNote(env, author, input('Agenda'), open);
		const asMember = await loadNote(env, member, id);
		expect(asMember).toMatchObject({ projectId: open, projectPermission: 'view', access: 'view' });
		expect((await loadNote(env, author, id)).access, 'its author still edits').toBe('edit');
	});

	it('is refused in a project its author can’t write in', async () => {
		const { env, author, member, viewer, guest, open } = await team();
		const secret = await createProject(env, author, {
			name: 'Secret',
			description: '',
			private: true
		});
		const archived = await createProject(env, author, {
			name: 'Old',
			description: '',
			private: false
		});
		await setProjectArchived(env, author, await loadProject(env, author, archived), true);
		const start = (who: SignedIn, projectId: string) =>
			httpStatus(createNote(env, who, input('Agenda'), projectId));
		expect(await start(viewer, open), 'a viewer').toBe(403);
		expect(await start(guest, open), 'a guest outside the project').toBe(404);
		expect(await start(member, secret), 'someone outside a private project').toBe(404);
		expect(await start(author, archived), 'an archived project').toBe(403);
		expect(
			await listed(env, author, { filter: 'created' }),
			'only the note from setup'
		).toHaveLength(1);
	});
});

describe('a note being edited live', () => {
	it('sends everyone editing it back through the access check when its sharing changes', async () => {
		const { env, author, member, open, noteId, noteHubCalls } = await team();
		const note = () => loadNote(env, author, noteId);
		await shareWithPeople(env, author, await note(), [member.user.id], 'edit');
		await shareWithPeople(env, author, await note(), [member.user.id], 'view');
		await unshareWithPerson(env, author, await note(), member.user.id);
		await setProjectShare(env, author, await note(), { projectId: open, permission: 'view' });
		expect(noteHubCalls).toEqual(Array(4).fill(`note:${noteId} /note/close`));
	});

	it('drops its live document when it is deleted', async () => {
		const { env, author, noteId, noteHubCalls } = await team();
		await deleteNote(env, author, await loadNote(env, author, noteId));
		expect(noteHubCalls).toEqual([`note:${noteId} /note/delete`]);
	});

	it('has its thumbnail redrawn at a new version after each stored body and each rename', async () => {
		const { env, sqlite, jobs, author, noteId } = await team();
		const version = () =>
			(sqlite.prepare('SELECT version FROM notes WHERE id = ?').get(noteId) as { version: number })
				.version;
		const before = version();
		await saveLiveBody(env, noteId, JSON.parse(input('', 'Tents').body), author.user.id);
		await renameNote(env, author, await loadNote(env, author, noteId), 'Plan B');
		expect(version(), 'one version for the body, one for the title').toBe(before + 2);
		expect(jobs.filter((job) => job.kind === 'note.thumbnail')).toEqual([
			expect.objectContaining({ noteId }),
			expect.objectContaining({ noteId })
		]);
	});

	it('keeps the stored body when the live document holds something pages can’t show', async () => {
		const { env, sqlite, jobs, author, noteId } = await team();
		const before = sqlite.prepare('SELECT body, version FROM notes WHERE id = ?').get(noteId);
		const outsideImage = {
			type: 'doc',
			content: [{ type: 'image', attrs: { src: 'https://elsewhere.example/x.png' } }]
		};
		await saveLiveBody(env, noteId, outsideImage, author.user.id);
		expect(sqlite.prepare('SELECT body, version FROM notes WHERE id = ?').get(noteId)).toEqual(
			before
		);
		expect(
			jobs.map((job) => job.kind),
			'no new version to draw'
		).not.toContain('note.thumbnail');
	});
});

describe('discussing a note', () => {
	it('lets people who can see the note comment and react, but not viewers', async () => {
		const { env, sqlite, queries, author, member, viewer, noteId } = await team();
		const note = await loadNote(env, author, noteId);
		await shareWithPeople(env, author, note, [member.user.id], 'view');
		await shareWithPeople(env, author, note, [viewer.user.id], 'view');

		const asMember = await loadNote(env, member, noteId);
		const first = await createNoteComment(env, member, asMember, comment('Looks good'), null);
		await createNoteComment(env, author, note, comment('Thanks'), first);
		await toggleNoteReaction(env, member, asMember, { type: 'note', id: noteId }, '👍');
		await toggleNoteReaction(env, author, note, { type: 'comment', id: first }, '🎉');

		const asViewer = await loadNote(env, viewer, noteId);
		expect(await httpStatus(createNoteComment(env, viewer, asViewer, comment('Hi'), null))).toBe(
			403
		);
		expect(
			await httpStatus(
				toggleNoteReaction(env, viewer, asViewer, { type: 'note', id: noteId }, '👍')
			)
		).toBe(403);
		expect(await httpStatus(tickNoteComment(env, viewer, asViewer, first, 0, true))).toBe(403);

		const thread = await listNoteComments(env, noteId);
		expect(thread.map((c) => [c.authorName, c.replies.map((r) => r.authorName)])).toEqual([
			['Max', ['Ada']]
		]);
		const other = await loadNote(env, author, await createNote(env, author, input('Other')));
		const elsewhere = await createNoteComment(env, author, other, comment('Elsewhere'), null);
		await toggleNoteReaction(env, author, other, { type: 'comment', id: elsewhere }, '🔥');
		queries.length = 0;
		expect(await noteReactionSummaries(env, member.user.id, noteId)).toEqual({
			[noteId]: [{ emoji: '👍', count: 1, names: ['Max'], mine: true }],
			[first]: [{ emoji: '🎉', count: 1, names: ['Ada'], mine: false }]
		});
		expect(queries).toHaveLength(1);
		expect(tableScans(sqlite, queries[0])).toEqual([]);
	});

	it('stores a note comment sent again under the same id once, and refuses that id elsewhere', async () => {
		const { env, author, noteId } = await team();
		const note = await loadNote(env, author, noteId);
		const other = await loadNote(env, author, await createNote(env, author, input('Other')));
		const id = newId();

		await createNoteComment(env, author, note, comment('Once'), null, Date.now(), id);
		expect(await createNoteComment(env, author, note, comment('Once'), null, 1, id)).toBe(id);
		expect(await listNoteComments(env, noteId)).toHaveLength(1);
		expect(await httpStatus(createNoteComment(env, author, other, comment('x'), null, 1, id))).toBe(
			409
		);
	});

	it('refuses a reaction on a comment from another note', async () => {
		const { env, author, noteId } = await team();
		const otherId = await createNote(env, author, input('Other'));
		const other = await loadNote(env, author, otherId);
		const theirs = await createNoteComment(env, author, other, comment('Elsewhere'), null);
		const note = await loadNote(env, author, noteId);
		expect(
			await httpStatus(toggleNoteReaction(env, author, note, { type: 'comment', id: theirs }, '👍'))
		).toBe(404);
	});

	it('tells everyone looking at the note when a thread is resolved or opened again', async () => {
		const { env, published, author, noteId } = await team();
		const note = await loadNote(env, author, noteId);
		const id = await createNoteComment(env, author, note, comment('Done?'), null);
		published.length = 0;
		await setNoteCommentResolved(env, author, note, id, true, 5);
		await setNoteCommentResolved(env, author, note, id, false);
		expect(published).toEqual([
			{ topic: `note:${noteId}`, payload: { type: 'comment.resolved', noteId, commentId: id } },
			{ topic: `note:${noteId}`, payload: { type: 'comment.unresolved', noteId, commentId: id } }
		]);
	});

	it('lets the note’s author delete anyone’s comment on it', async () => {
		const { env, author, member, noteId } = await team();
		await shareWithPeople(
			env,
			author,
			await loadNote(env, author, noteId),
			[member.user.id],
			'view'
		);
		const id = await createNoteComment(
			env,
			member,
			await loadNote(env, member, noteId),
			comment('x'),
			null
		);
		await deleteNoteComment(env, author, await loadNote(env, author, noteId), id);
		expect(await listNoteComments(env, noteId)).toEqual([]);
	});

	it('tells a mentioned person only when they can see the note', async () => {
		const { env, jobs, author, member, admin } = await team();
		const id = await createNote(
			env,
			author,
			input('Plan', 'cc', [
				{ id: member.user.id, label: 'Max' },
				{ id: admin.user.id, label: 'Ann' }
			])
		);
		expect(jobs.filter((j) => j.kind === 'mention')).toEqual([]);

		const note = await loadNote(env, author, id);
		await shareWithPeople(env, author, note, [member.user.id], 'view');
		await createNoteComment(
			env,
			author,
			note,
			input('', 'see', [
				{ id: member.user.id, label: 'Max' },
				{ id: admin.user.id, label: 'Ann' }
			]),
			null
		);
		expect(jobs.filter((j) => j.kind === 'mention')).toEqual([
			expect.objectContaining({
				subjectType: 'note',
				subjectId: id,
				mentionedUserId: member.user.id
			})
		]);
	});
});

describe('search index', () => {
	it('keeps a note’s search row in step with its title, body and deletion', async () => {
		const { env, sqlite, author, noteId } = await team();
		const row = () =>
			sqlite
				.prepare(`SELECT title, body, visibility FROM search_index WHERE ref_id = ?`)
				.get(noteId);
		expect(row()).toEqual({ title: 'Plan', body: 'Draft plan', visibility: 'note' });
		await renameNote(env, author, await loadNote(env, author, noteId), 'Plan B');
		await saveLiveBody(env, noteId, JSON.parse(input('', 'New').body), author.user.id);
		expect(row()).toEqual({ title: 'Plan B', body: 'New', visibility: 'note' });
		await deleteNote(env, author, await loadNote(env, author, noteId));
		expect(row()).toBeUndefined();
	});
});

describe('the notes index', () => {
	const ids = (rows: { id: string }[]) => rows.map((n) => n.id);

	it('reads an old or unknown filter and sort as every note by recent activity', () => {
		expect(noteQuery(new URLSearchParams('list=mine&filter=mine&sort=title&q=+plan+'))).toEqual({
			...everyNote,
			q: 'plan'
		});
	});

	it('gives each card the version its thumbnail shows, or none before one is drawn', async () => {
		const { env, sqlite, author, noteId } = await team();
		const drawn = await createNote(env, author, input('Drawn'));
		sqlite.prepare('UPDATE notes SET thumbnail_version = 1 WHERE id = ?').run(drawn);
		const rows = await listed(env, author);
		expect(rows.find((n) => n.id === drawn)?.thumbnailVersion).toBe(1);
		expect(rows.find((n) => n.id === noteId)?.thumbnailVersion).toBeNull();
	});

	it('filters to every note, the ones I wrote, and the ones in projects I’m in', async () => {
		const { env, author, member, open, noteId: draft } = await team();
		const shared = await createNote(env, author, input('Shared'), open);
		const notShared = await createNote(env, member, input('Asked'));
		await shareWithPeople(
			env,
			member,
			await loadNote(env, member, notShared),
			[author.user.id],
			'view'
		);
		const ada = (filter: NoteQuery['filter']) => listed(env, author, { filter });
		expect(new Set(ids(await ada('all')))).toEqual(new Set([draft, shared, notShared]));
		expect(new Set(ids(await ada('created'))), 'what Ada wrote').toEqual(new Set([draft, shared]));
		expect(ids(await ada('forMe')), 'shared with Open, which Ada is in').toEqual([shared]);

		const max = (filter: NoteQuery['filter']) => listed(env, member, { filter });
		expect(ids(await max('all')), 'Open is public, so Max sees its note').toContain(shared);
		expect(await max('forMe'), 'but Max isn’t in Open').toEqual([]);
		await addProjectMember(env, author, await loadProject(env, author, open), member.user.id);
		expect(ids(await max('forMe'))).toEqual([shared]);
	});

	it('sorts by the latest edit or comment, or by when each note was written', async () => {
		const { env, author } = await team();
		const older = await createNote(env, author, input('Older'), null, 1_000);
		const newer = await createNote(env, author, input('Newer'), null, 2_000);
		const note = await loadNote(env, author, older);
		await createNoteComment(env, author, note, comment('Bump'), null, 3_000);
		const mine = { filter: 'created' } as const;
		const byActivity = ids(await listed(env, author, { ...mine, sort: 'activity' }));
		const byCreated = ids(await listed(env, author, { ...mine, sort: 'created' }));
		expect(byActivity.indexOf(older), 'the comment brings it up').toBeLessThan(
			byActivity.indexOf(newer)
		);
		expect(byCreated.indexOf(newer), 'written later, so first').toBeLessThan(
			byCreated.indexOf(older)
		);
	});

	it('searches the titles and text of only the notes I can see', async () => {
		const { env, author, member, noteId: plan } = await team();
		const budget = await createNote(env, author, input('Money', 'The BUDGET for spring'));
		await createNote(env, member, input('Budget', 'Max’s own'));
		expect(ids(await listed(env, author, { q: 'budget' })), 'text, any case').toEqual([budget]);
		expect(ids(await listed(env, author, { q: 'pla' })), 'a title, as typed so far').toEqual([
			plan
		]);
		expect(await listed(env, author, { q: '"*' }), 'nothing searchable typed').toEqual([]);
	});
});
