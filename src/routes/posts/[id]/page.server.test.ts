import { isHttpError, isRedirect, type ActionFailure } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '#lib/server/auth/session.js';
import type { Role } from '#lib/server/db/schema/index.js';
import { upsertDevMember } from '#lib/server/dev-login.js';
import { newId } from '#lib/id.js';
import { suggestUsername } from '#lib/server/people/usernames.js';
import { fakeD1 } from '#lib/server/testing/fake-d1.js';
import { useTestEnv } from '#lib/server/testing/env.js';
import { createPost, feed, parseBody, type BodyInput } from '#lib/server/posts/posts.js';
import { loadProject } from '#lib/server/posts/access.js';
import { addProjectMember, composerData, createProject } from '#lib/server/posts/projects.js';
import type { LoadedPoll } from '#lib/server/posts/polls.js';
import { actions, load } from './+page.server';
import { load as loadEdit } from './edit/+page.server';
import { load as loadVersions } from './versions/+page.server';
import { listVersions, type PostVersion } from '#lib/server/posts/versions.js';
import { actions as newPostActions } from '../../projects/[id]/new/+page.server';

function doc(text: string) {
	return JSON.stringify({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});
}

async function world() {
	const { DB, sqlite } = fakeD1();
	sqlite.exec("INSERT INTO org (id, name, created_at) VALUES (1, 'Log Cabin', 0)");
	const env = {
		DB,
		JOBS: { send: async () => {} },
		REALTIME: {
			idFromName: (topic: string) => topic,
			get: () => ({ fetch: async () => new Response(null, { status: 204 }) })
		},
		BUCKET: {}
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
	const projectId = await createProject(env, author, {
		name: 'Launch',
		description: '',
		private: false
	});
	const postId = await createPost(env, author, projectId, {
		title: 'Plan',
		...(parseBody(doc('The plan')) as BodyInput)
	});
	return { env, person, author, projectId, postId };
}

function event(who: SignedIn, postId: string, path = '', fields: Record<string, string> = {}) {
	const url = new URL(`https://campfire.test/posts/${postId}${path}`);
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	return {
		request: new Request(url, { method: 'POST', body }),
		params: { id: postId },
		locals: { user: who.user, member: who.member },
		url
	};
}

type CommentEvent = Parameters<typeof actions.comment>[0];
type LoadEvent = Parameters<typeof load>[0];
type PostData = Exclude<Awaited<ReturnType<typeof load>>, void>;
type EditData = Exclude<Awaited<ReturnType<typeof loadEdit>>, void>;

async function guestInProjectWithOutsider() {
	const w = await world();
	await w.person('Zed', 'member');
	const guest = await w.person('Gus', 'guest');
	const project = await loadProject(w.env, w.author, w.projectId);
	await addProjectMember(w.env, w.author, project, guest.user.id);
	return { ...w, guest };
}

function names(people: { name: string }[]) {
	return people.map((p) => p.name);
}

describe('/posts/[id]', () => {
	it('403s a viewer who tries to comment', async () => {
		const { person, postId } = await world();
		const viewer = await person('Vic', 'viewer');
		const e = await Promise.resolve(
			actions.comment(
				event(viewer, postId, '', { body: doc('Hi'), id: newId() }) as unknown as CommentEvent
			)
		).catch((e: unknown) => e);
		expect(isHttpError(e, 403)).toBe(true);
	});

	it('shows a member’s comment when the post loads', async () => {
		const { person, postId } = await world();
		const member = await person('Bo', 'member');
		await actions.comment(
			event(member, postId, '', { body: doc('Ship it'), id: newId() }) as unknown as CommentEvent
		);
		const data = (await load(event(member, postId) as unknown as LoadEvent)) as PostData;
		expect(data.comments).toMatchObject([{ authorName: 'Bo', body: doc('Ship it'), replies: [] }]);
		expect(data.canWrite).toBe(true);
	});

	it('fails with a message when the comment is empty', async () => {
		const { person, postId } = await world();
		const member = await person('Bo', 'member');
		const result = (await actions.comment(
			event(member, postId, '', { body: doc('') }) as unknown as CommentEvent
		)) as ActionFailure<{ message: string }>;
		expect(result.status).toBe(400);
		expect(result.data.message).toBeTruthy();
	});

	it('403s /edit for a member who isn’t the author', async () => {
		const { person, postId } = await world();
		const member = await person('Bo', 'member');
		const e = await Promise.resolve(
			loadEdit(event(member, postId, '/edit') as unknown as Parameters<typeof loadEdit>[0])
		).catch((e: unknown) => e);
		expect(isHttpError(e, 403)).toBe(true);
	});

	it('offers a guest only the project’s people to mention on a post', async () => {
		const { guest, postId } = await guestInProjectWithOutsider();
		const data = (await load(event(guest, postId) as unknown as LoadEvent)) as PostData;
		expect(names(data.people)).toEqual(['Ada', 'Gus']);
	});

	it('offers a guest only the project’s people to mention when editing their post', async () => {
		const { env, guest, projectId } = await guestInProjectWithOutsider();
		const postId = await createPost(env, guest, projectId, {
			title: 'Notes',
			...(parseBody(doc('Mine')) as BodyInput)
		});
		const edit = event(guest, postId, '/edit') as unknown as Parameters<typeof loadEdit>[0];
		const data = (await loadEdit(edit)) as EditData;
		expect(names(data.people)).toEqual(['Ada', 'Gus']);
	});

	it('offers a guest only the project’s people to mention in the new-post dialog', async () => {
		const { env, guest, projectId } = await guestInProjectWithOutsider();
		const data = await composerData(env, guest, projectId);
		expect(names(data.members)).toEqual(['Ada', 'Gus']);
	});

	it('offers a member everyone in the org to mention', async () => {
		const { env, person, postId, projectId } = await guestInProjectWithOutsider();
		const member = await person('Bo', 'member');
		const post = (await load(event(member, postId) as unknown as LoadEvent)) as PostData;
		const newPost = await composerData(env, member, projectId);
		const everyone = ['Ada', 'Bo', 'Gus', 'Zed'];
		expect(names(post.people)).toEqual(everyone);
		expect(names(newPost.members)).toEqual(everyone);
	});
});

const checklist = (...items: [string, boolean][]) =>
	JSON.stringify({
		type: 'doc',
		content: [
			{
				type: 'taskList',
				content: items.map(([text, checked]) => ({
					type: 'taskItem',
					attrs: { checked },
					content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
				}))
			}
		]
	});

type TickEvent = Parameters<typeof actions.tick>[0];
const ticked = (body: unknown) =>
	(body as { content: { content: { attrs: { checked: boolean } }[] }[] }).content[0].content.map(
		(item) => item.attrs.checked
	);

describe('task checkboxes on a post', () => {
	async function checklistPost() {
		const w = await world();
		const postId = await createPost(w.env, w.author, w.projectId, {
			title: 'Packing',
			...(parseBody(checklist(['Tents', false], ['Lanterns', false])) as BodyInput)
		});
		const tick = (who: SignedIn, fields: Record<string, string>) =>
			actions.tick(event(who, postId, '', fields) as unknown as TickEvent);
		const reload = async (who: SignedIn) =>
			(await load(event(who, postId) as unknown as LoadEvent)) as PostData;
		return { ...w, postId, tick, reload };
	}

	it('keeps a tick in the post after a reload, and refuses a viewer’s tick', async () => {
		const { person, author, tick, reload } = await checklistPost();
		const viewer = await person('Vic', 'viewer');
		const refused = await Promise.resolve(
			tick(viewer, { subject: 'post', id: '', index: '1', checked: 'true' })
		).catch((e: unknown) => e);
		expect(isHttpError(refused, 403)).toBe(true);
		expect(ticked((await reload(author)).post.body)).toEqual([false, false]);
		await tick(author, { subject: 'post', id: '', index: '1', checked: 'true' });
		expect(ticked((await reload(author)).post.body)).toEqual([false, true]);
	});

	it('keeps a tick in a comment after a reload, and refuses a viewer’s tick', async () => {
		const { person, author, postId, tick, reload } = await checklistPost();
		const bo = await person('Bo', 'member');
		const viewer = await person('Vic', 'viewer');
		await actions.comment(
			event(bo, postId, '', {
				body: checklist(['Maps', false]),
				id: newId()
			}) as unknown as CommentEvent
		);
		const [comment] = (await reload(author)).comments;
		const fields = { subject: 'comment', id: comment.id, index: '0', checked: 'true' };
		const refused = await Promise.resolve(tick(viewer, fields)).catch((e: unknown) => e);
		expect(isHttpError(refused, 403)).toBe(true);
		expect(ticked(JSON.parse((await reload(bo)).comments[0].body))).toEqual([false]);
		await tick(author, fields);
		expect(ticked(JSON.parse((await reload(bo)).comments[0].body))).toEqual([true]);
	});

	it('refuses a tick from someone who can’t see the post, and leaves it unticked', async () => {
		const { person, author, tick, reload } = await checklistPost();
		const guest = await person('Gus', 'guest');
		const e = await Promise.resolve(
			tick(guest, { subject: 'post', id: '', index: '0', checked: 'true' })
		).catch((e: unknown) => e);
		expect(isHttpError(e, 404)).toBe(true);
		expect(ticked((await reload(author)).post.body)).toEqual([false, false]);
	});

	it('refuses a tick past the last task with a 400', async () => {
		const { author, tick } = await checklistPost();
		const e = await Promise.resolve(
			tick(author, { subject: 'post', id: '', index: '2', checked: 'true' })
		).catch((e: unknown) => e);
		expect(isHttpError(e, 400)).toBe(true);
	});
});

describe('polls', () => {
	const pollField = (...options: string[]) =>
		JSON.stringify({
			question: 'Where?',
			options: options.map((description) => ({ description }))
		});

	async function publishWithPoll(who: SignedIn, projectId: string, poll: string) {
		const body = new FormData();
		body.set('title', 'Trip');
		body.set('body', doc('Pick one'));
		body.set('poll', poll);
		const e = {
			request: new Request(`https://campfire.test/projects/${projectId}/new`, {
				method: 'POST',
				body
			}),
			params: { id: projectId },
			locals: { user: who.user, member: who.member },
			url: new URL(`https://campfire.test/projects/${projectId}/new`)
		} as unknown as Parameters<typeof newPostActions.publish>[0];
		return Promise.resolve(newPostActions.publish(e)).catch((e: unknown) => e);
	}

	async function pollPost() {
		const w = await world();
		const redirect = await publishWithPoll(
			w.author,
			w.projectId,
			pollField('Lake', 'Hills', 'Coast')
		);
		if (!isRedirect(redirect))
			throw new Error(`expected a redirect to the new post, got ${String(redirect)}`);
		const postId = redirect.location.split('/').pop()!;
		const page = async (who: SignedIn) =>
			(await load(event(who, postId) as unknown as LoadEvent)) as PostData;
		const options = ((await page(w.author)).poll as LoadedPoll).options;
		const castVote = (who: SignedIn, option: string) =>
			Promise.resolve(
				actions.vote(
					event(who, postId, '', {
						optionId: options.find((o) => o.description === option)!.id
					}) as unknown as Parameters<typeof actions.vote>[0]
				)
			).catch((e: unknown) => e);
		return { ...w, postId, page, castVote };
	}

	const tally = (poll: LoadedPoll) =>
		Object.fromEntries(poll.options.map((o) => [o.description, o.voters]));

	it('creates a poll with the post and shows every member who voted for what', async () => {
		const { person, author, page, castVote } = await pollPost();
		const bo = await person('Bo', 'member');
		await castVote(author, 'Lake');
		await castVote(bo, 'Hills');
		const poll: LoadedPoll = (await page(bo)).poll;
		expect(poll.question).toBe('Where?');
		expect(poll.total).toBe(2);
		expect(tally(poll)).toEqual({ Lake: ['Ada'], Hills: ['Bo'], Coast: [] });
		expect(poll.options.find((o) => o.chosen)?.description).toBe('Hills');
	});

	it('changes a vote instead of adding a second one', async () => {
		const { author, page, castVote } = await pollPost();
		await castVote(author, 'Lake');
		await castVote(author, 'Coast');
		const poll: LoadedPoll = (await page(author)).poll;
		expect(poll.total).toBe(1);
		expect(tally(poll)).toEqual({ Lake: [], Hills: [], Coast: ['Ada'] });
	});

	it('refuses a viewer’s vote with a 403 and lets them see the result', async () => {
		const { person, page, castVote } = await pollPost();
		const viewer = await person('Vic', 'viewer');
		expect(isHttpError(await castVote(viewer, 'Lake'), 403)).toBe(true);
		expect((await page(viewer)).poll!.total).toBe(0);
	});

	it('answers 404 to a guest who isn’t in the project, for the poll and the vote', async () => {
		const { person, postId, castVote } = await pollPost();
		const guest = await person('Gus', 'guest');
		expect(isHttpError(await castVote(guest, 'Lake'), 404)).toBe(true);
		const e = await Promise.resolve(load(event(guest, postId) as unknown as LoadEvent)).catch(
			(e: unknown) => e
		);
		expect(isHttpError(e, 404)).toBe(true);
	});

	it('refuses a poll with fewer than 2 or more than 10 options', async () => {
		const { author, projectId } = await world();
		const few = (await publishWithPoll(author, projectId, pollField('Only'))) as ActionFailure<{
			message: string;
		}>;
		expect(few.status).toBe(400);
		expect(few.data.message).toMatch(/between 2 and 10/);
		const eleven = Array.from({ length: 11 }, (_, i) => `Option ${i}`);
		const many = (await publishWithPoll(author, projectId, pollField(...eleven))) as ActionFailure<{
			message: string;
		}>;
		expect(many.status).toBe(400);
	});
});

describe('post versions', () => {
	type VersionsData = Exclude<Awaited<ReturnType<typeof loadVersions>>, void>;
	const versionsOf = async (who: SignedIn, postId: string) =>
		(await loadVersions(
			event(who, postId, '/versions') as unknown as Parameters<typeof loadVersions>[0]
		)) as VersionsData;
	const newVersion = (who: SignedIn, postId: string) =>
		Promise.resolve(
			actions.newVersion(event(who, postId) as unknown as Parameters<typeof actions.newVersion>[0])
		).catch((e: unknown) => e);

	it('makes v2 linked to v1, shows both on the versions page, and keeps v1 readable', async () => {
		const { env, person, author, postId, projectId } = await world();
		const bo = await person('Bo', 'member');
		const made = await newVersion(author, postId);
		if (!isRedirect(made))
			throw new Error(`expected a redirect to the new version, got ${String(made)}`);
		const v2 = made.location.split('/')[2];
		expect(made.location).toBe(`/posts/${v2}/edit`);

		const fromV1 = await versionsOf(bo, postId);
		const fromV2 = await versionsOf(bo, v2);
		expect(fromV1.versions.map((v: PostVersion) => [v.id, v.version])).toEqual([
			[postId, 1],
			[v2, 2]
		]);
		expect(fromV2.versions).toEqual(fromV1.versions);

		const v1Page = (await load(event(bo, postId) as unknown as LoadEvent)) as PostData;
		expect(v1Page.post.title).toBe('Plan');
		expect(JSON.stringify(v1Page.post.body)).toContain('The plan');
		expect((await feed(env, bo, { projectId })).items.map((p) => p.id)).toEqual([v2]);
	});

	it('lets only the author start a version, and only from the latest', async () => {
		const { person, author, postId } = await world();
		const bo = await person('Bo', 'member');
		expect(isHttpError(await newVersion(bo, postId), 403)).toBe(true);
		await newVersion(author, postId);
		expect(isHttpError(await newVersion(author, postId), 409)).toBe(true);
	});

	it('hides every version from someone who can’t see the post', async () => {
		const { person, author, postId } = await world();
		const made = await newVersion(author, postId);
		const v2 = (made as { location: string }).location.split('/')[2];
		const guest = await person('Gus', 'guest');
		for (const id of [postId, v2]) {
			const e = await Promise.resolve(versionsOf(guest, id)).catch((e: unknown) => e);
			expect(isHttpError(e, 404)).toBe(true);
		}
	});

	it('relinks the chain when a middle version is deleted', async () => {
		const { env, author, postId } = await world();
		const v2 = ((await newVersion(author, postId)) as { location: string }).location.split('/')[2];
		const v3 = ((await newVersion(author, v2)) as { location: string }).location.split('/')[2];
		const gone = await Promise.resolve(
			actions.delete(event(author, v2) as unknown as Parameters<typeof actions.delete>[0])
		).catch((e: unknown) => e);
		expect(isRedirect(gone)).toBe(true);
		expect((await listVersions(env, postId)).map((v) => v.id)).toEqual([postId, v3]);
	});
});
