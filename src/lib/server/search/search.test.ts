import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '../auth/session';
import type { Role } from '../db/schema';
import { upsertDevMember } from '../dev-login';
import { suggestUsername } from '../people/usernames';
import { getMember, memberIdForEmail, setDeactivated } from '../members';
import { fakeD1 } from '../testing/fake-d1';
import { useTestEnv } from '../testing/env';
import { loadProject } from '../posts/access';
import { addProjectMember, createProject } from '../posts/projects';
import { createPost, loadPost } from '../posts/posts';
import { createComment } from '../posts/comments';
import { loadNote } from '../notes/access';
import { createNote, shareWithPeople } from '../notes/notes';
import { createGroup, loadThread, startDm } from '../chat/threads';
import { deleteMessage, sendMessage } from '../chat/messages';
import { ftsQuery, search, recentItems } from './search';
import { markEnd, markStart, type SearchKind } from '../../search';

function world() {
	const { DB, sqlite } = fakeD1();
	const env = {
		DB,
		JOBS: { send: async () => {} },
		REALTIME: {
			idFromName: (topic: string) => topic,
			get: () => ({ fetch: async () => Response.json([]) })
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
	return { env, sqlite, person };
}

function body(text: string) {
	const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
	return { body: JSON.stringify(doc), bodyText: text, mentions: [] };
}

async function team() {
	const w = world();
	const ada = await w.person('Ada', 'member');
	const max = await w.person('Max', 'member');
	const vic = await w.person('Vic', 'viewer');
	const gus = await w.person('Gus', 'guest');
	const open = await createProject(w.env, ada, {
		name: 'Lighthouse',
		description: '',
		private: false
	});
	const secret = await createProject(w.env, ada, { name: 'Vault', description: '', private: true });
	return { ...w, ada, max, vic, gus, open, secret };
}

const ids = async (env: Env, who: SignedIn, q: string, kind?: SearchKind) =>
	(await search(env, who, q, { kind, limit: 50 })).map((hit) => `${hit.kind}:${hit.id}`);
/** An ended call in the place, with these people in it and one recording of these lines. */
function endedCall(
	sqlite: ReturnType<typeof world>['sqlite'],
	place: { projectId?: string; roomOwnerId?: string },
	people: SignedIn[],
	lines: string[]
) {
	const id = `call-${Math.random().toString(36).slice(2)}`;
	sqlite
		.prepare(
			'INSERT INTO calls (id, project_id, room_owner_id, started_by, started_at, ended_at) VALUES (?, ?, ?, ?, 0, 1)'
		)
		.run(id, place.projectId ?? null, place.roomOwnerId ?? null, people[0].user.id);
	for (const [i, person] of people.entries()) {
		sqlite
			.prepare(
				"INSERT INTO call_participants (id, call_id, user_id, session_id, joined_at) VALUES (?, ?, ?, 's', 0)"
			)
			.run(`${id}-p${i}`, id, person.user.id);
	}
	sqlite
		.prepare(
			'INSERT INTO call_recordings (id, call_id, started_by, started_at, status) VALUES (?, ?, ?, 0, ?)'
		)
		.run(`${id}-r`, id, people[0].user.id, 'ready');
	sqlite
		.prepare(
			'INSERT INTO call_recording_tracks (id, recording_id, participant_id, opened_at) VALUES (?, ?, ?, 0)'
		)
		.run(`${id}-t`, `${id}-r`, `${id}-p0`);
	sqlite
		.prepare(
			"INSERT INTO call_recording_segments (id, recording_id, track_id, seq, r2_key, start_ms, duration_ms, created_at) VALUES (?, ?, ?, 0, 'k', 0, 60000, 0)"
		)
		.run(`${id}-s`, `${id}-r`, `${id}-t`);
	for (const [i, text] of lines.entries()) {
		sqlite
			.prepare(
				'INSERT INTO call_transcript_lines (id, recording_id, segment_id, start_ms, end_ms, text) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.run(`${id}-l${i}`, `${id}-r`, `${id}-s`, i * 1000, i * 1000 + 900, text);
	}
	return id;
}

describe('turning typed text into a safe full-text query', () => {
	it('quotes each word and matches the last as a prefix', () => {
		expect(ftsQuery('budget review')).toBe('"budget" "review"*');
	});

	it('drops quotes, operators and punctuation instead of passing them to FTS', () => {
		expect(ftsQuery('"budget" OR -review* NEAR(x')).toBe('"budget" "OR" "review" "NEAR" "x"*');
		expect(ftsQuery('a"b')).toBe('"a" "b"*');
	});

	it('keeps letters from any script', () => {
		expect(ftsQuery('café 東京 Ωmega')).toBe('"café" "東京" "Ωmega"*');
	});

	it('gives nothing to search for when there are no letters or digits', () => {
		expect(ftsQuery('  "*()-  ')).toBeNull();
	});
});

describe('searching posts, comments, notes and people', () => {
	it('finds a post by a word in its title or body, with the words marked', async () => {
		const { env, ada, max, open } = await team();
		const postId = await createPost(env, ada, open, {
			title: 'Budget plan',
			...body('Numbers for spring')
		});
		const [hit] = await search(env, max, 'budget', { limit: 10 });
		expect(hit).toMatchObject({
			kind: 'post',
			id: postId,
			href: `/posts/${postId}`,
			projectName: 'Lighthouse'
		});
		expect(hit.title).toBe(`${markStart}Budget${markEnd} plan`);
		expect(await ids(env, max, 'spring')).toEqual([`post:${postId}`]);
	});

	it('ranks a title match above a body match', async () => {
		const { env, ada, max, open } = await team();
		const inBody = await createPost(env, ada, open, {
			title: 'Weekly',
			...body('the roadmap moved')
		});
		const inTitle = await createPost(env, ada, open, { title: 'Roadmap', ...body('details') });
		expect(await ids(env, max, 'roadmap')).toEqual([`post:${inTitle}`, `post:${inBody}`]);
	});

	it('matches as people type, by the start of the last word', async () => {
		const { env, ada, max, open } = await team();
		const postId = await createPost(env, ada, open, { title: 'Onboarding', ...body('') });
		expect(await ids(env, max, 'onboa')).toEqual([`post:${postId}`]);
	});

	it('survives quotes, operators and unicode in what people type', async () => {
		const { env, ada, max, open } = await team();
		const postId = await createPost(env, ada, open, {
			title: 'Café au lait',
			...body('東京 office')
		});
		for (const q of [
			'"café',
			'café AND',
			'NOT café',
			'東京',
			'cafe*)(',
			'café"; DROP TABLE posts;--'
		]) {
			await expect(search(env, max, q, { limit: 10 }), q).resolves.toBeInstanceOf(Array);
		}
		expect(await ids(env, max, '東京')).toEqual([`post:${postId}`]);
		expect(await ids(env, max, '"cafe')).toEqual([`post:${postId}`]);
	});

	it('links a comment to its post', async () => {
		const { env, ada, max, open } = await team();
		const postId = await createPost(env, ada, open, { title: 'Launch', ...body('') });
		const post = await loadPost(env, ada, postId);
		await createComment(env, ada, post, body('ship the pelican'), null);
		const [hit] = await search(env, max, 'pelican', { limit: 10 });
		expect(hit).toMatchObject({ kind: 'comment', href: `/posts/${postId}` });
	});

	it('narrows to one kind when asked', async () => {
		const { env, ada, max, open } = await team();
		const postId = await createPost(env, ada, open, { title: 'Garden', ...body('') });
		const noteId = await createNote(env, ada, { title: 'Garden notes', ...body('') });
		await shareWithPeople(env, ada, await loadNote(env, ada, noteId), [max.user.id], 'view');
		expect(await ids(env, max, 'garden', 'post')).toEqual([`post:${postId}`]);
		expect(await ids(env, max, 'garden', 'note')).toEqual([`note:${noteId}`]);
	});

	it('finds active people by name for viewers and up', async () => {
		const { env, max, vic } = await team();
		const memberId = await memberIdForEmail(env, max.user.email);
		const [hit] = await search(env, vic, 'max', { limit: 10 });
		expect(hit).toMatchObject({ kind: 'member', id: memberId, href: `/members/${memberId}` });
	});
});

describe('search shows only what the searcher can see', () => {
	it('keeps a private project’s post from a guest and from members outside it', async () => {
		const { env, ada, max, gus, secret } = await team();
		const postId = await createPost(env, ada, secret, { title: 'Acquisition', ...body('') });
		expect(await ids(env, ada, 'acquisition')).toEqual([`post:${postId}`]);
		expect(await ids(env, max, 'acquisition')).toEqual([]);
		expect(await ids(env, gus, 'acquisition')).toEqual([]);
	});

	it('shows a guest only the projects they were added to', async () => {
		const { env, ada, gus, open } = await team();
		const postId = await createPost(env, ada, open, { title: 'Timeline', ...body('') });
		expect(await ids(env, gus, 'timeline')).toEqual([]);
		await addProjectMember(env, ada, await loadProject(env, ada, open), gus.user.id);
		expect(await ids(env, gus, 'timeline')).toEqual([`post:${postId}`]);
	});

	it('keeps a note private until it is shared', async () => {
		const { env, ada, max } = await team();
		const noteId = await createNote(env, ada, { title: 'Salaries', ...body('') });
		expect(await ids(env, max, 'salaries')).toEqual([]);
		await shareWithPeople(env, ada, await loadNote(env, ada, noteId), [max.user.id], 'view');
		expect(await ids(env, max, 'salaries')).toEqual([`note:${noteId}`]);
	});

	it('finds a message only for the people in its thread, and not once it is deleted', async () => {
		const { env, ada, max, vic } = await team();
		const thread = await loadThread(env, ada, await startDm(env, ada, max.user.id));
		const messageId = await sendMessage(env, ada, thread, body('meet at the pier'), null);
		const [hit] = await search(env, max, 'pier', { limit: 10 });
		expect(hit).toMatchObject({ kind: 'message', id: messageId, href: `/chat/${thread.id}` });
		expect(await ids(env, vic, 'pier')).toEqual([]);
		await deleteMessage(env, ada, thread, messageId);
		expect(await ids(env, ada, 'pier')).toEqual([]);
	});

	it('titles a message by its group’s name, or in a DM by the other person', async () => {
		const { env, ada, max, vic } = await team();
		const dm = await loadThread(env, ada, await startDm(env, ada, max.user.id));
		await sendMessage(env, ada, dm, body('bring the lantern'), null);
		const group = await loadThread(
			env,
			ada,
			await createGroup(env, ada, 'Trail crew', [max.user.id, vic.user.id])
		);
		await sendMessage(env, max, group, body('lantern batteries'), null);
		const titles = async (who: SignedIn) =>
			Object.fromEntries(
				(await search(env, who, 'lantern', { limit: 10 })).map((hit) => [hit.href, hit.title])
			);
		expect(await titles(max)).toEqual({
			[`/chat/${dm.id}`]: 'Ada',
			[`/chat/${group.id}`]: 'Trail crew'
		});
		expect(await titles(ada)).toEqual({
			[`/chat/${dm.id}`]: 'Max',
			[`/chat/${group.id}`]: 'Trail crew'
		});
	});

	it('gives guests no people results, and nobody deactivated people', async () => {
		const { env, ada, max, gus } = await team();
		expect(await ids(env, gus, 'max')).toEqual([]);
		const row = await getMember(env, (await memberIdForEmail(env, max.user.email)) ?? '');
		if (!row) throw new Error(`expected a member row for ${max.user.email}`);
		await setDeactivated(env, row, true);
		expect(await ids(env, ada, 'max')).toEqual([]);
	});

	it('filters before the limit, so hidden matches don’t crowd out visible ones', async () => {
		const { env, ada, max, open, secret } = await team();
		for (let i = 0; i < 5; i++) {
			await createPost(env, ada, secret, { title: `Zebra zebra ${i}`, ...body('zebra zebra') });
		}
		const visible = await createPost(env, ada, open, { title: 'Notes', ...body('a zebra once') });
		expect((await search(env, max, 'zebra', { limit: 1 })).map((h) => h.id)).toEqual([visible]);
	});
});

describe('searching projects and calls', () => {
	it('finds a project by its name or its description', async () => {
		const { env, ada, max } = await team();
		const projectId = await createProject(env, ada, {
			name: 'Basecamp',
			description: 'Gear lists for the spring trip',
			private: false
		});
		const [hit] = await search(env, max, 'basecamp', { limit: 10 });
		expect(hit).toMatchObject({
			kind: 'project',
			id: projectId,
			href: `/projects/${projectId}`,
			projectName: null,
			projectPrivate: false,
			projectArchived: false
		});
		expect(await ids(env, max, 'gear', 'project')).toEqual([`project:${projectId}`]);
	});

	it('shows a private project only to its members', async () => {
		const { env, ada, max, gus, secret } = await team();
		expect(await ids(env, ada, 'vault')).toEqual([`project:${secret}`]);
		expect(await ids(env, max, 'vault')).toEqual([]);
		expect(await ids(env, gus, 'vault')).toEqual([]);
	});

	it('finds a call by its title, by who was in it and by a word said in it', async () => {
		const { env, sqlite, ada, max, open } = await team();
		const callId = endedCall(sqlite, { projectId: open }, [ada, max], ['Pack the stove first']);
		sqlite.prepare('UPDATE calls SET title = ? WHERE id = ?').run('Trip planning', callId);
		const [hit] = await search(env, max, 'planning', { limit: 10 });
		expect(hit).toMatchObject({
			kind: 'call',
			id: callId,
			href: `/calls/${callId}`,
			projectName: 'Lighthouse'
		});
		expect(hit.title).toBe(`Trip ${markStart}planning${markEnd}`);
		expect(await ids(env, ada, 'max')).toContain(`call:${callId}`);
		expect(await ids(env, ada, 'stove')).toEqual([`call:${callId}`]);
	});

	it('keeps a person’s new name and later transcript lines findable', async () => {
		const { env, sqlite, ada, max, open } = await team();
		const callId = endedCall(sqlite, { projectId: open }, [ada, max], []);
		sqlite
			.prepare(
				"INSERT INTO call_transcript_lines (id, recording_id, segment_id, start_ms, end_ms, text) VALUES ('late', ?, ?, 0, 1, 'kayak rental')"
			)
			.run(`${callId}-r`, `${callId}-s`);
		sqlite.prepare("UPDATE users SET name = 'Maximilian' WHERE id = ?").run(max.user.id);
		expect(await ids(env, ada, 'kayak')).toEqual([`call:${callId}`]);
		expect(await ids(env, ada, 'maximilian', 'call')).toEqual([`call:${callId}`]);
	});

	it('finds nothing of a call for a guest who can’t see it', async () => {
		const { env, sqlite, ada, max, gus, open, secret } = await team();
		const inOpen = endedCall(sqlite, { projectId: open }, [ada, max], ['campfire stories']);
		const inSecret = endedCall(sqlite, { projectId: secret }, [ada], ['campfire budget']);
		const inRoom = endedCall(sqlite, { roomOwnerId: ada.user.id }, [ada, max], ['campfire songs']);
		expect(await ids(env, gus, 'campfire')).toEqual([]);
		expect(await ids(env, gus, 'ada')).toEqual([]);
		expect((await ids(env, max, 'campfire')).sort()).toEqual(
			[`call:${inOpen}`, `call:${inRoom}`].sort()
		);
		expect((await ids(env, ada, 'campfire')).sort()).toEqual(
			[`call:${inOpen}`, `call:${inSecret}`, `call:${inRoom}`].sort()
		);
	});
});

describe('rebuilding the index', () => {
	it('writes back the same rows the triggers keep', async () => {
		const { env, sqlite, person } = world();
		const ada = await person('Ada', 'member');
		const open = await createProject(env, ada, { name: 'Open', description: '', private: false });
		const postId = await createPost(env, ada, open, { title: 'Kite', ...body('string') });
		await createComment(env, ada, await loadPost(env, ada, postId), body('wind'), null);
		await createNote(env, ada, { title: 'Tide', ...body('moon') });
		const max = await person('Max', 'member');
		const thread = await loadThread(env, ada, await startDm(env, ada, max.user.id));
		await sendMessage(env, ada, thread, body('ahoy'), null);
		const gone = await sendMessage(env, ada, thread, body('oops'), null);
		await deleteMessage(env, ada, thread, gone);
		const callId = endedCall(sqlite, { projectId: open }, [ada, max], ['first', 'second']);
		sqlite.prepare("UPDATE calls SET title = 'Sync' WHERE id = ?").run(callId);
		const rows = () =>
			sqlite
				.prepare(
					'SELECT kind, ref_id, project_id, visibility, owner_id, title, body FROM search_index ORDER BY kind, ref_id'
				)
				.all();
		const before = rows();
		expect(before.map((r) => r.kind)).toEqual([
			'call',
			'comment',
			'member',
			'member',
			'message',
			'note',
			'post',
			'project'
		]);
		sqlite.exec('DELETE FROM search_index');
		sqlite.exec(readFileSync('script/reindex.sql', 'utf8'));
		expect(rows()).toEqual(before);
	});
});

describe('the quick switcher’s lists', () => {
	it('lists the most recently changed posts and notes the person can see', async () => {
		const { env, ada, max, open, secret } = await team();
		const older = await createPost(env, ada, open, { title: 'Older', ...body('') }, 1000);
		await createPost(env, ada, secret, { title: 'Hidden', ...body('') }, 3000);
		const noteId = await createNote(env, ada, { title: 'Newer', ...body('') }, null, 2000);
		await shareWithPeople(env, ada, await loadNote(env, ada, noteId), [max.user.id], 'view');
		expect((await recentItems(env, max, 5)).map((i) => i.href)).toEqual([
			`/notes/${noteId}`,
			`/posts/${older}`
		]);
	});
});
