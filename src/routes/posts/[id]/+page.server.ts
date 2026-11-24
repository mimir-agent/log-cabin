import { messageSource } from '#lib/server/posts/from-message.js';
import { fail, redirect } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { clientId } from '#lib/server/id.js';
import { canWriteInProject } from '#lib/server/posts/access.js';
import {
	deletePost,
	loadPost,
	parseBody,
	parseResolution,
	resolvePost,
	unresolvePost
} from '#lib/server/posts/posts.js';
import {
	createComment,
	deleteComment,
	listComments,
	setCommentResolved,
	updateComment
} from '#lib/server/posts/comments.js';
import { reactionSummaries, toggleReaction } from '#lib/server/posts/reactions.js';
import { pinComment } from '#lib/server/posts/canvas.js';
import { parseTick, tickTask } from '#lib/server/posts/tasks.js';
import { loadPoll, vote } from '#lib/server/posts/polls.js';
import { createVersion, listVersions } from '#lib/server/posts/versions.js';
import { mentionablePeople } from '#lib/server/posts/projects.js';
import {
	dismissFeedbackRequest,
	feedbackCandidates,
	listFeedbackRequests,
	requestFeedback,
	withdrawFeedbackRequest
} from '#lib/server/posts/feedback.js';
import { pinState } from '#lib/server/posts/pins.js';
import { isSubscribed, setSubscribed } from '#lib/server/posts/subscriptions.js';
import { canMovePost, movePost, moveTargets, visiblePostMoves } from '#lib/server/posts/moves.js';
import { canSharePublicly, setPublicLink } from '#lib/server/posts/public-links.js';
import { getOrg } from '#lib/server/org.js';
import { viewerFollowUps } from '#lib/server/follow-ups.js';
import { draftResolution } from '#lib/server/ai/resolution.js';
import { postUnits, summarizePost, summaryOffer } from '#lib/server/ai/summaries.js';
import { docResources, type DocNode } from '#lib/editor/doc.js';
import { makeDocFromPost } from '#lib/server/notes/from-post.js';
import { resolve } from '$app/paths';
import { resourceTitles } from '#lib/server/search/resources.js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = async (event) => {
	const env = getEnv();
	const who = requireMember(event);
	const post = await loadPost(env, who, event.params.id);
	const isAuthor = post.authorId === who.user.id;
	const body = JSON.parse(post.body) as DocNode;
	const resolvedBody = post.resolvedBody ? (JSON.parse(post.resolvedBody) as DocNode) : null;
	// loadPost is the access check. The reads that need only the post run at once, then the one
	// that needs the comment ids.
	const [
		comments,
		reactions,
		people,
		org,
		feedback,
		candidates,
		poll,
		versions,
		pin,
		moves,
		targets,
		units,
		subscribed,
		source
	] = await Promise.all([
		listComments(env, post.id),
		reactionSummaries(env, who.user.id, post.id),
		mentionablePeople(env, who, post.projectId),
		getOrg(env),
		listFeedbackRequests(env, post.id),
		isAuthor ? feedbackCandidates(env, post) : [],
		loadPoll(env, who.user.id, post.id),
		listVersions(env, post.id),
		pinState(env, who, post.projectId, { type: 'post', id: post.id }),
		visiblePostMoves(env, who, post.id),
		canMovePost(who, post) ? moveTargets(env, who, post) : null,
		postUnits(env, post),
		isSubscribed(env, who, post),
		messageSource(env, who, post)
	]);
	const commentIds = comments.flatMap((c) => [c.id, ...c.replies.map((r) => r.id)]);
	// One lookup for every mention on the page: the body and each comment and reply.
	const commentDocs = comments
		.flatMap((c) => [c, ...c.replies])
		.map((c) => JSON.parse(c.body) as DocNode);
	const [followUps, resources] = await Promise.all([
		viewerFollowUps(env, who.user.id, [post.id, ...commentIds]),
		resourceTitles(
			env,
			who,
			[body, ...(resolvedBody ? [resolvedBody] : []), ...commentDocs].flatMap(docResources)
		)
	]);
	return {
		post: { ...post, body, resolvedBody },
		resources,
		resolverName: people.find((p) => p.id === post.resolvedBy)?.name ?? null,
		source,
		comments,
		reactions,
		people: people.map(({ id, name }) => ({ id, name })),
		poll,
		versions,
		viewerId: who.user.id,
		canWrite: canWriteInProject(who.member, post.project),
		isAuthor,
		canMakeDoc: who.member.role !== 'viewer',
		isAdmin: who.member.role === 'admin',
		pin,
		moves,
		moveTargets: targets,
		// null hides the switch: not this member's to share, or the org has public links off.
		publicLink:
			org.publicPosts && canSharePublicly(who, post)
				? { url: post.publicToken && new URL(`/p/${post.publicToken}`, event.url).href }
				: null,
		summaries: summaryOffer(env, org, units),
		feedback,
		feedbackCandidates: candidates,
		feedbackAskingMe: feedback.find((r) => r.userId === who.user.id && r.status === 'waiting'),
		followUps,
		subscribed
	};
};

