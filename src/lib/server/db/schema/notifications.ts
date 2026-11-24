import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './core';

// Mirrors migrations/0006_notifications.sql; 0011_calls2.sql added the kind 'call',
// 0021_posts3.sql 'feedback' and 'follow_up', 0023_invites2.sql 'join_request', and
// 0023_notify2.sql 'reaction' and the project kinds, and 0035_comment_resolved.sql
// 'comment_resolved', and 0037_post_resolved.sql 'post_resolved' and
// 'post_resolved_from_comment'.

export const notificationKinds = [
	'mention',
	'comment',
	'reply',
	'message',
	'post',
	'note',
	'call',
	'feedback',
	'follow_up',
	'join_request',
	'reaction',
	'added_to_project',
	'project_renamed',
	'project_archived',
	'post_moved',
	'comment_resolved',
	'post_resolved',
	'post_resolved_from_comment'
] as const;
export type NotificationKind = (typeof notificationKinds)[number];

export const notifications = sqliteTable('notifications', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	actorId: text('actor_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	kind: text('kind', { enum: notificationKinds }).notNull(),
	itemKey: text('item_key').notNull(),
	url: text('url').notNull(),
	title: text('title'),
	/** The sentence an inbox row, push and mail read; null where the kind words it itself (0036_notification_summary.sql). */
	summary: text('summary'),
	/** A reaction's emoji, for the inbox row's badge. */
	emoji: text('emoji'),
	/** "<prefix>: <excerpt>" under the sentence in push and mail (0043_notification_preview.sql). */
	preview: text('preview'),
	source: text('source').notNull(),
	createdAt: integer('created_at').notNull(),
	readAt: integer('read_at'),
	archivedAt: integer('archived_at'),
	emailedAt: integer('emailed_at'),
	/** Made while a schedule or pause held push and email (0030_reminder_push.sql). */
	heldAt: integer('held_at')
});

export const pushSubscriptions = sqliteTable('push_subscriptions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	endpoint: text('endpoint').notNull().unique(),
	p256dh: text('p256dh').notNull(),
	auth: text('auth').notNull(),
	createdAt: integer('created_at').notNull()
});

export const notificationSettings = sqliteTable('notification_settings', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	emailKinds: text('email_kinds', { mode: 'json' }).$type<NotificationKind[]>().notNull(),
	pushKinds: text('push_kinds', { mode: 'json' }).$type<NotificationKind[]>().notNull(),
	dailyDigest: integer('daily_digest', { mode: 'boolean' }).notNull(),
	dailyDigestHour: integer('daily_digest_hour').notNull(),
	weeklyDigest: integer('weekly_digest', { mode: 'boolean' }).notNull(),
	/** 0 = Sunday. */
	weeklyDigestWeekday: integer('weekly_digest_weekday').notNull(),
	weeklyDigestHour: integer('weekly_digest_hour').notNull(),
	lastDailyDigestAt: integer('last_daily_digest_at'),
	lastWeeklyDigestAt: integer('last_weekly_digest_at')
});

/** Quiet hours (0023_notify2.sql): the hours, on these weekdays (0 = Sunday), someone gets push and email. */
export const notificationSchedules = sqliteTable('notification_schedules', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	weekdays: text('weekdays', { mode: 'json' }).$type<number[]>().notNull(),
	startMinute: integer('start_minute').notNull(),
	endMinute: integer('end_minute').notNull()
});
