import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { members, roles, users } from './core';

// Mirrors migrations/0002_auth.sql and 0012_auth2.sql. org.google_sign_in and the users
// columns 0012 adds are declared in core.ts.

export const passwordResetTokens = sqliteTable('password_reset_tokens', {
	tokenHash: text('token_hash').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull(),
	usedAt: integer('used_at'),
	createdAt: integer('created_at').notNull()
});

export const emailChangeTokens = sqliteTable(
	'email_change_tokens',
	{
		tokenHash: text('token_hash').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		newEmail: text('new_email').notNull(),
		expiresAt: integer('expires_at').notNull(),
		usedAt: integer('used_at'),
		createdAt: integer('created_at').notNull()
	},
	(table) => [index('email_change_tokens_user').on(table.userId)]
);

export const recoveryCodes = sqliteTable('recovery_codes', {
	codeHash: text('code_hash').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	usedAt: integer('used_at'),
	createdAt: integer('created_at').notNull()
});

export const twoFactorChallenges = sqliteTable('two_factor_challenges', {
	tokenHash: text('token_hash').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull(),
	createdAt: integer('created_at').notNull()
});

export const signInTokens = sqliteTable('sign_in_tokens', {
	tokenHash: text('token_hash').primaryKey(),
	email: text('email').notNull(),
	expiresAt: integer('expires_at').notNull(),
	usedAt: integer('used_at'),
	createdAt: integer('created_at').notNull()
});

export const signInAttempts = sqliteTable(
	'sign_in_attempts',
	{
		key: text('key').notNull(),
		createdAt: integer('created_at').notNull()
	},
	(table) => [index('sign_in_attempts_key').on(table.key, table.createdAt)]
);

export const invites = sqliteTable('invites', {
	id: text('id').primaryKey(),
	tokenHash: text('token_hash').notNull().unique(),
	email: text('email'),
	role: text('role', { enum: roles }).notNull(),
	invitedBy: text('invited_by')
		.notNull()
		.references(() => members.id),
	expiresAt: integer('expires_at').notNull(),
	acceptedAt: integer('accepted_at'),
	revokedAt: integer('revoked_at'),
	createdAt: integer('created_at').notNull()
});
