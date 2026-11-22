import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { themeChoices } from '../../../styles/theme';

// Mirrors migrations/0001_core.sql. The SQL file is the source of truth for the database;
// keep both in step. search_index is an FTS5 virtual table, queried with raw SQL.

export const roles = ['admin', 'member', 'viewer', 'guest'] as const;
export type Role = (typeof roles)[number];

/** 0023: what signing in with an address at the org's email domain does, without an invite. */
export const domainJoinModes = ['off', 'direct', 'request'] as const;
export type DomainJoin = (typeof domainJoinModes)[number];

/** 0024: how each person lays out the notes index. */
export const noteLayouts = ['list', 'grid'] as const;
export type NoteLayout = (typeof noteLayouts)[number];

export const org = sqliteTable('org', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	logoKey: text('logo_key'),
	allowedEmailDomain: text('allowed_email_domain'),
	googleSignIn: integer('google_sign_in', { mode: 'boolean' }).notNull().default(true),
	/** 0031: AT Protocol sign-in, off until an admin turns it on. */
	atSignIn: integer('at_sign_in', { mode: 'boolean' }).notNull().default(false),
	aiEnabled: integer('ai_enabled', { mode: 'boolean' }).notNull().default(true),
	/** 0014: admins turn Cal.com off for everyone. */
	calcomEnabled: integer('calcom_enabled', { mode: 'boolean' }).notNull().default(true),
	// Added by 0022_posts4.sql.
	publicPosts: integer('public_posts', { mode: 'boolean' }).notNull().default(true),
	publicPostsIndexable: integer('public_posts_indexable', { mode: 'boolean' })
		.notNull()
		.default(false),
	customEmojiBy: text('custom_emoji_by', { enum: ['members', 'admins'] })
		.notNull()
		.default('members'),
	domainJoin: text('domain_join', { enum: domainJoinModes }).notNull().default('off'),
	createdAt: integer('created_at').notNull()
});

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	avatarKey: text('avatar_key'),
	timezone: text('timezone').notNull().default('UTC'),
	// Added by 0012_auth2.sql.
	passwordHash: text('password_hash'),
	totpSecret: text('totp_secret'),
	totpEnabledAt: integer('totp_enabled_at'),
	totpLastStep: integer('totp_last_step'),
	createdAt: integer('created_at').notNull(),
	// From 0015_people.sql. The SQL column allows NULL only because SQLite can't add a NOT NULL
	// column without a default; its triggers refuse a missing or malformed username.
	username: text('username').notNull().unique(),
	statusEmoji: text('status_emoji'),
	statusText: text('status_text'),
	statusExpiresAt: integer('status_expires_at'),
	lastSeenAt: integer('last_seen_at'),
	coverKey: text('cover_key'),
	theme: text('theme', { enum: themeChoices }).notNull().default('system'),
	// From 0023_notify2.sql: no push or email before this time. Digests still come, as in Campsite.
	notificationsPausedUntil: integer('notifications_paused_until'),
	// From 0024_parity.sql.
	noteLayout: text('note_layout', { enum: noteLayouts }).notNull().default('list')
});

export const members = sqliteTable('members', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.unique()
		.references(() => users.id, { onDelete: 'cascade' }),
	role: text('role', { enum: roles }).notNull(),
	deactivatedAt: integer('deactivated_at'),
	createdAt: integer('created_at').notNull(),
	// From 0023_invites2.sql: the onboarding step to resume at, and when onboarding ended.
	onboardingStep: text('onboarding_step'),
	onboardedAt: integer('onboarded_at')
});

export const sessions = sqliteTable('sessions', {
	tokenHash: text('token_hash').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull(),
	createdAt: integer('created_at').notNull()
});

export const devMail = sqliteTable('dev_mail', {
	id: text('id').primaryKey(),
	toAddress: text('to_address').notNull(),
	fromAddress: text('from_address').notNull(),
	subject: text('subject').notNull(),
	textBody: text('text_body').notNull(),
	htmlBody: text('html_body'),
	createdAt: integer('created_at').notNull()
});

export const jobLog = sqliteTable('job_log', {
	id: text('id').primaryKey(),
	kind: text('kind').notNull(),
	payload: text('payload').notNull(),
	status: text('status', { enum: ['done', 'unhandled', 'failed'] }).notNull(),
	error: text('error'),
	createdAt: integer('created_at').notNull()
});
