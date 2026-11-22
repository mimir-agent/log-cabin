import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './core';
import { projects } from './posts';

// Mirrors migrations/0010_calcom.sql and 0014_calcom2.sql.

export type BookingAttendee = { name: string; email: string };

export const calcomConnections = sqliteTable('calcom_connections', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	webhookId: text('webhook_id').notNull().unique(),
	webhookSecret: text('webhook_secret').notNull(),
	apiKey: text('api_key').notNull(),
	projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
	updatedAt: integer('updated_at').notNull()
});

export const calcomBookings = sqliteTable('calcom_bookings', {
	id: text('id').primaryKey(),
	uid: text('uid').notNull().unique(),
	// Nullable in SQL only because ALTER TABLE added it; 0014 filled every older row and
	// every new booking is written with its owner.
	ownerId: text('owner_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	attendees: text('attendees', { mode: 'json' }).$type<BookingAttendee[]>().notNull().default([]),
	startsAt: integer('starts_at').notNull(),
	endsAt: integer('ends_at').notNull(),
	cancelledAt: integer('cancelled_at'),
	createdAt: integer('created_at').notNull()
});
