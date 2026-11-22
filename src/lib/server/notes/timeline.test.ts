import { describe, expect, it } from 'vitest';
import type { SignedIn } from '../auth/session';
import type { Role } from '../db/schema';
import { upsertDevMember } from '../dev-login';
import { suggestUsername } from '../people/usernames';
import { fakeD1 } from '../testing/fake-d1';
import { useTestEnv } from '../testing/env';
import { loadProject } from '../posts/access';
import { pinToProject, unpinFromProject } from '../posts/pins';
import { createPost, loadPost, parseBody, updatePost, type BodyInput } from '../posts/posts';
import { addProjectMember, createProject } from '../posts/projects';
import { loadNote } from './access';
import {
	createNote,
	renameNote,
	saveLiveBody,
	setProjectShare,
	shareWithPeople,
	validateNoteInput
} from './notes';
import { listNoteEvents, type NoteTimelineEvent } from './timeline';

async function world() {
	const { DB, sqlite } = fakeD1();
	const published: { topic: string; payload: { type: string } }[] = [];
	const env = {
		DB,
		JOBS: { send: async () => {} },
		REALTIME: {
			idFromName: (name: string) => name,
			get: (hub: string) => ({
				fetch: async (_url: string, init: RequestInit) => {
					if (hub === 'org') published.push(JSON.parse(init.body as string));
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
	const ada = await person('Ada', 'member');
	const bo = await person('Bo', 'member');
	const cy = await person('Cy', 'guest');
	const open = await createProject(env, ada, { name: 'Open', description: '', private: false });
	const secret = await createProject(env, ada, { name: 'Secret', description: '', private: true });
	const noteId = await createNote(env, ada, note('Plan'));
	const addTo = async (projectId: string, who: SignedIn) =>
		addProjectMember(env, ada, await loadProject(env, ada, projectId), who.user.id);
	/** The note's timeline rows as stored, oldest first. */
	const events = (id = noteId) =>
		sqlite
			.prepare(
				'SELECT kind, actor_id, project_id, title, ref_type, ref_id FROM note_events WHERE note_id = ? ORDER BY created_at, rowid'
			)
			.all(id);
	const timelineTopics = () =>
		published.filter((p) => p.payload.type === 'note.timeline').map((p) => p.topic);
	return {
		env,
		sqlite,
		published,
		ada,
		bo,
		cy,
		open,
		secret,
		noteId,
		addTo,
		events,
		timelineTopics
	};
}

function note(title: string, text = 'Body') {
	const body = JSON.stringify({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});
	const result = validateNoteInput({ title, body });
	if (!result.ok) throw new Error(`test note didn't validate: ${result.message}`);
	return result.input;
}

/** A body that links to each href, as the editor stores links. */
function linking(...hrefs: string[]) {
	return {
		type: 'doc',
		content: [
			{
				type: 'paragraph',
				content: [
					{ type: 'text', text: 'See ' },
					...hrefs.map((href) => ({
						type: 'text',
						text: href,
						marks: [{ type: 'link', attrs: { href } }]
					}))
				]
			}
		]
	};
}

function postBody(...hrefs: string[]) {
	const body = parseBody(JSON.stringify(linking(...hrefs)));
	if ('message' in body) throw new Error(`test post didn't validate: ${body.message}`);
	return body as BodyInput;
}

const noteUrl = (id: string) => `https://campfire.example/notes/${id}`;

describe('recording what happens to a note', () => {
	it('records sharing with a project and moving to another, but not leaving one', async () => {
		const w = await world();
		const share = (projectId: string | null) =>
			loadNote(w.env, w.ada, w.noteId).then((n) =>
				setProjectShare(w.env, w.ada, n, projectId ? { projectId, permission: 'view' } : null)
			);
		await share(w.open);
		await share(w.open);
		await share(w.secret);
		await share(null);
		expect(w.events(), 'one line per new project, none for the same one or for none').toEqual([
			expect.objectContaining({ kind: 'project', actor_id: w.ada.user.id, project_id: w.open }),
			expect.objectContaining({ kind: 'project', actor_id: w.ada.user.id, project_id: w.secret })
		]);
	});

	it('records a rename only when the title changes', async () => {
		const w = await world();
		const rename = async (title: string) =>
			renameNote(w.env, w.ada, await loadNote(w.env, w.ada, w.noteId), title);
		await rename('Plan');
		await rename('Launch plan');
		expect(w.events(), 'the same title again records nothing').toEqual([
			expect.objectContaining({ kind: 'title', actor_id: w.ada.user.id, title: 'Launch plan' })
		]);
	});

	it('records pinning and unpinning a note in its project, and tells the note’s page', async () => {
		const w = await world();
		await setProjectShare(w.env, w.ada, await loadNote(w.env, w.ada, w.noteId), {
			projectId: w.open,
			permission: 'view'
		});
		w.published.length = 0;
		const subject = { type: 'note', id: w.noteId } as const;
		await pinToProject(w.env, w.bo, w.open, subject);
		await pinToProject(w.env, w.bo, w.open, subject);
		await unpinFromProject(w.env, w.bo, w.open, subject);
		await unpinFromProject(w.env, w.bo, w.open, subject);
		expect(
			w.events().slice(1),
			'a pin already there, or one already gone, records nothing'
		).toEqual([
			expect.objectContaining({ kind: 'pinned', actor_id: w.bo.user.id, project_id: w.open }),
			expect.objectContaining({ kind: 'unpinned', actor_id: w.bo.user.id, project_id: w.open })
		]);
		expect(w.timelineTopics()).toEqual([`note:${w.noteId}`, `note:${w.noteId}`]);
	});

	it('records nothing on a note when a post is pinned', async () => {
		const w = await world();
		const postId = await createPost(w.env, w.ada, w.open, { title: 'News', ...postBody() });
		await pinToProject(w.env, w.ada, w.open, { type: 'post', id: postId });
		expect(w.sqlite.prepare('SELECT count(*) AS n FROM note_events').get()).toEqual({ n: 0 });
	});

	it('records a post linking to a note once, when it is written or first edited to', async () => {
		const w = await world();
		const other = await createNote(w.env, w.ada, note('Other'));
		const postId = await createPost(w.env, w.bo, w.open, {
			title: 'News',
			...postBody(noteUrl(w.noteId), 'https://campfire.example/notes/NOSUCHNOTE')
		});
		const post = await loadPost(w.env, w.bo, postId);
		await updatePost(w.env, w.bo, post, {
			title: 'News',
			poll: null,
			...postBody(noteUrl(w.noteId), `http://elsewhere.example/notes/${other}`)
		});
		const ref = { kind: 'referenced', actor_id: w.bo.user.id, ref_type: 'post', ref_id: postId };
		expect(w.events(), 'linked at creation; the edit adds nothing').toEqual([
			expect.objectContaining(ref)
		]);
		expect(w.events(other), 'linked by the edit').toEqual([expect.objectContaining(ref)]);
		expect(w.timelineTopics()).toEqual([`note:${w.noteId}`, `note:${other}`]);
		expect(
			w.sqlite.prepare("SELECT count(*) AS n FROM note_events WHERE note_id = 'NOSUCHNOTE'").get(),
			'a link to a note that doesn’t exist records nothing'
		).toEqual({ n: 0 });
	});

	it('records a note linking to another note when its live body is stored, not to itself', async () => {
		const w = await world();
		const other = await createNote(w.env, w.bo, note('Other'));
		const body = linking(noteUrl(w.noteId), noteUrl(other));
		await saveLiveBody(w.env, other, body, w.ada.user.id);
		await saveLiveBody(w.env, other, body, w.bo.user.id);
		expect(w.events(), 'once, by whoever stored it first').toEqual([
			expect.objectContaining({
				kind: 'referenced',
				actor_id: w.ada.user.id,
				ref_type: 'note',
				ref_id: other
			})
		]);
		expect(w.events(other), 'a note’s link to itself').toEqual([]);
	});
});

/** Each line as "<actor> <kind> <what>", the way the page words it, for readable assertions. */
function lines(events: NoteTimelineEvent[]) {
	return events.map((e) => {
		const what =
			e.kind === 'title'
				? e.title
				: e.kind === 'referenced'
					? `${e.ref.type} ${e.ref.title}`
					: e.project.name;
		return `${e.actorName} ${e.kind} ${what}`;
	});
}

/**
 * Ada's note, shared by name with Bo (a member) and Cy (a guest), with one of each line:
 * some about the private project Secret, which only Ada is in, and references from a post in
 * each project, from her private note and from a note shared with Bo.
 */
async function busyNote() {
	const w = await world();
	const loaded = () => loadNote(w.env, w.ada, w.noteId);
	await shareWithPeople(w.env, w.ada, await loaded(), [w.bo.user.id, w.cy.user.id], 'view');
	await setProjectShare(w.env, w.ada, await loaded(), { projectId: w.open, permission: 'view' });
	await setProjectShare(w.env, w.ada, await loaded(), { projectId: w.secret, permission: 'view' });
	await pinToProject(w.env, w.ada, w.secret, { type: 'note', id: w.noteId });
	await renameNote(w.env, w.ada, await loaded(), 'Launch plan');
	const link = postBody(noteUrl(w.noteId));
	await createPost(w.env, w.ada, w.open, { title: 'Open news', ...link });
	await createPost(w.env, w.ada, w.secret, { title: 'Secret news', ...link });
	const own = await createNote(w.env, w.ada, note('Ada’s own'));
	await saveLiveBody(w.env, own, linking(noteUrl(w.noteId)), w.ada.user.id);
	const shared = await createNote(w.env, w.ada, note('For Bo'));
	await shareWithPeople(w.env, w.ada, await loadNote(w.env, w.ada, shared), [w.bo.user.id], 'view');
	await saveLiveBody(w.env, shared, linking(noteUrl(w.noteId)), w.ada.user.id);
	const seen = async (who: SignedIn) => lines(await listNoteEvents(w.env, who, w.noteId));
	return { ...w, seen };
}

describe('reading a note’s timeline', () => {
	it('shows its author every line, oldest first, with projects and references named', async () => {
		const w = await busyNote();
		expect(await w.seen(w.ada)).toEqual([
			'Ada project Open',
			'Ada project Secret',
			'Ada pinned Secret',
			'Ada title Launch plan',
			'Ada referenced post Open news',
			'Ada referenced post Secret news',
			'Ada referenced note Ada’s own',
			'Ada referenced note For Bo'
		]);
	});

	it('links each reference to the post or note that made it', async () => {
		const w = await busyNote();
		const refs = (await listNoteEvents(w.env, w.ada, w.noteId)).flatMap((e) =>
			e.kind === 'referenced' ? [e.ref] : []
		);
		const ids = w.sqlite
			.prepare("SELECT ref_id FROM note_events WHERE kind = 'referenced' ORDER BY rowid")
			.all()
			.map((r) => r.ref_id);
		expect(refs.map((r) => r.id)).toEqual(ids);
		expect(refs.map((r) => r.type)).toEqual(['post', 'post', 'note', 'note']);
	});

	it('leaves out, for a member outside a private project, its lines and its posts’ references, and notes not shared with them', async () => {
		const w = await busyNote();
		expect(await w.seen(w.bo)).toEqual([
			'Ada project Open',
			'Ada title Launch plan',
			'Ada referenced post Open news',
			'Ada referenced note For Bo'
		]);
	});

	it('shows a guest only the projects they were added to and what is in them', async () => {
		const w = await busyNote();
		expect(await w.seen(w.cy), 'a guest sees no project they aren’t in').toEqual([
			'Ada title Launch plan'
		]);
		await w.addTo(w.open, w.cy);
		expect(await w.seen(w.cy), 'once added to Open').toEqual([
			'Ada project Open',
			'Ada title Launch plan',
			'Ada referenced post Open news'
		]);
	});

	it('shows the lines a member of the private project is let into once they join it', async () => {
		const w = await busyNote();
		await w.addTo(w.secret, w.bo);
		expect(await w.seen(w.bo)).toEqual([
			'Ada project Open',
			'Ada project Secret',
			'Ada pinned Secret',
			'Ada title Launch plan',
			'Ada referenced post Open news',
			'Ada referenced post Secret news',
			'Ada referenced note For Bo'
		]);
	});
});
