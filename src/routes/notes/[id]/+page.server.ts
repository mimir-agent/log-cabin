import { fail, redirect } from '@sveltejs/kit';
import { getEnv } from '#lib/server/platform.js';
import { requireMember } from '#lib/server/auth/guard.js';
import { clientId } from '#lib/server/id.js';
import { canDiscussNote, loadNote } from '#lib/server/notes/access.js';
import {
	canDeleteNote,
	deleteNote,
	listShares,
	noteMentionCandidates,
	noteProject,
	renameNote,
	setProjectShare,
	shareWithPeople,
	unshareWithPerson
} from '#lib/server/notes/notes.js';
import {
	anchorNoteComment,
	createNoteComment,
	deleteNoteComment,
	listNoteComments,
	noteReactionSummaries,
	pinNoteComment,
	setNoteCommentResolved,
	tickNoteComment,
	toggleNoteReaction,
	updateNoteComment,
	type CommentAnchor
} from '#lib/server/notes/discussion.js';
import { noteViewers, recordNoteView } from '#lib/server/notes/views.js';
import { listNoteEvents } from '#lib/server/notes/timeline.js';
import { setNotePublic } from '#lib/server/notes/public.js';
import { parseBody } from '#lib/server/posts/posts.js';
import { parseTick } from '#lib/server/posts/tasks.js';
import { posts as postStrings } from '#lib/strings/posts.js';
import { listProjects, orgPeople } from '#lib/server/posts/projects.js';
import { pinState } from '#lib/server/posts/pins.js';
import { getOrg } from '#lib/server/org.js';
import { viewerFollowUps } from '#lib/server/follow-ups.js';
import { noteUnits, summarizeNote, summaryOffer } from '#lib/server/ai/summaries.js';
import { notePermissions, type NotePermission } from '#lib/server/db/schema/index.js';
import type { SignedIn } from '#lib/server/auth/session.js';
import { docResources, type DocNode } from '#lib/editor/doc.js';
import { resourceTitles } from '#lib/server/search/resources.js';
import { cursorHue } from '#lib/notes/live.js';
import { notes } from '#lib/strings/notes.js';
import { favoriteIds } from '#lib/server/favorites.js';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

export const load: PageServerLoad = async (event) => {
	const env = getEnv();
	const who = requireMember(event);
	const note = await loadNote(env, who, event.params.id);
	const isAuthor = note.authorId === who.user.id;
	const body = JSON.parse(note.body) as DocNode;
	// loadNote is the access check; the reads after it are independent, so they run at once.
	// The last entry records this visit and reads the note's inbox items; it returns nothing.
	const [
		discussion,
		timeline,
		reactions,
		people,
		project,
		sharing,
		pin,
		org,
		followUps,
		units,
		viewers,
		favorites
	] = await Promise.all([
		commentsAndResources(env, who, note.id, body),
		listNoteEvents(env, who, note.id),
		noteReactionSummaries(env, who.user.id, note.id),
		noteMentionCandidates(env, who, note.projectId),
		noteProject(env, who, note),
		note.access === 'edit' ? sharingPanel(env, who, note) : null,
		pinState(env, who, note.projectPermission === 'none' ? null : note.projectId, {
			type: 'note',
			id: note.id
		}),
		getOrg(env),
		viewerFollowUps(env, who.user.id, [note.id]),
		noteUnits(env, note),
		noteViewers(env, who, note),
		favoriteIds(env, who, 'note'),
		recordNoteView(env, who, note)
	]);
	const { comments, resources } = discussion;
	return {
		note: { ...note, body },
		resources,
		project,
		live: {
			canWrite: note.access === 'edit',
			user: { id: who.user.id, name: who.user.name, hue: cursorHue(who.user.id) }
		},
		comments,
		timeline,
		reactions,
		people: people.map(({ id, name }) => ({ id, name })),
		viewerId: who.user.id,
		isAuthor,
		canDelete: canDeleteNote(who, note),
		isAdmin: who.member.role === 'admin',
		canDiscuss: canDiscussNote(who),
		sharing,
		pin,
		summaries: summaryOffer(env, org, units),
		followUps,
		viewers,
		// Signed out the URL only works while the org allows public links, so it's null without.
		publicUrl:
			note.publicToken && org.publicPosts
				? new URL(`/p/notes/${note.publicToken}`, event.url).href
				: null,
		publicLinks: org.publicPosts,
		favorite: favorites.has(note.id)
	};
};

/**
 * The note's comments with the titles of everything the body and the comments mention, in one
 * lookup, so the comments' own read and the other page reads overlap.
 */
async function commentsAndResources(env: Env, who: SignedIn, noteId: string, body: DocNode) {
	const comments = await listNoteComments(env, noteId);
	const commentDocs = comments
		.flatMap((comment) => [comment, ...comment.replies])
		.map((comment) => JSON.parse(comment.body) as DocNode);
	const resources = await resourceTitles(env, who, [body, ...commentDocs].flatMap(docResources));
	return { comments, resources };
}

