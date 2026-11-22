import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import type { Role } from '#lib/server/db/schema/index.js';
import { upsertDevMember } from '#lib/server/dev-login.js';
import { suggestUsername } from '#lib/server/people/usernames.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { loadNote } from '#lib/server/notes/access.js';
import {
	createNote,
	deleteNote,
	setProjectShare,
	shareWithPeople,
	validateNoteInput
} from '#lib/server/notes/notes.js';
import { excerpt } from '#lib/server/notes/public.js';
import { loadProject } from '#lib/server/posts/access.js';
import { addProjectMember, createProject } from '#lib/server/posts/projects.js';
import { load } from './+page.server';
import { actions as noteActions, load as loadNotePage } from '../../../notes/[id]/+page.server';

const text = (t: string) => ({ type: 'text', text: t });
// Long enough that the description is cut, at a word.
const opening =
	'We meet at the trailhead at nine and walk the ridge to the lake, where the boats wait for ' +
	'anyone who wants to cross before lunch, and the rest of us stay on the shore to cook';

async function world() {
	const { DB, sqlite } = fakeD1();
	sqlite.exec("INSERT INTO org (id, name, created_at) VALUES (1, 'Northwind', 0)");
	const env = {
		DB,
		JOBS: { send: async () => {} },
		REALTIME: {
			idFromName: (topic: string) => topic,
			get: () => ({ fetch: async () => new Response(null, { status: 204 }) })
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
	const ada = await person('Ada', 'member');
	const [bo, cy, dee, vic, gus] = [
		await person('Bo', 'member'),
		await person('Cy', 'member'),
		await person('Dee', 'admin'),
		await person('Vic', 'viewer'),
		await person('Gus', 'guest')
	];
	const input = validateNoteInput({ title: 'Hike plan', body: '{"type":"doc","content":[]}' });
	if (!input.ok) throw new Error(`test note didn't validate: ${input.message}`);
	const noteId = await createNote(env, ada, input.input);
	const body = {
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [
					text(opening),
					text(' with '),
					{ type: 'mention', attrs: { id: cy.user.id, label: 'Cy' } }
				]
			}
		]
	};
	sqlite
		.prepare('UPDATE notes SET body = ?, body_text = ? WHERE id = ?')
		.run(JSON.stringify(body), `${opening} with @Cy`, noteId);
	const note = await loadNote(env, ada, noteId);
	await shareWithPeople(env, ada, note, [bo.user.id, vic.user.id], 'edit');
	await shareWithPeople(env, ada, note, [cy.user.id], 'view');
	const camp = await createProject(env, ada, { name: 'Camp', description: '', private: true });
	await addProjectMember(env, ada, await loadProject(env, ada, camp), gus.user.id);
	await setProjectShare(env, ada, await loadNote(env, ada, noteId), {
		projectId: camp,
		permission: 'view'
	});

	const publish = (who: SignedIn | null, on: boolean) => {
		const url = new URL(`https://campfire.test/notes/${noteId}?/publish`);
		const form = new FormData();
		form.set('on', on ? '1' : '0');
		return status(
			Promise.resolve(
				noteActions.publish({
					request: new Request(url, { method: 'POST', body: form }),
					params: { id: noteId },
					locals: { user: who?.user ?? null, member: who?.member ?? null },
					url
				} as never)
			)
		);
	};
	const token = () =>
		(
			sqlite.prepare('SELECT public_token AS t FROM notes WHERE id = ?').get(noteId) as {
				t: string | null;
			}
		).t;
	const anonymousViews = () =>
		(
			sqlite.prepare('SELECT anonymous_views AS n FROM notes WHERE id = ?').get(noteId) as {
				n: number;
			}
		).n;
	const read = async (t: string, who: SignedIn | null = null) => {
		const headers: Record<string, string> = {};
		const url = new URL(`https://campfire.test/p/notes/${t}`);
		const event = {
			params: { token: t },
			locals: { user: who?.user ?? null, member: who?.member ?? null },
			url,
			setHeaders: (h: Record<string, string>) => {
				for (const key in h) {
					if (key in headers) throw new Error(`${key} set twice`);
					headers[key] = h[key];
				}
			}
		};
		try {
			const data = (await load(event as never)) as Record<string, unknown>;
			return { status: 200, data, headers };
		} catch (e) {
			if (!isHttpError(e)) throw e;
			return { status: e.status, data: null, headers };
		}
	};
	return {
		env,
		sqlite,
		ada,
		bo,
		cy,
		dee,
		vic,
		gus,
		noteId,
		publish,
		token,
		anonymousViews,
		read
	};
}

async function status(promise: Promise<unknown>): Promise<number | 'ok'> {
	try {
		await promise;
		return 'ok';
	} catch (e) {
		if (isHttpError(e) || isRedirect(e)) return e.status;
		throw e;
	}
}

