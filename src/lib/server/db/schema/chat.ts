import {
	sqliteTable,
	text,
	integer,
	primaryKey,
	type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core';
import { users } from './core';

// Mirrors migrations/0005_chat.sql, which also holds the search triggers, and 0026_chat2.sql,
// which holds the triggers that drop favorites.

export const chatThreads = sqliteTable('chat_threads', {
	id: text('id').primaryKey(),
	title: text('title'),
	dmKey: text('dm_key').unique(),
	createdBy: text('created_by')
		.notNull()
		.references(() => users.id),
	createdAt: integer('created_at').notNull(),
	lastMessageAt: integer('last_message_at').notNull(),
	// The rest are 0026_chat2.sql's. project_id references projects there; the reference is
	// left out here because the posts schema already imports this file.
	imageKey: text('image_key'),
	projectId: text('project_id'),
	notificationForcedAt: integer('notification_forced_at')
});

export const notificationLevels = ['all', 'mentions', 'none'] as const;
export type NotificationLevel = (typeof notificationLevels)[number];

export const chatThreadMembers = sqliteTable(
	'chat_thread_members',
	{
		threadId: text('thread_id')
			.notNull()
			.references(() => chatThreads.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		lastReadAt: integer('last_read_at').notNull(),
		createdAt: integer('created_at').notNull(),
		notificationLevel: text('notification_level', { enum: notificationLevels })
			.notNull()
			.default('all'),
		markedUnread: integer('marked_unread', { mode: 'boolean' }).notNull().default(false)
	},
	(t) => [primaryKey({ columns: [t.threadId, t.userId] })]
);

export const chatMembershipUpdates = sqliteTable('chat_membership_updates', {
	id: text('id').primaryKey(),
	threadId: text('thread_id')
		.notNull()
		.references(() => chatThreads.id, { onDelete: 'cascade' }),
	actorId: text('actor_id')
		.notNull()
		.references(() => users.id),
	added: text('added', { mode: 'json' }).$type<string[]>().notNull().default([]),
	removed: text('removed', { mode: 'json' }).$type<string[]>().notNull().default([]),
	createdAt: integer('created_at').notNull()
});

export const favorites = sqliteTable(
	'favorites',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		subjectType: text('subject_type', { enum: ['note', 'thread'] }).notNull(),
		subjectId: text('subject_id').notNull(),
		createdAt: integer('created_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.userId, t.subjectType, t.subjectId] })]
);

export const messages = sqliteTable('messages', {
	id: text('id').primaryKey(),
	threadId: text('thread_id')
		.notNull()
		.references(() => chatThreads.id, { onDelete: 'cascade' }),
	authorId: text('author_id')
		.notNull()
		.references(() => users.id),
	replyToId: text('reply_to_id').references((): AnySQLiteColumn => messages.id),
	body: text('body').notNull(),
	bodyText: text('body_text').notNull(),
	createdAt: integer('created_at').notNull(),
	editedAt: integer('edited_at'),
	deletedAt: integer('deleted_at')
});

export const messageReactions = sqliteTable(
	'message_reactions',
	{
		messageId: text('message_id')
			.notNull()
			.references(() => messages.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		emoji: text('emoji').notNull(),
		createdAt: integer('created_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })]
);
