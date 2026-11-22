import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './core';

// Mirrors migrations/0031_atproto.sql. org.at_sign_in is declared in core.ts.

export const atprotoIdentities = sqliteTable('atproto_identities', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	did: text('did').notNull().unique(),
	/** Display only, and null whenever it isn't verified. */
	handle: text('handle'),
	handleVerifiedAt: integer('handle_verified_at'),
	checkedAt: integer('checked_at').notNull(),
	shown: integer('shown', { mode: 'boolean' }).notNull().default(true),
	profileUrl: text('profile_url'),
	createdAt: integer('created_at').notNull()
});

export const atprotoOauthStates = sqliteTable('atproto_oauth_states', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	expiresAt: integer('expires_at').notNull()
});
