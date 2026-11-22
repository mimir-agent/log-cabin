import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { users } from './core';
import { posts, projects } from './posts';

// Mirrors migrations/0022_posts4.sql (posts.public_token and the org columns live with
// their tables), which also holds the pin cleanup and search triggers.

export const tags = sqliteTable('tags', {
	id: text('id').primaryKey(),
	name: text('name').notNull().unique(),
	createdAt: integer('created_at').notNull()
});

export const tagAliases = sqliteTable('tag_aliases', {
	name: text('name').primaryKey(),
	tagId: text('tag_id')
		.notNull()
		.references(() => tags.id, { onDelete: 'cascade' })
});

// post_tags.tag always holds the tag's current name; renaming a tag rewrites it.
export const postTags = sqliteTable(
	'post_tags',
	{
		postId: text('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		tag: text('tag').notNull(),
		tagId: text('tag_id').references(() => tags.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.postId, t.tag] })]
);

export const pinSubjects = ['post', 'note', 'call'] as const;
export type PinSubject = (typeof pinSubjects)[number];

export const projectPins = sqliteTable('project_pins', {
	id: text('id').primaryKey(),
	projectId: text('project_id')
		.notNull()
		.references(() => projects.id, { onDelete: 'cascade' }),
	subjectType: text('subject_type', { enum: pinSubjects }).notNull(),
	subjectId: text('subject_id').notNull(),
	pinnedBy: text('pinned_by')
		.notNull()
		.references(() => users.id),
	position: integer('position').notNull(),
	createdAt: integer('created_at').notNull()
});

export const projectBookmarks = sqliteTable('project_bookmarks', {
	id: text('id').primaryKey(),
	projectId: text('project_id')
		.notNull()
		.references(() => projects.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	url: text('url').notNull(),
	position: integer('position').notNull(),
	createdBy: text('created_by')
		.notNull()
		.references(() => users.id),
	createdAt: integer('created_at').notNull()
});

export const postMoves = sqliteTable('post_moves', {
	id: text('id').primaryKey(),
	postId: text('post_id')
		.notNull()
		.references(() => posts.id, { onDelete: 'cascade' }),
	movedBy: text('moved_by')
		.notNull()
		.references(() => users.id),
	fromProjectId: text('from_project_id').references(() => projects.id, { onDelete: 'set null' }),
	toProjectId: text('to_project_id').references(() => projects.id, { onDelete: 'set null' }),
	createdAt: integer('created_at').notNull()
});

export const customEmoji = sqliteTable('custom_emoji', {
	id: text('id').primaryKey(),
	name: text('name').notNull().unique(),
	contentType: text('content_type').notNull(),
	size: integer('size').notNull(),
	createdBy: text('created_by')
		.notNull()
		.references(() => users.id),
	createdAt: integer('created_at').notNull()
});
