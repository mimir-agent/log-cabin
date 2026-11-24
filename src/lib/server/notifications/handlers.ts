import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db, schema } from '../db';
import { canSeeProject } from '../posts/access';
import { feedbackItemKey } from '../posts/feedback';
import { noteAccess, noteFacts } from '../notes/access';
import { docMentions } from '../../editor/doc';
import { notes as noteStrings } from '../../strings/notes';
import { notifications as noticeStrings } from '../../strings/notifications';
import type { ContentKind, DomainEventKind, JobMessage } from '../events';
import { readThreadNaming, threadNaming } from '../chat/threads';
import {
	notify,
	projectItemKey,
	reactionSource,
	reactionsItemKey,
	type NewNotification
} from './notify';
import type { Facts } from './summary';

export type HandlerFor<K extends DomainEventKind> = (
	env: Env,
	event: Extract<JobMessage, { kind: K }>
) => Promise<void>;

export type Handlers = { [K in DomainEventKind]?: HandlerFor<K> };

/** Of these people, the ones who can see the project, by the posts module's rule. */
async function whoCanSeeProject(env: Env, projectId: string, userIds: string[]): Promise<string[]> {
	if (userIds.length === 0) return [];
	const { members, projectMembers, projects } = schema;
	const project = await db(env)
		.select({ private: projects.private, archivedAt: projects.archivedAt })
		.from(projects)
		.where(eq(projects.id, projectId))
		.get();
	if (!project) throw new Error(`notifications: project ${projectId} not found`);
	const people = await db(env)
		.select({
			userId: members.userId,
			role: members.role,
			isMember: sql<number>`${projectMembers.userId} IS NOT NULL`
		})
		.from(members)
		.leftJoin(
			projectMembers,
			and(eq(projectMembers.userId, members.userId), eq(projectMembers.projectId, projectId))
		)
		.where(inArray(members.userId, userIds));
	return people
		.filter((person) => canSeeProject(person, { ...project, isMember: !!person.isMember }))
		.map((person) => person.userId);
}

/** Who is a member of a project. */
async function projectMemberIds(env: Env, projectId: string): Promise<string[]> {
	const { projectMembers } = schema;
	const rows = await db(env)
		.select({ userId: projectMembers.userId })
		.from(projectMembers)
		.where(eq(projectMembers.projectId, projectId));
	return rows.map((row) => row.userId);
}

/** Who follows a project: its members, and everyone who starred it. */
async function projectFollowers(env: Env, projectId: string): Promise<string[]> {
	const { projectFavorites, projectMembers } = schema;
	const rows = await db(env)
		.select({ userId: projectMembers.userId })
		.from(projectMembers)
		.where(eq(projectMembers.projectId, projectId))
		.union(
			db(env)
				.select({ userId: projectFavorites.userId })
				.from(projectFavorites)
				.where(eq(projectFavorites.projectId, projectId))
		);
	return rows.map((row) => row.userId);
}

/**
 * Who follows a post's comments: its author and commenters, unless they unsubscribed. The
 * triggers posts_subscribe_author and comments_subscribe_author (0023_notify2.sql) subscribe
 * them; setSubscribed is the only write from here.
 */
async function postSubscribers(env: Env, postId: string): Promise<string[]> {
	const { postSubscriptions } = schema;
	const rows = await db(env)
		.select({ userId: postSubscriptions.userId })
		.from(postSubscriptions)
		.where(eq(postSubscriptions.postId, postId));
	return rows.map((row) => row.userId);
}

// Content can be deleted between an event and its handling; its notifications went with it
// (notify.ts retract), so an event about a post, comment or note that is gone notifies nobody.

function loadPost(env: Env, postId: string) {
	const { posts } = schema;
	return db(env)
		.select({ projectId: posts.projectId, authorId: posts.authorId, title: posts.title })
		.from(posts)
		.where(eq(posts.id, postId))
		.get();
}

/** A comment with what notifying about it needs: its post, and its parent's author when a reply. */
function loadComment(env: Env, commentId: string) {
	const { comments, posts } = schema;
	const parent = alias(comments, 'parent');
	return db(env)
		.select({
			postId: comments.postId,
			authorId: comments.authorId,
			parentAuthorId: parent.authorId,
			projectId: posts.projectId,
			postTitle: posts.title,
			postAuthorId: posts.authorId
		})
		.from(comments)
		.innerJoin(posts, eq(posts.id, comments.postId))
		.leftJoin(parent, eq(parent.id, comments.parentId))
		.where(eq(comments.id, commentId))
		.get();
}