async function postAction(event: RequestEvent) {
	const env = getEnv();
	const who = requireMember(event);
	const post = await loadPost(env, who, event.params.id);
	const form = Object.fromEntries(await event.request.formData()) as Record<string, string>;
	return { env, who, post, form };
}

export const actions: Actions = {
	// Only ever the signed-in person's own subscription: nothing in the form names anyone.
	subscribe: async (event) => {
		const { env, who, post } = await postAction(event);
		await setSubscribed(env, who, post, true);
	},
	unsubscribe: async (event) => {
		const { env, who, post } = await postAction(event);
		await setSubscribed(env, who, post, false);
	},
	comment: async (event) => {
		const { env, who, post, form } = await postAction(event);
		const body = parseBody(form.body);
		if ('message' in body) return fail(400, { message: body.message });
		await createComment(env, who, post, body, form.replyTo || null, Date.now(), clientId(form.id));
	},
	editComment: async (event) => {
		const { env, who, post, form } = await postAction(event);
		const body = parseBody(form.body);
		if ('message' in body) return fail(400, { message: body.message });
		await updateComment(env, who, post, form.commentId, body);
	},
	deleteComment: async (event) => {
		const { env, who, post, form } = await postAction(event);
		await deleteComment(env, who, post, form.commentId);
	},
	react: async (event) => {
		const { env, who, post, form } = await postAction(event);
		const type = form.subjectType === 'comment' ? 'comment' : 'post';
		await toggleReaction(env, who, post, { type, id: form.subjectId }, form.emoji);
	},
	newVersion: async (event) => {
		const { env, who, post } = await postAction(event);
		const id = await createVersion(env, who, post);
		redirect(303, `/posts/${id}/edit`);
	},
	vote: async (event) => {
		const { env, who, post, form } = await postAction(event);
		await vote(env, who, post, form.optionId);
	},
	tick: async (event) => {
		const { env, who, post, form } = await postAction(event);
		const tick = parseTick(form);
		if ('message' in tick) return fail(400, { message: tick.message });
		await tickTask(env, who, post, tick);
	},
	resolveComment: async (event) => {
		const { env, who, post, form } = await postAction(event);
		await setCommentResolved(env, who, post, form.commentId, true);
	},
	unresolveComment: async (event) => {
		const { env, who, post, form } = await postAction(event);
		await setCommentResolved(env, who, post, form.commentId, false);
	},
	resolve: async (event) => {
		const { env, who, post, form } = await postAction(event);
		const parsed = parseResolution(form.resolution);
		if ('message' in parsed) return fail(400, { message: parsed.message });
		await resolvePost(env, who, post, form.commentId || null, parsed.resolution);
	},
	unresolve: async (event) => {
		const { env, who, post } = await postAction(event);
		await unresolvePost(env, who, post);
	},
	summarize: async (event) => {
		const { env, post } = await postAction(event);
		const result = await summarizePost(env, post);
		return 'error' in result ? fail(502, { summaryError: result.error }) : result;
	},
	draft: async (event) => {
		const { env, post } = await postAction(event);
		const result = await draftResolution(env, post);
		return 'doc' in result
			? { draft: result.doc }
			: fail(result.status, { message: result.message });
	},
	move: async (event) => {
		const { env, who, post, form } = await postAction(event);
		await movePost(env, who, post, form.projectId);
	},
	publicLink: async (event) => {
		const { env, who, post, form } = await postAction(event);
		await setPublicLink(env, who, post, form.on === 'true');
	},
	delete: async (event) => {
		const { env, who, post } = await postAction(event);
		await deletePost(env, who, post);
		redirect(303, `/projects/${post.projectId}`);
	},
	makeDoc: async (event) => {
		const { env, who, post } = await postAction(event);
		const id = await makeDocFromPost(env, who, post);
		redirect(303, `${resolve('/notes/[id]', { id })}?focus=end`);
	},
	requestFeedback: async (event) => {
		const env = getEnv();
		const who = requireMember(event);
		const post = await loadPost(env, who, event.params.id);
		const people = (await event.request.formData()).getAll('person').map(String);
		await requestFeedback(env, who, post, people);
	},
	withdrawFeedback: async (event) => {
		const { env, who, post, form } = await postAction(event);
		await withdrawFeedbackRequest(env, who, post, form.requestId);
	},
	dismissFeedback: async (event) => {
		const { env, who, form } = await postAction(event);
		await dismissFeedbackRequest(env, who.user.id, form.requestId);
	},
	pin: async (event) => {
		const { env, who, post, form } = await postAction(event);
		const body = parseBody(form.body);
		if ('message' in body) return fail(400, { message: body.message });
		const pin = { attachmentId: form.attachmentId, x: Number(form.x), y: Number(form.y) };
		await pinComment(env, who, post, pin, body);
	}
};
