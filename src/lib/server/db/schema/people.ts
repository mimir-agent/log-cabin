import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './core';

// Mirrors migrations/0015_people.sql. A person's own new columns are on `users` in core.ts.

export const usernameRedirects = sqliteTable('username_redirects', {
	username: text('username').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull()
});