function loadNote(env: Env, noteId: string) {
	const { notes } = schema;
	return db(env)
		.select({ authorId: notes.authorId, title: notes.title })
		.from(notes)
		.where(eq(notes.id, noteId))
		.get();
}

/** A reaction's emoji, or undefined once it's been taken back. Chat reactions emit no event, so it's a note's or a post's. */
async function reactionEmoji(env: Env, subjectType: ContentKind, reactionId: string) {
	const table = subjectType === 'note' ? schema.noteReactions : schema.reactions;
	const row = await db(env)
		.select({ emoji: table.emoji })
		.from(table)
		.where(eq(table.id, reactionId))
		.get();
	return row?.emoji;
}

const postUrl = (postId: string) => `/posts/${postId}`;
const commentUrl = (postId: string, commentId: string) => `/posts/${postId}#comment-${commentId}`;
const projectUrl = (projectId: string) => `/projects/${projectId}`;

async function nameOf(env: Env, userId: string) {
	const { users } = schema;
	const user = await db(env)
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, userId))
		.get();
	return user!.name;
}

/** The title a sentence names: the item's own, or "<author>’s thread" or "’s doc" when it has none. */
async function titled(
	env: Env,
	title: string,
	authorId: string,
	untitled: (author: string) => string
) {
	return title || untitled(await nameOf(env, authorId));
}

const postTitled = (env: Env, post: { title: string; authorId: string }) =>
	titled(env, post.title, post.authorId, noticeStrings.summary.untitledPost);
const noteTitled = (env: Env, note: { title: string; authorId: string }) =>
	titled(env, note.title, note.authorId, noticeStrings.summary.untitledNote);

/** Projects are never deleted, so a project an event names is always there. */
async function loadProject(env: Env, projectId: string) {
	const { projects } = schema;
	const project = await db(env)
		.select({ name: projects.name, private: projects.private })
		.from(projects)
		.where(eq(projects.id, projectId))
		.get();
	if (!project) throw new Error(`notifications: project ${projectId} not found`);
	return project;
}

/** Tells those of `userIds` who can still see a project about a change to it. */
async function notifyAboutProject(
	env: Env,
	projectId: string,
	userIds: string[],
	notification: Pick<NewNotification, 'actorId' | 'source'> & {
		kind: 'project_archived' | 'project_renamed';
	}
) {
	const project = await loadProject(env, projectId);
	const visible = await whoCanSeeProject(env, projectId, userIds);
	await notify(env, visible, {
		...notification,
		itemKey: projectItemKey(projectId),
		title: project.name,
		facts: { about: notification.kind, channel: project },
		url: projectUrl(projectId)
	});
}

/**
 * Event kinds with no handler here are acked and logged as unhandled: post.updated,
 * member.invited (the invite email is sent where the invite is made) and call.started.
 */
