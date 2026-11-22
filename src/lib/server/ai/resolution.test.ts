import { isHttpError, type ActionFailure } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { SignedIn } from '../auth/session';
import type { Role } from '../db/schema';
import { upsertDevMember } from '../dev-login';
import { suggestUsername } from '../people/usernames';
import { fakeD1 } from '../testing/fake-d1';
import { useTestEnv } from '../testing/env';
import { createPost, loadPost, parseBody, type BodyInput } from '../posts/posts';
import { createComment } from '../posts/comments';
import { createProject } from '../posts/projects';
import { posts } from '../../strings/posts';
import { actions as postActions } from '../../../routes/posts/[id]/+page.server';
import { CHECK_MODEL, SUMMARY_MODEL } from './grounded';
import { SUMMARY_MIN_WORDS } from './summaries';

type ModelCall = { model: string; messages: { role: string; content: string }[] };
type Bullet = { text: string; cites: number[] };

/** Long enough that the thread is worth drafting from. */
const details = Array.from({ length: SUMMARY_MIN_WORDS }, (_, i) => `detail${i}`).join(' ');

function body(text: string) {
	const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
	return parseBody(JSON.stringify(doc)) as BodyInput;
}

/**
 * A deployment whose summary model answers with `bullets` and whose check model backs every point
 * except the ones in `unsupported`. It remembers what the summary model was asked.
 */
async function world(bullets: Bullet[], unsupported: string[] = []) {
	const { DB, sqlite } = fakeD1();
	const calls: ModelCall[] = [];
	const AI = {
		run: async (model: string, input: { messages: ModelCall['messages'] }) => {
			const reply = (json: unknown) => ({
				choices: [{ message: { content: JSON.stringify(json) } }]
			});
			if (model === CHECK_MODEL) {
				const points = [...input.messages[1].content.matchAll(/^Point (\d+): (.*)$/gm)];
				return reply({
					verdicts: points.map(([, n, text]) => ({
						point: Number(n),
						supported: !unsupported.includes(text)
					}))
				});
			}
			if (model !== SUMMARY_MODEL) throw new Error(`expected ${SUMMARY_MODEL}, got ${model}`);
			calls.push({ model, messages: input.messages });
			return reply({ bullets });
		}
	};
	const env = {
		DB,
		JOBS: { send: async () => {} },
		REALTIME: {
			idFromName: (topic: string) => topic,
			get: () => ({ fetch: async () => Response.json([]) })
		},
		AI
	} as unknown as Env;
	useTestEnv(env);
	sqlite.exec("INSERT INTO org (id, name, created_at) VALUES (1, 'Campfire', 0)");
	const person = async (name: string, role: Role): Promise<SignedIn> => {
		const email = `${name.toLowerCase()}@example.com`;
		const id = await upsertDevMember(env, { email, name, role });
		return {
			user: { id, name, username: suggestUsername(name), email, avatarUrl: null, theme: 'system' },
			member: { id: `m-${id}`, role }
		};
	};
	return { env, calls, person };
}

function draftAs(who: SignedIn, postId: string) {
	const url = new URL(`https://campfire.test/posts/${postId}?/draft`);
	const event = {
		request: new Request(url, { method: 'POST', body: new FormData() }),
		params: { id: postId },
		locals: { user: who.user, member: who.member },
		depends: () => {},
		url
	};
	return postActions.draft(event as never);
}

describe('the AI-drafted resolution', () => {
	it('is written from the post and the comments the resolver can read, and from nothing else', async () => {
		const w = await world([{ text: 'Morgan will price tents', cites: [3] }]);
		const ada = await w.person('Ada', 'member');
		const morgan = await w.person('Morgan', 'member');
		const camping = await createProject(w.env, ada, {
			name: 'Camping',
			description: '',
			private: false
		});
		const secret = await createProject(w.env, ada, {
			name: 'Budget',
			description: '',
			private: true
		});
		const postId = await createPost(w.env, ada, camping, {
			title: 'Gear costs',
			...body(`Pick the tents. ${details}`)
		});
		const post = await loadPost(w.env, ada, postId);
		await createComment(w.env, morgan, post, body('I will price tents.'), null);
		const hiddenId = await createPost(w.env, ada, secret, {
			title: 'Salaries',
			...body('The hiddenfigure is 123.')
		});
		await createComment(
			w.env,
			ada,
			await loadPost(w.env, ada, hiddenId),
			body('hiddencomment'),
			null
		);

		const result = (await draftAs(morgan, postId)) as { draft: unknown };

		expect(w.calls).toHaveLength(1);
		const prompt = w.calls[0].messages.find((m) => m.role === 'user')!.content;
		expect(prompt.split('\n')).toEqual([
			'[1] title, Ada: Gear costs',
			'[2] thread, Ada: Pick the tents.',
			`[3] thread, Ada: ${details}`,
			'[4] comment 1, Morgan: I will price tents.'
		]);
		expect(result.draft).toEqual({
			type: 'doc',
			content: [
				{
					type: 'bulletList',
					content: [
						{
							type: 'listItem',
							content: [
								{ type: 'paragraph', content: [{ type: 'text', text: 'Morgan will price tents' }] }
							]
						}
					]
				}
			]
		});
	});

	it('is refused, without asking the model, to someone who cannot read the post', async () => {
		const w = await world([]);
		const ada = await w.person('Ada', 'member');
		const cy = await w.person('Cy', 'guest');
		const secret = await createProject(w.env, ada, {
			name: 'Budget',
			description: '',
			private: true
		});
		const postId = await createPost(w.env, ada, secret, { title: 'Salaries', ...body(details) });

		await expect(draftAs(cy, postId)).rejects.toSatisfy((e) => isHttpError(e) && e.status === 404);
		expect(w.calls).toHaveLength(0);
	});

	it('drops a point the thread does not support, and says so when none is left', async () => {
		const invented = 'Marketing signed off on the new date';
		const w = await world([{ text: invented, cites: [2] }], [invented]);
		const ada = await w.person('Ada', 'member');
		const camping = await createProject(w.env, ada, {
			name: 'Camping',
			description: '',
			private: false
		});
		const postId = await createPost(w.env, ada, camping, {
			title: 'Gear costs',
			...body(`Pick the tents. ${details}`)
		});

		const result = (await draftAs(ada, postId)) as ActionFailure<{ message: string }>;

		expect(result.status).toBe(502);
		expect(result.data.message).toBe(posts.resolve.draftEmpty);
	});

	it('says there is too little to draft from, without asking the model', async () => {
		const w = await world([]);
		const ada = await w.person('Ada', 'member');
		const camping = await createProject(w.env, ada, {
			name: 'Camping',
			description: '',
			private: false
		});
		const postId = await createPost(w.env, ada, camping, { title: 'Gear', ...body('Pick tents.') });

		const result = (await draftAs(ada, postId)) as ActionFailure<{ message: string }>;

		expect(result.status).toBe(400);
		expect(result.data.message).toBe(posts.resolve.draftTooShort);
		expect(w.calls).toHaveLength(0);
	});
});
