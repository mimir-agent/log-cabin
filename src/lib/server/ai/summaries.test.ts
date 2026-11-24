import { isHttpError, type ActionFailure } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '../auth/session';
import type { Role } from '../db/schema';
import { upsertDevMember } from '../dev-login';
import { suggestUsername } from '../people/usernames';
import { fakeD1 } from '../testing/fake-d1';
import { useTestEnv } from '../testing/env';
import { createNote, shareWithPeople, validateNoteInput } from '../notes/notes';
import { createNoteComment } from '../notes/discussion';
import { loadNote } from '../notes/access';
import { createPost, parseBody, type BodyInput } from '../posts/posts';
import { createComment } from '../posts/comments';
import { loadPost } from '../posts/posts';
import { createProject } from '../posts/projects';
import { ai as strings } from '../../strings/ai';
import { actions as postActions, load as postLoad } from '../../../routes/posts/[id]/+page.server';
import { actions as noteActions, load as noteLoad } from '../../../routes/notes/[id]/+page.server';
import { actions as orgActions } from '../../../routes/settings/org/+page.server';
import { actions as chatActions, load as chatLoad } from '../../../routes/chat/[id]/+page.server';
import { loadThread, startDm } from '../chat/threads';
import { deleteMessage, sendMessage } from '../chat/messages';
import { postUnits, SUMMARY_MIN_WORDS, THREAD_SUMMARY_MESSAGES } from './summaries';
import { CHECK_MODEL, SUMMARY_MODEL } from './grounded';

type ModelCall = { model: string; messages: { role: string; content: string }[] };

/** One sentence long enough that a discussion with it is worth summarizing. */
const details = Array.from({ length: SUMMARY_MIN_WORDS }, (_, i) => `detail${i}`).join(' ');

function body(text: string) {
	const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
	return parseBody(JSON.stringify(doc)) as BodyInput;
}

/** The summary a model gives when it quotes the first sentence it reads. */
function quotingFirst(author: string, kind: string, text: string) {
	return {
		summary: { bullets: [{ text, cites: [1] }], sources: [{ id: 1, author, kind, text }] }
	};
}