/** What an editor's sharing panel offers: guests share only with their projects. */
async function sharingPanel(env: Env, who: SignedIn, note: { id: string; authorId: string }) {
	const [shares, people, projects] = await Promise.all([
		listShares(env, note.id),
		who.member.role === 'guest' ? [] : orgPeople(env),
		listProjects(env, who, false)
	]);
	const taken = new Set([who.user.id, note.authorId, ...shares.map((s) => s.userId)]);
	const candidates = people.filter((p) => !taken.has(p.id));
	return {
		shares,
		candidates: candidates.map(({ id, name }) => ({ id, name })),
		projects: projects.map(({ id, name }) => ({ id, name })),
		canShareWithPeople: who.member.role !== 'guest'
	};
}

async function noteAction(event: RequestEvent) {
	const env = getEnv();
	const who = requireMember(event);
	const note = await loadNote(env, who, event.params.id);
	const data = await event.request.formData();
	const form = Object.fromEntries(data) as Record<string, string>;
	return { env, who, note, form, data };
}

/** An encoded relative position: base64, about 10 bytes, never more than a few dozen. */
const encodedPosition = /^[A-Za-z0-9+/]{1,256}={0,2}$/;

/** A new comment's passage, from its form's anchorStart and anchorEnd; none without either. */
function anchorOf(form: Record<string, string>): CommentAnchor | null | 'invalid' {
	const { anchorStart: start = '', anchorEnd: end = '' } = form;
	if (!start && !end) return null;
	return encodedPosition.test(start) && encodedPosition.test(end) ? { start, end } : 'invalid';
}

function permissionOf(value: string): NotePermission | null {
	return notePermissions.find((p) => p === value) ?? null;
}

export const actions: Actions = {
	rename: async (event) => {
		const { env, who, note, form } = await noteAction(event);
		await renameNote(env, who, note, String(form.title ?? '').trim());
	},
	comment: async (event) => {
		const { env, who, note, form } = await noteAction(event);
		const body = parseBody(form.body);
		if ('message' in body) return fail(400, { message: body.message });
		const anchor = anchorOf(form);
		if (anchor === 'invalid') return fail(400, { message: notes.errors.anchorInvalid });
		if (anchor && form.replyTo) return fail(400, { message: notes.errors.anchorOnReply });
		const id = await createNoteComment(
			env,
			who,
			note,
			body,
			form.replyTo || null,
			Date.now(),
			clientId(form.id)
		);
		if (anchor) await anchorNoteComment(env, who, note, id, anchor);
	},
	editComment: async (event) => {
		const { env, who, note, form } = await noteAction(event);
		const body = parseBody(form.body);
		if ('message' in body) return fail(400, { message: body.message });
		await updateNoteComment(env, who, note, form.commentId, body);
	},
	deleteComment: async (event) => {
		const { env, who, note, form } = await noteAction(event);
		await deleteNoteComment(env, who, note, form.commentId);
	},
	resolveComment: async (event) => {
		const { env, who, note, form } = await noteAction(event);
		await setNoteCommentResolved(env, who, note, form.commentId, true);
	},
	unresolveComment: async (event) => {
		const { env, who, note, form } = await noteAction(event);
		await setNoteCommentResolved(env, who, note, form.commentId, false);
	},
	tick: async (event) => {
		const { env, who, note, form } = await noteAction(event);
		const tick = parseTick(form);
		if ('message' in tick || tick.subject !== 'comment') {
			return fail(400, { message: postStrings.errors.tickInvalid });
		}
		await tickNoteComment(env, who, note, tick.id, tick.index, tick.checked);
	},
	react: async (event) => {
		const { env, who, note, form } = await noteAction(event);
		const type = form.subjectType === 'comment' ? 'comment' : 'note';
		await toggleNoteReaction(env, who, note, { type, id: form.subjectId }, form.emoji);
	},
	share: async (event) => {
		const { env, who, note, form, data } = await noteAction(event);
		const permission = permissionOf(form.permission);
		if (!permission) return fail(400, { message: notes.errors.permissionInvalid });
		await shareWithPeople(env, who, note, data.getAll('userId').map(String), permission);
	},
	unshare: async (event) => {
		const { env, who, note, form } = await noteAction(event);
		await unshareWithPerson(env, who, note, form.userId);
	},
	shareProject: async (event) => {
		const { env, who, note, form } = await noteAction(event);
		const permission = permissionOf(form.permission);
		const share = form.projectId && permission ? { projectId: form.projectId, permission } : null;
		await setProjectShare(env, who, note, share);
	},
	publish: async (event) => {
		const { env, note, form } = await noteAction(event);
		await setNotePublic(env, note, form.on === '1');
	},
	summarize: async (event) => {
		const { env, note } = await noteAction(event);
		const result = await summarizeNote(env, note);
		return 'error' in result ? fail(502, { summaryError: result.error }) : result;
	},
	delete: async (event) => {
		const { env, who, note } = await noteAction(event);
		await deleteNote(env, who, note);
		redirect(303, '/notes');
	},
	pin: async (event) => {
		const { env, who, note, form } = await noteAction(event);
		const body = parseBody(form.body);
		if ('message' in body) return fail(400, { message: body.message });
		const pin = { attachmentId: form.attachmentId, x: Number(form.x), y: Number(form.y) };
		await pinNoteComment(env, who, note, pin, body);
	}
};