describe('publishing a note to the web', () => {
	it('lets an editor who isn’t the author publish, and refuses everyone who only views', async () => {
		const w = await world();
		expect(await w.publish(w.cy, true), 'a member with a view share').toBe(403);
		expect(await w.publish(w.vic, true), 'a viewer, even with an edit share').toBe(403);
		expect(await w.publish(w.gus, true), 'a guest who sees it through a project').toBe(403);
		expect(await w.publish(w.dee, true), 'an admin it isn’t shared with').toBe(404);
		expect(await w.publish(null, true), 'signed out: sent to sign in').toBe(303);
		expect(w.token(), 'nobody above published it').toBeNull();

		expect(await w.publish(w.bo, true)).toBe('ok');
		const token = w.token();
		expect(token, 'the same kind of token posts use').toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(token).not.toContain(w.noteId);
		expect(await w.publish(w.ada, true), 'the author publishes it again').toBe('ok');
		expect(w.token(), 'publishing a public note keeps its token').toBe(token);
		expect(await w.publish(w.cy, false), 'a viewer can’t take it down').toBe(403);
		expect(w.token()).toBe(token);
	});

	it('shows the note signed out with its title and description, cached for a minute', async () => {
		const w = await world();
		await w.publish(w.ada, true);
		const { status, data, headers } = await w.read(w.token()!);
		expect(status).toBe(200);
		expect(data).toMatchObject({
			title: 'Hike plan',
			authorName: 'Ada',
			orgName: 'Northwind',
			url: `https://campfire.test/p/notes/${w.token()}`,
			description:
				'We meet at the trailhead at nine and walk the ridge to the lake, where the boats wait ' +
				'for anyone who wants to cross before lunch, and the rest of us stay on the…'
		});
		expect(JSON.stringify(data)).toContain(opening);
		expect(headers['cache-control']).toBe('public, max-age=60');
		expect(headers['x-robots-tag']).toBe('noindex');

		w.sqlite.exec("UPDATE notes SET title = ''; UPDATE org SET public_posts_indexable = 1");
		const untitled = await w.read(w.token()!);
		expect(untitled.data?.title, 'an untitled note has the placeholder title').toBe('Untitled');
		expect(untitled.headers['x-robots-tag'], 'the org lets search engines in').toBeUndefined();
	});

	it('keeps mentions’ names and drops their ids, and shows nothing about who it’s shared with', async () => {
		const w = await world();
		await w.publish(w.ada, true);
		const page = JSON.stringify((await w.read(w.token()!)).data);
		expect(page).toContain('"label":"Cy"');
		for (const secret of [w.cy.user.id, w.bo.user.id, w.noteId, 'Camp', 'ada@example.com']) {
			expect(page, `the page doesn’t carry ${secret}`).not.toContain(secret);
		}
	});

	it('carries no title of a note it mentions, to a signed-out reader or to its author', async () => {
		const w = await world();
		const input = validateNoteInput({
			title: 'Budget secrets',
			body: '{"type":"doc","content":[]}'
		});
		if (!input.ok) throw new Error(`test note didn't validate: ${input.message}`);
		const mentioned = await createNote(w.env, w.ada, input.input);
		const body = {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						text('See '),
						{ type: 'resourceMention', attrs: { kind: 'note', id: mentioned } }
					]
				}
			]
		};
		w.sqlite
			.prepare("UPDATE notes SET body = ?, body_text = 'See a linked note' WHERE id = ?")
			.run(JSON.stringify(body), w.noteId);
		await w.publish(w.ada, true);
		for (const reader of [null, w.ada]) {
			const page = JSON.stringify((await w.read(w.token()!, reader)).data);
			expect(page, 'the mention itself is there').toContain('"resourceMention"');
			expect(page, `no title, read by ${reader?.user.name ?? 'someone signed out'}`).not.toContain(
				'Budget secrets'
			);
		}
	});

	it('keeps only the kind of each note, post or call it mentions, never its id', async () => {
		const w = await world();
		const mention = (kind: string, id: string) => ({
			type: 'resourceMention',
			attrs: { kind, id }
		});
		const body = {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						text('See '),
						mention('note', w.noteId),
						mention('post', '01JD5Z3W8Q9X2M4N6P7R8S9T0P'),
						mention('call', '01JD5Z3W8Q9X2M4N6P7R8S9T0C')
					]
				}
			]
		};
		w.sqlite.prepare('UPDATE notes SET body = ? WHERE id = ?').run(JSON.stringify(body), w.noteId);
		await w.publish(w.ada, true);
		const { data } = await w.read(w.token()!);
		const [paragraph] = (data?.body as { content: { content: unknown[] }[] }).content;
		expect(paragraph.content, 'each mention as its kind alone').toEqual([
			text('See '),
			{ type: 'resourceMention', attrs: { kind: 'note' } },
			{ type: 'resourceMention', attrs: { kind: 'post' } },
			{ type: 'resourceMention', attrs: { kind: 'call' } }
		]);
	});

	it('shows the words a comment was made on without the comment', async () => {
		const w = await world();
		const commentId = '01JD5Z3W8Q9X2M4N6P7R8S9T0V';
		const body = {
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [
						text('Meet at '),
						{
							type: 'text',
							text: 'the trailhead',
							marks: [{ type: 'bold' }, { type: 'noteComment', attrs: { commentId } }]
						}
					]
				}
			]
		};
		w.sqlite.prepare('UPDATE notes SET body = ? WHERE id = ?').run(JSON.stringify(body), w.noteId);
		await w.publish(w.ada, true);
		for (const reader of [null, w.ada]) {
			const page = JSON.stringify((await w.read(w.token()!, reader)).data);
			const who = reader?.user.name ?? 'someone signed out';
			expect(page, `the words, read by ${who}`).toContain('the trailhead');
			expect(page, `their other marks, read by ${who}`).toContain('"bold"');
			expect(page, `no comment mark, read by ${who}`).not.toContain('noteComment');
			expect(page, `no comment id, read by ${who}`).not.toContain(commentId);
		}
	});

	it('404s the old URL for good once disabled, and publishing again makes a new one', async () => {
		const w = await world();
		await w.publish(w.ada, true);
		const first = w.token()!;
		expect(await w.publish(w.bo, false)).toBe('ok');
		expect(w.token()).toBeNull();
		const dead = await w.read(first);
		expect(dead.status).toBe(404);
		expect(dead.headers['cache-control'], 'a 404 is never cached').toBe('no-store');

		await w.publish(w.ada, true);
		expect(w.token()).not.toBe(first);
		expect((await w.read(first)).status).toBe(404);
		expect((await w.read(w.token()!)).status).toBe(200);
	});

	it('refuses to publish and 404s every public note while the org has public links off', async () => {
		const w = await world();
		await w.publish(w.ada, true);
		const token = w.token()!;
		w.sqlite.exec('UPDATE org SET public_posts = 0');
		expect((await w.read(token)).status).toBe(404);
		expect(w.anonymousViews(), 'a 404 isn’t a view').toBe(0);
		await w.publish(w.ada, false);
		expect(await w.publish(w.ada, true)).toBe(403);
		expect(w.token()).toBeNull();
	});

	it('counts each signed-out visit as an anonymous view, and a member’s visit not at all', async () => {
		const w = await world();
		await w.publish(w.ada, true);
		await w.read(w.token()!);
		await w.read(w.token()!);
		expect(w.anonymousViews()).toBe(2);
		const signedIn = await w.read(w.token()!, w.bo);
		expect(w.anonymousViews()).toBe(2);
		// A member's page carries their own data from the root layout, so no shared cache keeps it.
		expect(signedIn.headers['cache-control']).toBe('private, max-age=60');
	});

	it('gives the note page its public URL while published, and says when links are off', async () => {
		const w = await world();
		const offer = async (who: SignedIn) => {
			const url = new URL(`https://campfire.test/notes/${w.noteId}`);
			const data = (await loadNotePage({
				params: { id: w.noteId },
				locals: { user: who.user, member: who.member },
				url
			} as never)) as { publicUrl: string | null; publicLinks: boolean };
			return { publicUrl: data.publicUrl, publicLinks: data.publicLinks };
		};
		expect(await offer(w.bo)).toEqual({ publicUrl: null, publicLinks: true });
		await w.publish(w.bo, true);
		const publicUrl = `https://campfire.test/p/notes/${w.token()}`;
		expect(await offer(w.bo)).toEqual({ publicUrl, publicLinks: true });
		expect(await offer(w.cy), 'a reader copies it from the menu too').toEqual({
			publicUrl,
			publicLinks: true
		});
		w.sqlite.exec('UPDATE org SET public_posts = 0');
		expect(await offer(w.bo)).toEqual({ publicUrl: null, publicLinks: false });
	});

	it('404s the URL once the note is deleted', async () => {
		const w = await world();
		await w.publish(w.ada, true);
		const token = w.token()!;
		await deleteNote(w.env, w.ada, await loadNote(w.env, w.ada, w.noteId));
		expect((await w.read(token)).status).toBe(404);
	});
});

describe('excerpt', () => {
	it('keeps short text whole and cuts long text at a word', () => {
		expect(excerpt('  Two\n words ')).toBe('Two words');
		expect(excerpt('aaa bbb ccc', 7), 'a word ending at the limit is whole').toBe('aaa bbb…');
		expect(excerpt('aaa bbbb', 6)).toBe('aaa…');
		expect(excerpt('https://example.com/long', 10), 'one long word').toBe('https://ex…');
	});
});
