import { sqliteTable, text, integer, primaryKey, real } from 'drizzle-orm/sqlite-core';
import { users } from './core';
import { chatThreads } from './chat';

// Mirrors migrations/0003_posts.sql, which also holds the search and cleanup triggers.

export const projects = sqliteTable('projects', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description').notNull().default(''),
	private: integer('private', { mode: 'boolean' }).notNull().default(false),
	archivedAt: integer('archived_at'),
	createdBy: text('created_by')
		.notNull()
		.references(() => users.id),
	createdAt: integer('created_at').notNull(),
	coverKey: text('cover_key'),
	accessory: text('accessory')
});

export const projectMembers = sqliteTable(
	'project_members',
	{
		projectId: text('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.projectId, t.userId] })]
);

export const projectFavorites = sqliteTable(
	'project_favorites',
	{
		projectId: text('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.projectId, t.userId] })]
);

export const posts = sqliteTable('posts', {
	id: text('id').primaryKey(),
	projectId: text('project_id')
		.notNull()
		.references(() => projects.id, { onDelete: 'cascade' }),
	authorId: text('author_id')
		.notNull()
		.references(() => users.id),
	title: text('title').notNull(),
	body: text('body').notNull(),
	bodyText: text('body_text').notNull(),
	createdAt: integer('created_at').notNull(),
	editedAt: integer('edited_at'),
	lastActivityAt: integer('last_activity_at').notNull(),
	resolvedAt: integer('resolved_at'),
	resolvedBy: text('resolved_by').references(() => users.id),
	resolvedCommentId: text('resolved_comment_id'),
	// 0037_post_resolved.sql: what the resolver wrote, a document like body. Null when nothing was written.
	resolvedBody: text('resolved_body'),
	// 0020_posts2.sql: the version before this one, and this one's number in its chain.
	parentId: text('parent_id'),
	version: integer('version').notNull().default(1),
	// Added by 0022_posts4.sql: set while the post has a public link.
	publicToken: text('public_token'),
	// 0026_chat2.sql: the chat message this post was started from.
	fromMessageId: text('from_message_id')
});

export const comments = sqliteTable('comments', {
	id: text('id').primaryKey(),
	postId: text('post_id')
		.notNull()
		.references(() => posts.id, { onDelete: 'cascade' }),
	parentId: text('parent_id'),
	authorId: text('author_id')
		.notNull()
		.references(() => users.id),
	body: text('body').notNull(),
	bodyText: text('body_text').notNull(),
	createdAt: integer('created_at').notNull(),
	editedAt: integer('edited_at'),
	// From 0035_comment_resolved.sql: a top-level comment's thread, resolved, and by whom.
	resolvedAt: integer('resolved_at'),
	resolvedBy: text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
	// A comment pinned to a point on an image (0021_posts3.sql): x and y are fractions 0–1.
	attachmentId: text('attachment_id'),
	x: real('x'),
	y: real('y')
});

export const reactionSubjects = ['post', 'comment'] as const;
export type ReactionSubject = (typeof reactionSubjects)[number];

export const reactions = sqliteTable('reactions', {
	id: text('id').primaryKey(),
	subjectType: text('subject_type', { enum: reactionSubjects }).notNull(),
	subjectId: text('subject_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	emoji: text('emoji').notNull(),
	createdAt: integer('created_at').notNull()
});

// Exactly one of projectId and threadId is set (0005_chat.sql rebuilt the table).
export const attachments = sqliteTable('attachments', {
	id: text('id').primaryKey(),
	projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
	threadId: text('thread_id').references(() => chatThreads.id, { onDelete: 'cascade' }),
	uploadedBy: text('uploaded_by')
		.notNull()
		.references(() => users.id),
	name: text('name').notNull(),
	contentType: text('content_type').notNull(),
	size: integer('size').notNull(),
	createdAt: integer('created_at').notNull()
});

// Mirrors migrations/0020_posts2.sql.

export const polls = sqliteTable('polls', {
	postId: text('post_id')
		.primaryKey()
		.references(() => posts.id, { onDelete: 'cascade' }),
	question: text('question').notNull().default(''),
	createdAt: integer('created_at').notNull()
});

export const pollOptions = sqliteTable('poll_options', {
	id: text('id').primaryKey(),
	postId: text('post_id')
		.notNull()
		.references(() => polls.postId, { onDelete: 'cascade' }),
	position: integer('position').notNull(),
	description: text('description').notNull()
});

export const pollVotes = sqliteTable(
	'poll_votes',
	{
		postId: text('post_id')
			.notNull()
			.references(() => polls.postId, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		optionId: text('option_id')
			.notNull()
			.references(() => pollOptions.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.postId, t.userId] })]
);

export const postDrafts = sqliteTable('post_drafts', {
	id: text('id').primaryKey(),
	authorId: text('author_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	projectId: text('project_id')
		.notNull()
		.references(() => projects.id, { onDelete: 'cascade' }),
	title: text('title').notNull().default(''),
	body: text('body').notNull(),
	poll: text('poll'),
	createdAt: integer('created_at').notNull(),
	updatedAt: integer('updated_at').notNull()
});

/** Who hears about new comments on a post (0023_notify2.sql, whose triggers subscribe authors). */
export const postSubscriptions = sqliteTable(
	'post_subscriptions',
	{
		postId: text('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.postId, t.userId] })]
);
