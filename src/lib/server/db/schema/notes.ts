import { sqliteTable, text, integer, primaryKey, real } from 'drizzle-orm/sqlite-core';
import { users } from './core';
import { projects } from './posts';

// Mirrors migrations/0004_notes.sql, which also holds the search and cleanup triggers.

export const notePermissions = ['view', 'edit'] as const;
export type NotePermission = (typeof notePermissions)[number];
export const projectNotePermissions = ['none', ...notePermissions] as const;

export const notes = sqliteTable('notes', {
	id: text('id').primaryKey(),
	authorId: text('author_id')
		.notNull()
		.references(() => users.id),
	title: text('title').notNull(),
	body: text('body').notNull(),
	bodyText: text('body_text').notNull(),
	projectId: text('project_id').references(() => projects.id),
	projectPermission: text('project_permission', { enum: projectNotePermissions })
		.notNull()
		.default('none'),
	version: integer('version').notNull().default(1),
	createdAt: integer('created_at').notNull(),
	updatedAt: integer('updated_at').notNull(),
	updatedBy: text('updated_by')
		.notNull()
		.references(() => users.id),
	// From 0024_parity.sql: the latest of updated_at and its comments' created_at, kept by triggers.
	lastActivityAt: integer('last_activity_at').notNull().default(0),
	// From 0024_parity.sql: how many times the note was opened signed out.
	anonymousViews: integer('anonymous_views').notNull().default(0),
	// From 0024_parity.sql: set while the note is published to the web.
	publicToken: text('public_token'),
	// From 0024_parity.sql: the version its thumbnail in R2 shows; null until one is rendered.
	thumbnailVersion: integer('thumbnail_version')
});

export const noteShares = sqliteTable(
	'note_shares',
	{
		noteId: text('note_id')
			.notNull()
			.references(() => notes.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		permission: text('permission', { enum: notePermissions }).notNull(),
		createdAt: integer('created_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.noteId, t.userId] })]
);

export const noteComments = sqliteTable('note_comments', {
	id: text('id').primaryKey(),
	noteId: text('note_id')
		.notNull()
		.references(() => notes.id, { onDelete: 'cascade' }),
	parentId: text('parent_id'),
	authorId: text('author_id')
		.notNull()
		.references(() => users.id),
	body: text('body').notNull(),
	bodyText: text('body_text').notNull(),
	createdAt: integer('created_at').notNull(),
	editedAt: integer('edited_at'),
	// From 0024_parity.sql: a top-level comment's thread, resolved, and by whom.
	resolvedAt: integer('resolved_at'),
	resolvedBy: text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
	// From 0024_parity.sql: a comment pinned to a point on one of the note's images; x and y
	// are fractions 0–1.
	attachmentId: text('attachment_id').references(() => noteAttachments.id, {
		onDelete: 'cascade'
	}),
	x: real('x'),
	y: real('y')
});

/** From 0024_parity.sql: files uploaded into a note, stored in R2 under attachments/<id>. */
export const noteAttachments = sqliteTable('note_attachments', {
	id: text('id').primaryKey(),
	noteId: text('note_id')
		.notNull()
		.references(() => notes.id, { onDelete: 'cascade' }),
	uploadedBy: text('uploaded_by')
		.notNull()
		.references(() => users.id),
	name: text('name').notNull(),
	contentType: text('content_type').notNull(),
	size: integer('size').notNull(),
	createdAt: integer('created_at').notNull()
});

/** From 0024_parity.sql: who hears about a note's new comments: its author and commenters. */
export const noteSubscriptions = sqliteTable(
	'note_subscriptions',
	{
		noteId: text('note_id')
			.notNull()
			.references(() => notes.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.noteId, t.userId] })]
);

// From 0024_parity.sql: when each person last opened each note.
export const noteViews = sqliteTable(
	'note_views',
	{
		noteId: text('note_id')
			.notNull()
			.references(() => notes.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		viewedAt: integer('viewed_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.noteId, t.userId] })]
);

export const noteReactionSubjects = ['note', 'comment'] as const;
export type NoteReactionSubject = (typeof noteReactionSubjects)[number];

export const noteReactions = sqliteTable('note_reactions', {
	id: text('id').primaryKey(),
	subjectType: text('subject_type', { enum: noteReactionSubjects }).notNull(),
	subjectId: text('subject_id').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	emoji: text('emoji').notNull(),
	createdAt: integer('created_at').notNull()
});

export const noteEventKinds = ['project', 'title', 'pinned', 'unpinned', 'referenced'] as const;
export type NoteEventKind = (typeof noteEventKinds)[number];
export const noteRefTypes = ['post', 'note'] as const;
export type NoteRefType = (typeof noteRefTypes)[number];

/**
 * From 0024_parity.sql: what happened to a note, for its timeline. ref_id names a post or a
 * note, so it has no foreign key; triggers delete a reference with what made it.
 */
export const noteEvents = sqliteTable('note_events', {
	id: text('id').primaryKey(),
	noteId: text('note_id')
		.notNull()
		.references(() => notes.id, { onDelete: 'cascade' }),
	actorId: text('actor_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	kind: text('kind', { enum: noteEventKinds }).notNull(),
	projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
	title: text('title'),
	refType: text('ref_type', { enum: noteRefTypes }),
	refId: text('ref_id'),
	createdAt: integer('created_at').notNull()
});
