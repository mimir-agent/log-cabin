import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Mirrors migrations/0021_posts3.sql.

export const linkPreviews = sqliteTable('link_previews', {
	url: text('url').primaryKey(),
	preview: text('preview'),
	fetchedAt: integer('fetched_at').notNull()
});
