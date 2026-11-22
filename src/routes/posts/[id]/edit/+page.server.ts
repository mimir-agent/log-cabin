import { error, fail, redirect } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { loadPost, updatePost, validatePostInput } from '#lib/server/posts/posts.js';
import { mentionablePeople } from '#lib/server/posts/projects.js';
import { loadPoll } from '#lib/server/posts/polls.js';
import type { DocNode } from '#lib/editor/doc.js';
import { posts } from '#lib/strings/posts.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const env = getEnv();
	const who = requireMember(event);
	const post = await loadPost(env, who, event.params.id);
	if (post.authorId !== who.user.id) error(403, posts.errors.notYourPost);
	const people = await mentionablePeople(env, who, post.projectId);
	const poll = await loadPoll(env, who.user.id, post.id);
	return {
		post: {
			id: post.id,
			projectId: post.projectId,
			projectName: post.project.name,
			title: post.title,
			body: JSON.parse(post.body) as DocNode
		},
		poll: poll && {
			question: poll.question,
			options: poll.options.map(({ id, description }) => ({ id, description }))
		},
		people: people.map(({ id, name }) => ({ id, name }))
	};
};

export const actions: Actions = {
	default: async (event) => {
		const env = getEnv();
		const who = requireMember(event);
		const post = await loadPost(env, who, event.params.id);
		const form = Object.fromEntries(await event.request.formData());
		const result = validatePostInput(form);
		if (!result.ok) return fail(400, { message: result.message, title: String(form.title ?? '') });
		await updatePost(env, who, post, result.input);
		redirect(303, `/posts/${post.id}`);
	}
};