async function world(options: { ai?: 'answers' | 'fails' | 'absent' } = {}) {
	const { DB, sqlite } = fakeD1();
	sqlite.exec("INSERT INTO org (id, name, created_at) VALUES (1, 'Log Cabin', 0)");
	const calls: ModelCall[] = [];
	const AI = {
		run: async (model: string, input: { messages: ModelCall['messages'] }) => {
			// The check model backs every point; grounded.test.ts covers what it drops.
			if (model === CHECK_MODEL) {
				const points = input.messages[1].content.match(/^Point \d+:/gm) ?? [];
				const verdicts = points.map((_, i) => ({ point: i + 1, supported: true }));
				return { choices: [{ message: { content: JSON.stringify({ verdicts }) } }] };
			}
			calls.push({ model, messages: input.messages });
			if (options.ai === 'fails') throw new Error('3040: Capacity temporarily exceeded');
			const source = input.messages.find((m) => m.role === 'user')!.content;
			const first = source.split('\n')[0].replace(/^\[1\] [^:]*: /, '');
			const bullets = [{ text: first, cites: [1] }];
			return { choices: [{ message: { content: JSON.stringify({ bullets }) } }] };
		}
	};
	const env = {
		DB,
		JOBS: { send: async () => {} },
		REALTIME: {
			idFromName: (topic: string) => topic,
			// Nobody has a socket open: presence asks get an empty list, publishes are accepted.
			get: () => ({ fetch: async () => Response.json([]) })
		},
		...(options.ai === 'absent' ? {} : { AI })
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
	const projectId = await createProject(env, ada, {
		name: 'Launch',
		description: '',
		private: false
	});
	const postId = await createPost(env, ada, projectId, {
		title: 'Launch date',
		...body(`We ship on Friday. ${details}`)
	});
	return { env, sqlite, calls, person, ada, projectId, postId };
}

function event(who: SignedIn, path: string, id: string, fields: Record<string, string> = {}) {
	const url = new URL(`https://campfire.test${path}`);
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	return {
		request: new Request(url, { method: 'POST', body: form }),
		params: { id },
		locals: { user: who.user, member: who.member },
		depends: () => {},
		url
	};
}

type PostData = Exclude<Awaited<ReturnType<typeof postLoad>>, void>;

function summarizePostAs(who: SignedIn, postId: string) {
	return postActions.summarize(event(who, `/posts/${postId}?/summarize`, postId) as never);
}

async function statusOf(promise: unknown): Promise<number | 'ok'> {
	try {
		await promise;
		return 'ok';
	} catch (e) {
		if (isHttpError(e)) return e.status;
		throw e;
	}
}

async function summariesShownTo(who: SignedIn, postId: string) {
	const data = (await postLoad(event(who, `/posts/${postId}`, postId) as never)) as PostData;
	return data.summaries;
}

describe('AI summaries', () => {
	it('summarizes a post from its body and every comment and reply', async () => {
		const w = await world();
		const bo = await w.person('Bo', 'member');
		const post = await loadPost(w.env, w.ada, w.postId);
		const commentId = await createComment(w.env, w.ada, post, body('Docs are ready.'), null);
		const replyId = await createComment(w.env, bo, post, body('I will post the notes.'), commentId);

		const launch = quotingFirst('Ada', 'title', 'Launch date');
		expect(await summarizePostAs(w.ada, w.postId)).toEqual(launch);

		expect(w.calls).toHaveLength(1);
		expect(w.calls[0].model).toBe(SUMMARY_MODEL);
		const read = w.calls[0].messages.find((m) => m.role === 'user')?.content ?? '';
		expect(read.split('\n')).toEqual([
			'[1] title, Ada: Launch date',
			'[2] thread, Ada: We ship on Friday.',
			`[3] thread, Ada: ${details}`,
			'[4] comment 1, Ada: Docs are ready.',
			'[5] reply to comment 1, Bo: I will post the notes.'
		]);
		const anchors = (await postUnits(w.env, post)).map((unit) => unit.anchor);
		expect(anchors, 'comments and replies link to themselves on the page').toEqual([
			undefined,
			undefined,
			`comment-${commentId}`,
			`comment-${replyId}`
		]);
	});

	it('reuses the stored summary until the discussion changes', async () => {
		const w = await world();
		const launch = quotingFirst('Ada', 'title', 'Launch date');
		await summarizePostAs(w.ada, w.postId);
		expect(await summarizePostAs(w.ada, w.postId)).toEqual(launch);
		expect(w.calls, 'an unchanged post should not call the model again').toHaveLength(1);

		const post = await loadPost(w.env, w.ada, w.postId);
		await createComment(w.env, w.ada, post, body('Moved to Monday.'), null);

		expect(await summarizePostAs(w.ada, w.postId)).toEqual(launch);
		expect(w.calls, 'a new comment should call the model again').toHaveLength(2);
		expect(w.calls[1].messages[1].content).toContain('Moved to Monday.');
	});

	it('summarizes a note and its comments for someone it is shared with', async () => {
		const w = await world();
		const bo = await w.person('Bo', 'member');
		const input = validateNoteInput({ title: 'Retro', body: JSON.stringify({ type: 'doc' }) });
		if (!input.ok) throw new Error(`test note didn't validate: ${input.message}`);
		const noteId = await createNote(w.env, w.ada, {
			...input.input,
			bodyText: `Deploys were slow. ${details}`
		});
		await shareWithPeople(w.env, w.ada, await loadNote(w.env, w.ada, noteId), [bo.user.id], 'view');
		await createNoteComment(
			w.env,
			w.ada,
			await loadNote(w.env, w.ada, noteId),
			body('Cache the build.'),
			null
		);

		const result = await noteActions.summarize(
			event(bo, `/notes/${noteId}?/summarize`, noteId) as never
		);

		expect(result).toEqual(quotingFirst('Ada', 'title', 'Retro'));
		const read = w.calls[0].messages.find((m) => m.role === 'user')?.content ?? '';
		expect(read.split('\n')).toEqual([
			'[1] title, Ada: Retro',
			'[2] doc, Ada: Deploys were slow.',
			`[3] doc, Ada: ${details}`,
			'[4] comment 1, Ada: Cache the build.'
		]);
	});

	it('refuses someone who cannot see the post or the note, without calling the model', async () => {
		const w = await world();
		const outsider = await w.person('Cy', 'guest');
		const input = validateNoteInput({ title: 'Private', body: JSON.stringify({ type: 'doc' }) });
		if (!input.ok) throw new Error(`test note didn't validate: ${input.message}`);
		const noteId = await createNote(w.env, w.ada, input.input);

		expect(await statusOf(summarizePostAs(outsider, w.postId))).toBe(404);
		const noteEvent = event(outsider, `/notes/${noteId}?/summarize`, noteId) as never;
		expect(await statusOf(noteActions.summarize(noteEvent))).toBe(404);
		expect(w.calls).toHaveLength(0);
	});

	it('hides summaries and refuses them once an admin turns them off', async () => {
		const w = await world();
		const admin = await w.person('Ida', 'admin');
		expect(await summariesShownTo(w.ada, w.postId)).toBe('on');

		const settings = event(admin, '/settings/org', '', {
			name: 'Log Cabin',
			domain: '',
			domainJoin: 'off'
		});
		await orgActions.default(settings as never);

		expect(await summariesShownTo(w.ada, w.postId)).toBe('off');
		expect(await statusOf(summarizePostAs(w.ada, w.postId))).toBe(404);
		expect(w.calls).toHaveLength(0);
	});

	it('hides summaries when the deployment has no AI binding', async () => {
		const w = await world({ ai: 'absent' });
		expect(await summariesShownTo(w.ada, w.postId)).toBe('off');
		expect(await statusOf(summarizePostAs(w.ada, w.postId))).toBe(404);
	});

	it('shows a plain message when the model fails, calls it once and stores nothing', async () => {
		const w = await world({ ai: 'fails' });

		const result = (await summarizePostAs(w.ada, w.postId)) as ActionFailure<{
			summaryError: string;
		}>;

		expect(result.status).toBe(502);
		expect(result.data.summaryError).toBe(strings.errors.failed);
		expect(w.calls).toHaveLength(1);
		expect(w.sqlite.prepare('SELECT count(*) AS n FROM ai_summaries').get()).toEqual({ n: 0 });
	});

	it('summarizes a chat thread from its latest messages for its members only', async () => {
		const w = await world();
		const bo = await w.person('Bo', 'member');
		const cy = await w.person('Cy', 'member');
		const threadId = await startDm(w.env, w.ada, bo.user.id);
		const thread = await loadThread(w.env, w.ada, threadId);
		await sendMessage(w.env, w.ada, thread, body('The oldest message.'), null);
		const first = await sendMessage(w.env, bo, thread, body('Message 1.'), null);
		for (let i = 2; i < THREAD_SUMMARY_MESSAGES; i++) {
			await sendMessage(w.env, bo, thread, body(`Message ${i}.`), null);
		}
		const gone = await sendMessage(w.env, bo, thread, body('Oops, wrong chat.'), null);
		await deleteMessage(w.env, bo, thread, gone);
		await sendMessage(w.env, w.ada, thread, body('Bo books the venue.'), null);
		const summarizeAs = (who: SignedIn) =>
			chatActions.summarize(event(who, `/chat/${threadId}?/summarize`, threadId) as never);

		expect(await statusOf(summarizeAs(cy))).toBe(404);
		expect(w.calls).toHaveLength(0);

		const quoted = quotingFirst('Bo', 'message', 'Message 1.');
		expect(await summarizeAs(bo), 'a message source links to the message').toEqual({
			summary: {
				...quoted.summary,
				sources: [{ ...quoted.summary.sources[0], anchor: `message-${first}` }]
			}
		});
		const read = w.calls[0].messages.find((m) => m.role === 'user')?.content ?? '';
		expect(read).toContain('message, Ada: Bo books the venue.');
		expect(read).toContain('message, Bo: Message 1.');
		expect(read, 'a deleted message should not be read').not.toContain('Oops');
		expect(read, `only the latest ${THREAD_SUMMARY_MESSAGES} messages`).not.toContain('oldest');
	});

	it(`says a post, note or chat under ${SUMMARY_MIN_WORDS} words is too short, and refuses to summarize it without calling the model`, async () => {
		const w = await world();
		const bo = await w.person('Bo', 'member');
		const postId = await createPost(w.env, w.ada, w.projectId, {
			title: 'Lunch',
			...body('Tacos at noon?')
		});
		const post = await loadPost(w.env, w.ada, postId);
		await createComment(w.env, bo, post, body('Yes.'), null);
		const input = validateNoteInput({ title: 'Todo', body: JSON.stringify({ type: 'doc' }) });
		if (!input.ok) throw new Error(`test note didn't validate: ${input.message}`);
		const noteId = await createNote(w.env, w.ada, { ...input.input, bodyText: 'Buy milk.' });
		const threadId = await startDm(w.env, w.ada, bo.user.id);
		await sendMessage(w.env, w.ada, await loadThread(w.env, w.ada, threadId), body('Hi Bo.'), null);

		const loads = {
			post: await postLoad(event(w.ada, `/posts/${postId}`, postId) as never),
			note: await noteLoad(event(w.ada, `/notes/${noteId}`, noteId) as never),
			chat: await chatLoad(event(w.ada, `/chat/${threadId}`, threadId) as never)
		};
		expect(Object.values(loads).map((data) => (data as { summaries: string }).summaries)).toEqual([
			'tooShort',
			'tooShort',
			'tooShort'
		]);
		for (const [summarize, path, id] of [
			[postActions.summarize, 'posts', postId],
			[noteActions.summarize, 'notes', noteId],
			[chatActions.summarize, 'chat', threadId]
		] as const) {
			const refused = summarize(event(w.ada, `/${path}/${id}?/summarize`, id) as never);
			expect(await statusOf(refused), path).toBe(400);
		}
		expect(w.calls).toHaveLength(0);
	});
});
