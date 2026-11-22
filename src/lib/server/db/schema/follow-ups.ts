import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core';
import { users } from './core';

// Mirrors migrations/0021_posts3.sql, which also deletes a reminder with its subject.

export const followUpSubjects = ['post', 'comment', 'note', 'call'] as const;
export type FollowUpSubject = (typeof followUpSubjects)[number];

export const followUps = sqliteTable(
	'follow_ups',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		subjectType: text('subject_type', { enum: followUpSubjects }).notNull(),
		subjectId: text('subject_id').notNull(),
		title: text('title').notNull(),
		url: text('url').notNull(),
		showAt: integer('show_at').notNull(),
		shownAt: integer('shown_at'),
		/** Push through quiet hours and pauses (0030_reminder_push.sql). */
		notifyAnyway: integer('notify_anyway', { mode: 'boolean' }).notNull().default(true),
		createdAt: integer('created_at').notNull()
	},
	(t) => [unique().on(t.userId, t.subjectType, t.subjectId)]
);