export const notificationHandlers: Handlers = {
	async mention(env, event) {
		const notification = { actorId: event.authorId, kind: 'mention' as const };
		const source = `mention:${event.subjectType}:${event.subjectId}`;
		switch (event.subjectType) {
			case 'post': {
				const post = await loadPost(env, event.subjectId);
				if (!post) return;
				const visible = await whoCanSeeProject(env, post.projectId, [event.mentionedUserId]);
				await notify(env, visible, {
					...notification,
					itemKey: `post:${event.subjectId}`,
					title: post.title,
					facts: { about: 'mention', in: 'post', title: await postTitled(env, post) },
					url: postUrl(event.subjectId),
					source
				});
				return;
			}
			case 'comment': {
				const comment = await loadComment(env, event.subjectId);
				if (!comment) return;
				const visible = await whoCanSeeProject(env, comment.projectId, [event.mentionedUserId]);
				await notify(env, visible, {
					...notification,
					itemKey: `post:${comment.postId}`,
					title: comment.postTitle,
					facts: { about: 'mention', in: comment.parentAuthorId ? 'reply' : 'comment' },
					url: commentUrl(comment.postId, event.subjectId),
					source
				});
				return;
			}
			case 'note': {
				// The notes module emits a mention only for people the note is shared with.
				const note = await loadNote(env, event.subjectId);
				if (!note) return;
				await notify(env, [event.mentionedUserId], {
					...notification,
					itemKey: `note:${event.subjectId}`,
					title: note.title,
					facts: { about: 'mention', in: 'note', title: await noteTitled(env, note) },
					url: `/notes/${event.subjectId}`,
					source
				});
				return;
			}
			case 'message':
				// Everyone in the thread already gets message.created; a mention there adds nothing.
				return;
		}
	},

	async 'comment.created'(env, event) {
		const comment = await loadComment(env, event.commentId);
		if (!comment) return;
		const shared = {
			actorId: event.authorId,
			itemKey: `post:${comment.postId}`,
			title: comment.postTitle,
			url: commentUrl(comment.postId, event.commentId),
			source: `comment.created:${event.commentId}`
		};
		// Replies first: someone who wrote both the post and the parent comment is told once, as a reply.
		const subscribers = await postSubscribers(env, comment.postId);
		if (comment.parentAuthorId && subscribers.includes(comment.parentAuthorId)) {
			const visible = await whoCanSeeProject(env, comment.projectId, [comment.parentAuthorId]);
			await notify(env, visible, {
				...shared,
				kind: 'reply',
				facts: { about: 'reply', whose: 'yours' }
			});
		}
		const visible = await whoCanSeeProject(env, comment.projectId, subscribers);
		// Subscribers hear of a reply as one, to whoever's comment it answers.
		const facts: Facts = comment.parentAuthorId
			? {
					about: 'reply',
					whose:
						comment.parentAuthorId === event.authorId
							? 'theirs'
							: { author: await nameOf(env, comment.parentAuthorId) }
				}
			: {
					about: 'comment',
					title: await postTitled(env, { title: comment.postTitle, authorId: comment.postAuthorId })
				};
		await notify(env, visible, { ...shared, kind: 'comment', facts });
	},

	async 'comment.resolved'(env, event) {
		const notification = {
			actorId: event.resolvedBy,
			kind: 'comment_resolved' as const,
			facts: null,
			source: `comment.resolved:${event.commentId}`
		};
		if (event.subjectType === 'post') {
			const comment = await loadComment(env, event.commentId);
			if (!comment) return;
			const visible = await whoCanSeeProject(env, comment.projectId, [comment.authorId]);
			await notify(env, visible, {
				...notification,
				itemKey: `post:${comment.postId}`,
				title: comment.postTitle,
				url: commentUrl(comment.postId, event.commentId)
			});
			return;
		}
		const { members, noteComments, notes } = schema;
		const found = await db(env)
			.select({ note: notes, authorId: noteComments.authorId, role: members.role })
			.from(noteComments)
			.innerJoin(notes, eq(notes.id, noteComments.noteId))
			.innerJoin(members, eq(members.userId, noteComments.authorId))
			.where(eq(noteComments.id, event.commentId))
			.get();
		if (!found) return;
		const author = { userId: found.authorId, role: found.role };
		if (noteAccess(await noteFacts(env, found.note, author)) === 'none') return;
		await notify(env, [found.authorId], {
			...notification,
			itemKey: `note:${found.note.id}`,
			title: found.note.title || noteStrings.editor.titlePlaceholder,
			url: `/notes/${found.note.id}#comment-${event.commentId}`
		});
	},

	async 'post.resolved'(env, event) {
		const post = await loadPost(env, event.postId);
		if (!post) return;
		const title = await postTitled(env, post);
		const shared = {
			actorId: event.resolvedBy,
			itemKey: `post:${event.postId}`,
			title: post.title,
			url: postUrl(event.postId),
			source: `post.resolved:${event.postId}:${event.resolvedAt}`
		};
		// The comment's author hears that their comment resolved it; the others, only that it is.
		const comment = event.commentId && (await loadComment(env, event.commentId));
		const fromComment = comment
			? await whoCanSeeProject(env, post.projectId, [comment.authorId])
			: [];
		await notify(env, fromComment, {
			...shared,
			kind: 'post_resolved_from_comment',
			facts: { about: 'post_resolved_from_comment', title }
		});
		const followers = await whoCanSeeProject(
			env,
			post.projectId,
			await postSubscribers(env, event.postId)
		);
		await notify(
			env,
			followers.filter((id) => !fromComment.includes(id)),
			{ ...shared, kind: 'post_resolved', facts: { about: 'post_resolved', title } }
		);
	},

	async 'post.created'(env, event) {
		const post = await loadPost(env, event.postId);
		if (!post) return;
		// Anyone asked for feedback on this post hears of that instead (feedback.requested).
		const { postFeedbackRequests: requests, projectSubscriptions: subscriptions } = schema;
		const asked = db(env)
			.select({ userId: requests.userId })
			.from(requests)
			.where(eq(requests.postId, event.postId));
		const subscribers = await db(env)
			.select({ userId: subscriptions.userId })
			.from(subscriptions)
			.where(
				and(eq(subscriptions.projectId, event.projectId), notInArray(subscriptions.userId, asked))
			);
		const visible = await whoCanSeeProject(
			env,
			event.projectId,
			subscribers.map((row) => row.userId)
		);
		await notify(env, visible, {
			actorId: event.authorId,
			kind: 'post',
			itemKey: `post:${event.postId}`,
			title: post.title,
			facts: { about: 'post', channel: await loadProject(env, event.projectId) },
			url: postUrl(event.postId),
			source: `post.created:${event.postId}`
		});
	},

	async 'note.shared'(env, event) {
		const note = await loadNote(env, event.noteId);
		if (!note) return;
		await notify(env, event.sharedWith, {
			actorId: event.authorId,
			kind: 'note',
			itemKey: `note:${event.noteId}`,
			title: note.title,
			facts: { about: 'note_shared', title: await noteTitled(env, note) },
			url: `/notes/${event.noteId}`,
			source: `note.shared:${event.noteId}`
		});
	},

	async 'note.commented'(env, event) {
		const { members, noteComments, noteSubscriptions, notes } = schema;
		const found = await db(env)
			.select({ note: notes, body: noteComments.body })
			.from(noteComments)
			.innerJoin(notes, eq(notes.id, noteComments.noteId))
			.where(eq(noteComments.id, event.commentId))
			.get();
		if (!found) return;
		// The people this comment mentions hear of it as a mention instead.
		const mentioned = new Set(docMentions(JSON.parse(found.body)));
		const subscribers = await db(env)
			.select({ userId: members.userId, role: members.role })
			.from(noteSubscriptions)
			.innerJoin(members, eq(members.userId, noteSubscriptions.userId))
			.where(and(eq(noteSubscriptions.noteId, event.noteId), isNull(members.deactivatedAt)));
		const recipients: string[] = [];
		for (const person of subscribers) {
			if (mentioned.has(person.userId)) continue;
			if (noteAccess(await noteFacts(env, found.note, person)) === 'none') continue;
			recipients.push(person.userId);
		}
		await notify(env, recipients, {
			actorId: event.authorId,
			kind: 'comment',
			itemKey: `note:${event.noteId}`,
			title: found.note.title || noteStrings.editor.titlePlaceholder,
			facts: { about: 'comment', title: await noteTitled(env, found.note) },
			url: `/notes/${event.noteId}#comment-${event.commentId}`,
			source: `note-comment:${event.commentId}`
		});
	},

	async 'message.created'(env, event) {
		const { messages, chatThreadMembers: m } = schema;
		const parent = alias(messages, 'parent');
		const message = await db(env)
			.select({
				body: messages.body,
				deletedAt: messages.deletedAt,
				replyToAuthorId: parent.authorId
			})
			.from(messages)
			.leftJoin(parent, eq(parent.id, messages.replyToId))
			.where(eq(messages.id, event.messageId))
			.get();
		// Deleted before the job ran, alone or with its whole thread: there's nothing to tell.
		if (!message || message.deletedAt !== null) return;
		const mentioned = new Set(docMentions(JSON.parse(message.body)));
		// Each member's level for this thread (Campsite's message.rb): "mentions" hears only a
		// mention of them or a reply to them, "none" nothing. Someone removed since has no row.
		const levels = new Map(
			(
				await db(env)
					.select({ userId: m.userId, level: m.notificationLevel })
					.from(m)
					.where(eq(m.threadId, event.threadId))
			).map((row) => [row.userId, row.level])
		);
		const hears = (userId: string) => {
			const level = levels.get(userId);
			if (level === 'mentions') return mentioned.has(userId) || message.replyToAuthorId === userId;
			return level === 'all';
		};
		for (const recipientId of event.recipientIds.filter(hears)) {
			// Each reader sees an untitled thread named by the other people in it.
			const row = await db(env).get<{ naming: string }>(
				sql`SELECT ${threadNaming(sql`${event.threadId}`, recipientId)} AS naming`
			);
			await notify(env, [recipientId], {
				actorId: event.authorId,
				kind: 'message',
				itemKey: `thread:${event.threadId}`,
				title: readThreadNaming(row!.naming).name,
				facts: null,
				url: `/chat/${event.threadId}`,
				source: `message.created:${event.messageId}`
			});
		}
	},

	async 'reaction.created'(env, event) {
		const notification = {
			actorId: event.authorId,
			kind: 'reaction' as const,
			itemKey: reactionsItemKey(event.subjectType, event.subjectId),
			source: reactionSource(event.reactionId)
		};
		// Taken back before the job ran: there is nothing to tell.
		const emoji = await reactionEmoji(env, event.subjectType, event.reactionId);
		if (emoji === undefined) return;
		switch (event.subjectType) {
			case 'post': {
				const post = await loadPost(env, event.subjectId);
				if (!post) return;
				const visible = await whoCanSeeProject(env, post.projectId, [post.authorId]);
				await notify(env, visible, {
					...notification,
					title: post.title,
					facts: { about: 'reaction', emoji, what: 'post' },
					url: postUrl(event.subjectId)
				});
				return;
			}
			case 'comment': {
				const comment = await loadComment(env, event.subjectId);
				if (!comment) return;
				const visible = await whoCanSeeProject(env, comment.projectId, [comment.authorId]);
				await notify(env, visible, {
					...notification,
					title: comment.postTitle,
					facts: { about: 'reaction', emoji, what: comment.parentAuthorId ? 'reply' : 'comment' },
					url: commentUrl(comment.postId, event.subjectId)
				});
				return;
			}
			case 'note': {
				const note = await loadNote(env, event.subjectId);
				if (!note) return;
				await notify(env, [note.authorId], {
					...notification,
					title: note.title,
					facts: { about: 'reaction', emoji, what: 'note' },
					url: `/notes/${event.subjectId}`
				});
				return;
			}
		}
	},

	async 'project.member_added'(env, event) {
		const project = await loadProject(env, event.projectId);
		await notify(env, [event.userId], {
			actorId: event.addedBy,
			kind: 'added_to_project',
			itemKey: projectItemKey(event.projectId),
			title: project.name,
			facts: { about: 'added_to_project', channel: project },
			url: projectUrl(event.projectId),
			source: `project.member_added:${event.projectId}:${event.userId}:${event.emittedAt}`
		});
	},

	async 'project.renamed'(env, event) {
		await notifyAboutProject(env, event.projectId, await projectFollowers(env, event.projectId), {
			actorId: event.renamedBy,
			kind: 'project_renamed',
			source: `project.renamed:${event.projectId}:${event.emittedAt}`
		});
	},

	async 'project.archived'(env, event) {
		await notifyAboutProject(env, event.projectId, await projectMemberIds(env, event.projectId), {
			actorId: event.archivedBy,
			kind: 'project_archived',
			source: `project.archived:${event.projectId}:${event.emittedAt}`
		});
	},

	async 'post.moved'(env, event) {
		const post = await loadPost(env, event.postId);
		// Moved on again since: the next move's event tells that project's followers.
		if (!post || post.projectId !== event.toProjectId) return;
		const visible = await whoCanSeeProject(
			env,
			post.projectId,
			await projectFollowers(env, post.projectId)
		);
		await notify(env, visible, {
			actorId: event.movedBy,
			kind: 'post_moved',
			itemKey: `post:${event.postId}`,
			title: post.title,
			facts: {
				about: 'post_moved',
				title: await postTitled(env, post),
				channel: await loadProject(env, post.projectId)
			},
			url: postUrl(event.postId),
			source: `post.moved:${event.postId}:${event.emittedAt}`
		});
	},

	async 'feedback.requested'(env, event) {
		const { postFeedbackRequests: requests, posts } = schema;
		const request = await db(env)
			.select({
				userId: requests.userId,
				requestedBy: requests.requestedBy,
				createdAt: requests.createdAt,
				dismissedAt: requests.dismissedAt,
				postId: posts.id,
				projectId: posts.projectId,
				title: posts.title
			})
			.from(requests)
			.innerJoin(posts, eq(posts.id, requests.postId))
			.where(eq(requests.id, event.requestId))
			.get();
		// Withdrawn, or dismissed, before the job ran: there is nothing left to tell them.
		if (!request || request.dismissedAt !== null) return;
		const visible = await whoCanSeeProject(env, request.projectId, [request.userId]);
		await notify(env, visible, {
			actorId: request.requestedBy,
			kind: 'feedback',
			itemKey: feedbackItemKey(event.requestId),
			title: request.title,
			facts: { about: 'feedback' },
			url: postUrl(request.postId),
			source: `feedback.requested:${event.requestId}:${request.createdAt}`
		});
	}
};
