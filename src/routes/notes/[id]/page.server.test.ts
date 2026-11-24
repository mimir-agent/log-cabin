import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import type { Role } from '#lib/server/db/schema/index.js';
import { upsertDevMember } from '#lib/server/dev-login.js';
import { newId } from '#lib/id.js';
import { suggestUsername } from '#lib/server/people/usernames.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { loadNote } from '#lib/server/notes/access.js';
import {
	createNote,
	setProjectShare,
	shareWithPeople,
	validateNoteInput
} from '#lib/server/notes/notes.js';
import { loadProject } from '#lib/server/posts/access.js';
import { addProjectMember, createProject } from '#lib/server/posts/projects.js';
import { actions, load } from './+page.server';
import { actions as newNoteActions, load as loadNewNote } from '../new/+page.server';

function doc(text: string) {
	return JSON.stringify({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});
}

async function world() {
	const { DB, sqlite } = fakeD1();
	sqlite.exec("INSERT INTO org (id, name, created_at) VALUES (1, 'Log Cabin', 0)");
	/** What each hub was asked, and how a note's hub answers a comment's mark. */
	const hubCalls: { hub: string; path: string; body: Record<string, unknown> }[] = [];
	const hubAnswers = { mark: () => Response.json({ marked: true }) };
	const env = {
		DB,
		JOBS: { send: async () => {} },
		REALTIME: {
			idFromName: (topic: string) => topic,
			get: (hub: string) => ({
				fetch: async (url: string, init?: RequestInit) => {
					const { pathname } = new URL(url);
					hubCalls.push({ hub, path: pathname, body: JSON.parse(String(init?.body ?? '{}')) });
					if (pathname === '/note/mark-comment') return hubAnswers.mark();
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
	const author = await person('Ada', 'member');
	await person('Zed', 'member');
	const guest = await person('Gus', 'guest');
	const crew = await createProject(env, author, { name: 'Crew', description: '', private: true });
	await addProjectMember(env, author, await loadProject(env, author, crew), guest.user.id);
	const input = validateNoteInput({ title: 'Plan', body: doc('The plan') });
	if (!input.ok) throw new Error(`test note didn't validate: ${input.message}`);
	const noteId = await createNote(env, author, input.input);
	return { env, sqlite, person, author, guest, crew, noteId, hubCalls, hubAnswers };
}

function event(
	who: SignedIn,
	noteId: string,
	path = '',
	fields: Record<string, string | string[]> = {}
) {
	const url = new URL(`https://campfire.test/notes/${noteId}${path}`);
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		for (const one of [value].flat()) body.append(key, one);
	}
	return {
		request: new Request(url, { method: 'POST', body }),
		params: { id: noteId },
		locals: { user: who.user, member: who.member },
		url
	} as never;
}

async function httpStatus(promise: Promise<unknown>): Promise<number | 'ok'> {
	try {
		await promise;
		return 'ok';
	} catch (e) {
		if (isHttpError(e) || isRedirect(e)) return e.status;
		throw e;
	}
}

describe('the notes pages', () => {
	it('gives each reader the titles of only the notes the body mentions that they may see', async () => {
		const { env, sqlite, author, person, noteId } = await world();
		const zed = await person('Zed', 'member');
		const input = validateNoteInput({ title: 'Diary', body: doc('Private') });
		if (!input.ok) throw new Error(`test note didn't validate: ${input.message}`);
		const diary = await createNote(env, author, input.input);
		const body = {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [{ type: 'resourceMention', attrs: { kind: 'note', id: diary } }]
				}
			]
		};
		sqlite.prepare('UPDATE notes SET body = ? WHERE id = ?').run(JSON.stringify(body), noteId);
		await shareWithPeople(env, author, await loadNote(env, author, noteId), [zed.user.id], 'view');
		const resources = async (who: SignedIn) =>
			((await load(event(who, noteId))) as { resources: Record<string, unknown> }).resources;

		expect(await resources(author)).toEqual({
			[`note:${diary}`]: { title: 'Diary', url: `/notes/${diary}` }
		});
		expect(await resources(zed), 'the diary isn’t shared with Zed').toEqual({});
	});
	it('refuses the new-note page to a viewer', async () => {
		const { person } = await world();
		const viewer = await person('Vic', 'viewer');
		expect(await httpStatus(Promise.resolve(loadNewNote(event(viewer, 'new'))))).toBe(403);
	});

	it('starts a note in a project that another member opens at once', async () => {
		const { env, author, guest, crew, person } = await world();
		const [zed, vic] = [await person('Zed', 'member'), await person('Vic', 'viewer')];
		const path = `?project=${crew}`;
		const page = (await loadNewNote(event(author, 'new', path))) as {
			project: { id: string; name: string };
		};
		expect(page.project).toEqual({ id: crew, name: 'Crew' });
		expect(
			await httpStatus(Promise.resolve(loadNewNote(event(zed, 'new', path)))),
			'not in it'
		).toBe(404);
		expect(
			await httpStatus(Promise.resolve(loadNewNote(event(vic, 'new', path)))),
			'a viewer'
		).toBe(403);

		const create = (who: SignedIn) =>
			Promise.resolve(
				newNoteActions.default(
					event(who, 'new', '', { title: 'Agenda', body: doc('Items'), projectId: crew })
				)
			);
		expect(await httpStatus(create(vic)), 'a viewer').toBe(403);
		let location = '';
		try {
			await create(author);
		} catch (e) {
			if (!isRedirect(e)) throw e;
			location = e.location;
		}
		const id = location.replace('/notes/', '');
		expect(id, 'redirected to the new note').not.toBe('');
		expect(await loadNote(env, guest, id)).toMatchObject({ title: 'Agenda', access: 'view' });
	});

	it('offers a guest only their project’s people, to mention and to share with', async () => {
		const { env, author, guest, crew, noteId } = await world();
		const note = await loadNote(env, author, noteId);
		await setProjectShare(env, author, note, { projectId: crew, permission: 'view' });
		const page = (await load(event(guest, noteId))) as { people: { name: string }[] };
		expect(page.people.map((p) => p.name)).toEqual(['Ada', 'Gus']);

		const own = await createNote(env, guest, {
			title: 'Mine',
			body: doc('x'),
			bodyText: 'x',
			mentions: []
		});
		const mine = (await load(event(guest, own))) as {
			sharing: { candidates: unknown[]; canShareWithPeople: boolean };
		};
		expect(mine.sharing).toMatchObject({ candidates: [], canShareWithPeople: false });
	});

	it('renames the note for someone who can edit it, and refuses a viewer', async () => {
		const { env, author, person, noteId } = await world();
		const bo = await person('Bo', 'member');
		await shareWithPeople(env, author, await loadNote(env, author, noteId), [bo.user.id], 'view');
		const rename = (who: SignedIn, title: string) =>
			actions.rename(event(who, noteId, '?/rename', { title }));

		await rename(author, '  Plan B  ');
		expect((await loadNote(env, author, noteId)).title).toBe('Plan B');
		expect(await httpStatus(Promise.resolve(rename(bo, 'Mine')))).toBe(403);
		expect((await loadNote(env, author, noteId)).title).toBe('Plan B');
	});

	it('shows the note’s moves and renames among its comments, leaving out a project the reader can’t see', async () => {
		const { env, author, person, crew, noteId } = await world();
		const bo = await person('Bo', 'member');
		await shareWithPeople(env, author, await loadNote(env, author, noteId), [bo.user.id], 'view');
		await actions.shareProject(
			event(author, noteId, '?/shareProject', { projectId: crew, permission: 'view' })
		);
		await actions.rename(event(author, noteId, '?/rename', { title: 'Plan B' }));
		const timeline = async (who: SignedIn) => {
			const page = (await load(event(who, noteId))) as {
				timeline: { kind: string; actorName: string }[];
			};
			return page.timeline.map((e) => `${e.actorName} ${e.kind}`);
		};
		expect(await timeline(author)).toEqual(['Ada project', 'Ada title']);
		expect(await timeline(bo), 'Bo isn’t in the private Crew').toEqual(['Ada title']);
	});

	it('opens the live editor read-only for someone who can only view', async () => {
		const { env, author, person, noteId } = await world();
		const bo = await person('Bo', 'member');
		await shareWithPeople(env, author, await loadNote(env, author, noteId), [bo.user.id], 'view');
		const page = (await load(event(bo, noteId))) as { live: { canWrite: boolean } };
		expect(page.live.canWrite).toBe(false);
		const own = (await load(event(author, noteId))) as { live: { canWrite: boolean } };
		expect(own.live.canWrite).toBe(true);
	});
});

describe('sharing a note from its page', () => {
	type Page = { sharing: { shares: { name: string }[]; candidates: { name: string }[] } | null };

	it('offers the sharing panel to an editor who isn’t the author, and to nobody who only views', async () => {
		const { env, author, person, noteId } = await world();
		const [bo, cy, vic] = [
			await person('Bo', 'member'),
			await person('Cy', 'member'),
			await person('Vic', 'viewer')
		];
		const note = await loadNote(env, author, noteId);
		await shareWithPeople(env, author, note, [bo.user.id], 'edit');
		await shareWithPeople(env, author, note, [cy.user.id, vic.user.id], 'view');

		const asEditor = (await load(event(bo, noteId))) as Page;
		expect(asEditor.sharing?.shares.map((s) => s.name)).toEqual(['Bo', 'Cy', 'Vic']);
		expect(
			asEditor.sharing?.candidates.map((p) => p.name),
			'nobody shared or the author'
		).toEqual(['Gus', 'Zed']);
		for (const who of [cy, vic]) {
			expect(((await load(event(who, noteId))) as Page).sharing, who.user.name).toBeNull();
		}
	});

	it('shares with everyone ticked in one form, and refuses it to someone who only views', async () => {
		const { env, author, person, noteId } = await world();
		const [bo, cy, dee, eve] = [
			await person('Bo', 'member'),
			await person('Cy', 'member'),
			await person('Dee', 'member'),
			await person('Eve', 'member')
		];
		await shareWithPeople(env, author, await loadNote(env, author, noteId), [bo.user.id], 'edit');
		await shareWithPeople(env, author, await loadNote(env, author, noteId), [cy.user.id], 'view');
		const share = (who: SignedIn, userId: string[]) =>
			Promise.resolve(actions.share(event(who, noteId, '?/share', { userId, permission: 'view' })));

		expect(await httpStatus(share(cy, [dee.user.id]))).toBe(403);
		expect(await httpStatus(share(bo, []))).toBe(400);
		await share(bo, [dee.user.id, eve.user.id]);
		const shares = ((await load(event(author, noteId))) as Page).sharing?.shares;
		expect(shares?.map((s) => s.name)).toEqual(['Bo', 'Cy', 'Dee', 'Eve']);
	});

	it('lets an editor who isn’t the author let one person edit instead of view', async () => {
		const { env, author, person, noteId } = await world();
		const [bo, cy, dee] = [
			await person('Bo', 'member'),
			await person('Cy', 'member'),
			await person('Dee', 'member')
		];
		await shareWithPeople(env, author, await loadNote(env, author, noteId), [bo.user.id], 'edit');
		await shareWithPeople(env, author, await loadNote(env, author, noteId), [cy.user.id], 'view');
		await shareWithPeople(env, author, await loadNote(env, author, noteId), [dee.user.id], 'view');

		await actions.share(event(bo, noteId, '?/share', { userId: cy.user.id, permission: 'edit' }));
		const shares = (
			(await load(event(author, noteId))) as {
				sharing: { shares: { name: string; permission: string }[] };
			}
		).sharing.shares;
		expect(
			shares.map((s) => `${s.name} ${s.permission}`),
			'only Cy changed, to edit'
		).toEqual(['Bo edit', 'Cy edit', 'Dee view']);
		expect((await loadNote(env, cy, noteId)).access).toBe('edit');
	});
});

describe('deleting a note from its page', () => {
	it('offers Delete to the author and an admin, refuses an editor, and goes back to the notes', async () => {
		const { env, author, person, noteId } = await world();
		const [bo, ann] = [await person('Bo', 'member'), await person('Ann', 'admin')];
		await shareWithPeople(env, author, await loadNote(env, author, noteId), [bo.user.id], 'edit');
		await shareWithPeople(env, author, await loadNote(env, author, noteId), [ann.user.id], 'view');
		const canDelete = async (who: SignedIn) =>
			((await load(event(who, noteId))) as { canDelete: boolean }).canDelete;
		expect([await canDelete(author), await canDelete(ann), await canDelete(bo)]).toEqual([
			true,
			true,
			false
		]);

		const del = (who: SignedIn) => Promise.resolve(actions.delete(event(who, noteId, '?/delete')));
		expect(await httpStatus(del(bo))).toBe(403);
		try {
			await del(ann);
			expect.unreachable('delete redirects');
		} catch (e) {
			expect(isRedirect(e) && e.location).toBe('/notes');
		}
		expect(await httpStatus(loadNote(env, author, noteId))).toBe(404);
	});
});

describe('task checkboxes in a note’s comments', () => {
	it('keeps a tick after a reload, and refuses someone who can’t see the note', async () => {
		const { env, author, person, noteId } = await world();
		const bo = await person('Bo', 'member');
		await shareWithPeople(env, author, await loadNote(env, author, noteId), [bo.user.id], 'view');
		const body = JSON.stringify({
			type: 'doc',
			content: [
				{
					type: 'taskList',
					content: [
						{
							type: 'taskItem',
							attrs: { checked: false },
							content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Book' }] }]
						}
					]
				}
			]
		});
		await actions.comment(event(author, noteId, '', { body, id: newId() }));
		type Page = { comments: { id: string; body: string }[] };
		const commentId = ((await load(event(author, noteId))) as Page).comments[0].id;
		const tick = (who: SignedIn) =>
			actions.tick(
				event(who, noteId, '', { subject: 'comment', id: commentId, index: '0', checked: 'true' })
			);

		const outsider = await person('Dee', 'member');
		expect(await httpStatus(Promise.resolve(tick(outsider)))).toBe(404);
		await tick(bo);
		const [comment] = ((await load(event(author, noteId))) as Page).comments;
		expect(JSON.parse(comment.body).content[0].content[0].attrs).toEqual({ checked: true });
	});
});

describe('resolving a thread in a note’s comments', () => {
	type Page = {
		comments: { id: string; resolvedAt: number | null; resolvedByName: string | null }[];
	};
	const thread = async (who: SignedIn, noteId: string) =>
		((await load(event(who, noteId))) as Page).comments[0];

	it('lets everyone who can comment on the note resolve and unresolve it', async () => {
		const { env, author, guest, crew, person, noteId } = await world();
		const [bo, cy, vic, ann] = [
			await person('Bo', 'member'),
			await person('Cy', 'member'),
			await person('Vic', 'viewer'),
			await person('Ann', 'admin')
		];
		const note = await loadNote(env, author, noteId);
		await shareWithPeople(env, author, note, [bo.user.id], 'edit');
		await shareWithPeople(env, author, note, [cy.user.id, vic.user.id, ann.user.id], 'view');
		await setProjectShare(env, author, note, { projectId: crew, permission: 'view' });
		await actions.comment(event(bo, noteId, '', { body: doc('Is this done?'), id: newId() }));
		const { id: commentId } = await thread(author, noteId);
		const resolve = (who: SignedIn) =>
			Promise.resolve(actions.resolveComment(event(who, noteId, '', { commentId })));
		const unresolve = (who: SignedIn) =>
			Promise.resolve(actions.unresolveComment(event(who, noteId, '', { commentId })));

		for (const who of [author, bo, cy, ann, guest]) {
			const name = who.user.name;
			expect(await httpStatus(resolve(who)), `${name} resolves`).toBe('ok');
			expect(await thread(author, noteId), `${name} shown as the resolver`).toMatchObject({
				resolvedByName: name,
				resolvedAt: expect.any(Number)
			});
			expect(await httpStatus(unresolve(who)), `${name} unresolves`).toBe('ok');
			expect((await thread(author, noteId)).resolvedAt, `${name} opened it again`).toBeNull();
		}

		expect(await httpStatus(resolve(vic)), 'Vic may only read').toBe(403);
		expect((await thread(author, noteId)).resolvedAt).toBeNull();
		await resolve(author);
		expect(await httpStatus(unresolve(vic)), 'Vic can’t open it again either').toBe(403);
		expect((await thread(author, noteId)).resolvedAt).not.toBeNull();
	});

	it('refuses someone who can’t open the note, and anyone signed out', async () => {
		const { author, person, noteId } = await world();
		const zed = await person('Zed', 'member');
		await actions.comment(event(author, noteId, '', { body: doc('Private'), id: newId() }));
		const { id: commentId } = await thread(author, noteId);
		expect(
			await httpStatus(
				Promise.resolve(actions.resolveComment(event(zed, noteId, '', { commentId })))
			),
			'not shared with Zed'
		).toBe(404);
		const signedOut = {
			...(event(author, noteId, '', { commentId }) as object),
			locals: {}
		} as never;
		expect(await httpStatus(Promise.resolve(actions.resolveComment(signedOut)))).toBe(303);
		expect((await thread(author, noteId)).resolvedAt).toBeNull();
	});

	it('resolves only a thread, never a reply in it', async () => {
		const { author, noteId } = await world();
		await actions.comment(event(author, noteId, '', { body: doc('Start'), id: newId() }));
		const { id: first } = await thread(author, noteId);
		const replyId = newId();
		await actions.comment(
			event(author, noteId, '', { body: doc('Reply'), id: replyId, replyTo: first })
		);
		const resolveReply = actions.resolveComment(event(author, noteId, '', { commentId: replyId }));
		expect(await httpStatus(Promise.resolve(resolveReply))).toBe(400);
	});
});

describe('who has seen a note', () => {
	type Viewers = {
		viewers: { people: { name: string; viewedAt: number }[]; anonymous: number };
	};
	const open = async (who: SignedIn, noteId: string, at: number) => {
		vi.spyOn(Date, 'now').mockReturnValue(at);
		try {
			return ((await load(event(who, noteId))) as Viewers).viewers;
		} finally {
			vi.restoreAllMocks();
		}
	};

	it('lists everyone else who opened it, latest first with when, viewers and guests included', async () => {
		const { env, author, guest, crew, person, noteId } = await world();
		const [bo, vic] = [await person('Bo', 'member'), await person('Vic', 'viewer')];
		const note = await loadNote(env, author, noteId);
		await shareWithPeople(env, author, note, [bo.user.id, vic.user.id], 'view');
		await setProjectShare(env, author, note, { projectId: crew, permission: 'view' });

		await open(bo, noteId, 1_000);
		await open(guest, noteId, 2_000);
		await open(vic, noteId, 3_000);
		await open(bo, noteId, 4_000);
		const seen = await open(author, noteId, 5_000);
		expect(seen.people, 'Bo opened it last, then Vic, then Gus; Ada is reading').toEqual([
			{ id: bo.user.id, name: 'Bo', avatarUrl: null, viewedAt: 4_000 },
			{ id: vic.user.id, name: 'Vic', avatarUrl: null, viewedAt: 3_000 },
			{ id: guest.user.id, name: 'Gus', avatarUrl: null, viewedAt: 2_000 }
		]);
		expect(seen.anonymous, 'nobody opened it signed out').toBe(0);
		const bos = await open(bo, noteId, 6_000);
		expect(
			bos.people.map((p) => p.name),
			'the author’s visit counts too'
		).toEqual(['Ada', 'Vic', 'Gus']);
	});

	it('counts the times it was opened signed out', async () => {
		const { sqlite, author, noteId } = await world();
		sqlite.prepare('UPDATE notes SET anonymous_views = 3 WHERE id = ?').run(noteId);
		expect((await open(author, noteId, 1_000)).anonymous).toBe(3);
	});

	it('marks that note’s inbox items read when it is opened, and leaves other items unread', async () => {
		const { env, sqlite, author, person, noteId } = await world();
		const bo = await person('Bo', 'member');
		await shareWithPeople(env, author, await loadNote(env, author, noteId), [bo.user.id], 'view');
		const other = await createNote(env, author, {
			title: 'Other',
			body: doc('x'),
			bodyText: 'x',
			mentions: []
		});
		const insert = sqlite.prepare(
			`INSERT INTO notifications (id, user_id, actor_id, kind, item_key, url, title, source, created_at)
				VALUES (?, ?, ?, ?, ?, '/', NULL, ?, 1)`
		);
		insert.run('n1', bo.user.id, author.user.id, 'note', `note:${noteId}`, 'shared');
		insert.run('n2', bo.user.id, author.user.id, 'comment', `note:${noteId}`, 'commented');
		insert.run('n3', bo.user.id, author.user.id, 'mention', `note:${noteId}`, 'mentioned');
		insert.run('n4', bo.user.id, author.user.id, 'note', `note:${other}`, 'other');
		insert.run('n5', author.user.id, bo.user.id, 'comment', `note:${noteId}`, 'to-ada');

		await open(bo, noteId, 7_000);
		const rows = sqlite.prepare('SELECT id, read_at FROM notifications ORDER BY id').all();
		expect(rows, 'Bo’s three about this note are read; the other note and Ada’s are not').toEqual([
			{ id: 'n1', read_at: 7_000 },
			{ id: 'n2', read_at: 7_000 },
			{ id: 'n3', read_at: 7_000 },
			{ id: 'n4', read_at: null },
			{ id: 'n5', read_at: null }
		]);
	});

	it('records nothing for someone who can’t open the note, or anyone signed out', async () => {
		const { sqlite, author, person, noteId } = await world();
		const zed = await person('Zed', 'member');
		expect(await httpStatus(Promise.resolve(load(event(zed, noteId)))), 'not shared').toBe(404);
		const signedOut = { ...(event(author, noteId) as object), locals: {} } as never;
		expect(await httpStatus(Promise.resolve(load(signedOut))), 'signed out').toBe(303);
		expect(sqlite.prepare('SELECT * FROM note_views').all(), 'no views').toEqual([]);
	});
});

describe('commenting on a passage of a note', () => {
	type Page = { comments: { id: string; parentId: string | null }[] };
	const passage = { anchorStart: 'AQIDBAU=', anchorEnd: 'BgcICQo=' };
	const comments = async (who: SignedIn, noteId: string) =>
		((await load(event(who, noteId))) as Page).comments;
	const marks = (calls: { path: string }[]) =>
		calls.filter((call) => call.path === '/note/mark-comment');

	it('lets everyone who may comment make a comment on a passage, the hub marking it for them', async () => {
		const { env, author, guest, crew, person, noteId, hubCalls } = await world();
		const [bo, cy, ann] = [
			await person('Bo', 'member'),
			await person('Cy', 'member'),
			await person('Ann', 'admin')
		];
		const note = await loadNote(env, author, noteId);
		await shareWithPeople(env, author, note, [bo.user.id], 'edit');
		await shareWithPeople(env, author, note, [cy.user.id, ann.user.id], 'view');
		await setProjectShare(env, author, note, { projectId: crew, permission: 'view' });

		for (const who of [author, bo, cy, ann, guest]) {
			const id = newId();
			const fields = { body: doc(`From ${who.user.name}`), id, ...passage };
			expect(
				await httpStatus(Promise.resolve(actions.comment(event(who, noteId, '', fields)))),
				`${who.user.name} comments`
			).toBe('ok');
			expect(marks(hubCalls).at(-1), `the hub marks ${who.user.name}’s passage`).toEqual({
				hub: `note:${noteId}`,
				path: '/note/mark-comment',
				body: {
					noteId,
					commentId: id,
					userId: who.user.id,
					start: passage.anchorStart,
					end: passage.anchorEnd
				}
			});
		}
		expect(await comments(author, noteId)).toHaveLength(5);
	});

	it('refuses a viewer the note is shared with, and asks the hub nothing', async () => {
		const { env, author, person, noteId, hubCalls } = await world();
		const vic = await person('Vic', 'viewer');
		await shareWithPeople(env, author, await loadNote(env, author, noteId), [vic.user.id], 'view');
		const fields = { body: doc('Mine'), id: newId(), ...passage };
		const status = await httpStatus(
			Promise.resolve(actions.comment(event(vic, noteId, '', fields)))
		);
		expect(status).toBe(403);
		expect(marks(hubCalls)).toEqual([]);
		expect(await comments(author, noteId)).toEqual([]);
	});

	it('refuses a reply made on a passage, and half a passage, keeping neither', async () => {
		const { author, noteId, hubCalls } = await world();
		await actions.comment(event(author, noteId, '', { body: doc('Start'), id: newId() }));
		const [{ id: first }] = await comments(author, noteId);
		const send = (fields: Record<string, string>) =>
			Promise.resolve(
				actions.comment(event(author, noteId, '', { body: doc('More'), id: newId(), ...fields }))
			);

		const reply = await send({ replyTo: first, ...passage });
		expect(reply, 'a reply on a passage').toMatchObject({ status: 400 });
		const half = await send({ anchorStart: passage.anchorStart });
		expect(half, 'only its start').toMatchObject({ status: 400 });
		const junk = await send({ anchorStart: '<script>', anchorEnd: passage.anchorEnd });
		expect(junk, 'a start that isn’t an encoded position').toMatchObject({ status: 400 });
		expect(await comments(author, noteId), 'only the first comment').toHaveLength(1);
		expect(marks(hubCalls)).toEqual([]);
	});

	it('keeps the comment, unanchored, when its passage is gone or the hub fails, and logs it', async () => {
		const { author, noteId, hubAnswers } = await world();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const gone = newId();
			hubAnswers.mark = () => Response.json({ marked: false });
			await actions.comment(event(author, noteId, '', { body: doc('A'), id: gone, ...passage }));
			expect(warn.mock.calls.flat().join(' ')).toContain(`comment ${gone} on note ${noteId}`);

			const failed = newId();
			hubAnswers.mark = () => new Response('down', { status: 500 });
			await actions.comment(event(author, noteId, '', { body: doc('B'), id: failed, ...passage }));
			expect(String(error.mock.calls[0][0])).toContain(
				`comment ${failed}'s passage in note ${noteId}`
			);
		} finally {
			vi.restoreAllMocks();
		}
		expect(await comments(author, noteId), 'both comments kept').toHaveLength(2);
	});

	it('sends someone signed out to sign in', async () => {
		const { author, noteId, hubCalls } = await world();
		const signedOut = {
			...(event(author, noteId, '', { body: doc('Hi'), id: newId(), ...passage }) as object),
			locals: {}
		} as never;
		expect(await httpStatus(Promise.resolve(actions.comment(signedOut)))).toBe(303);
		expect(marks(hubCalls)).toEqual([]);
	});
});

describe('deleting a comment made on a passage', () => {
	type Page = { comments: { id: string }[] };
	const unmarks = (calls: { path: string }[]) =>
		calls.filter((call) => call.path === '/note/unmark-comment');

	it('takes its mark off the words, and a reply’s deletion asks nothing of the hub', async () => {
		const { author, person, env, noteId, hubCalls } = await world();
		const bo = await person('Bo', 'member');
		await shareWithPeople(env, author, await loadNote(env, author, noteId), [bo.user.id], 'view');
		const [thread, reply] = [newId(), newId()];
		await actions.comment(
			event(bo, noteId, '', {
				body: doc('This?'),
				id: thread,
				anchorStart: 'AQIDBAU=',
				anchorEnd: 'BgcICQo='
			})
		);
		await actions.comment(
			event(author, noteId, '', { body: doc('Yes'), id: reply, replyTo: thread })
		);

		await actions.deleteComment(event(author, noteId, '', { commentId: reply }));
		expect(unmarks(hubCalls), 'a reply has no words of its own').toEqual([]);
		await actions.deleteComment(event(bo, noteId, '', { commentId: thread }));
		expect(unmarks(hubCalls)).toEqual([
			{
				hub: `note:${noteId}`,
				path: '/note/unmark-comment',
				body: { noteId, commentId: thread, userId: bo.user.id }
			}
		]);
	});

	it('deletes the comment even when the hub fails, and logs it', async () => {
		const { author, env, noteId } = await world();
		const commentId = newId();
		await actions.comment(event(author, noteId, '', { body: doc('Gone soon'), id: commentId }));
		const realtime = env.REALTIME as unknown as { get: (hub: string) => unknown };
		const get = realtime.get;
		realtime.get = (hub: string) =>
			hub.startsWith('note:')
				? { fetch: async () => new Response('down', { status: 500 }) }
				: get(hub);
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await actions.deleteComment(event(author, noteId, '', { commentId }));
			expect(String(error.mock.calls[0][0])).toContain(
				`comment ${commentId}'s mark out of note ${noteId}`
			);
		} finally {
			vi.restoreAllMocks();
		}
		expect(((await load(event(author, noteId))) as Page).comments).toEqual([]);
	});
});
