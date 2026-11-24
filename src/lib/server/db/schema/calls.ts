import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './core';
import { projects } from './posts';
import { chatThreads } from './chat';

// Mirrors migrations/0009_calls.sql as copied forward by 0011_calls2.sql, which also holds
// the one-live-call-per-place indexes and the CHECKs.

export const trackNames = ['audio', 'video', 'screen'] as const;
export type TrackName = (typeof trackNames)[number];

/** Exactly one of projectId, threadId and roomOwnerId is set. */
export const calls = sqliteTable('calls', {
	id: text('id').primaryKey(),
	projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
	threadId: text('thread_id').references(() => chatThreads.id, { onDelete: 'cascade' }),
	/** A personal room's calls: the room owner's users.id. */
	roomOwnerId: text('room_owner_id').references(() => users.id, { onDelete: 'cascade' }),
	startedBy: text('started_by')
		.notNull()
		.references(() => users.id),
	startedAt: integer('started_at').notNull(),
	endedAt: integer('ended_at'),
	/** The Cal.com booking whose link started the call (migrations/0010_calcom.sql). */
	calcomBookingId: text('calcom_booking_id'),
	/** Written from the transcripts of the call's recordings once it ended (migrations/0013_recordings.sql). */
	title: text('title'),
	/** JSON CallSummary (recordings/transcripts.ts), written with the title. */
	summary: text('summary')
});

export const sharePermissions = ['view', 'edit'] as const;
export type SharePermission = (typeof sharePermissions)[number];

/** A call shared into a channel after it started (migrations/0042_call_shares.sql). */
export const callShares = sqliteTable('call_shares', {
	callId: text('call_id')
		.primaryKey()
		.references(() => calls.id, { onDelete: 'cascade' }),
	projectId: text('project_id')
		.notNull()
		.references(() => projects.id, { onDelete: 'cascade' }),
	permission: text('permission', { enum: sharePermissions }).notNull()
});

export const callGuestPasses = sqliteTable('call_guest_passes', {
	id: text('id').primaryKey(),
	callId: text('call_id')
		.notNull()
		.references(() => calls.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	tokenHash: text('token_hash').notNull().unique(),
	notBefore: integer('not_before').notNull(),
	expiresAt: integer('expires_at').notNull(),
	createdBy: text('created_by')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	createdAt: integer('created_at').notNull()
});

/** Exactly one of userId (a member) and guestPassId (a guest) is set. */
export const callParticipants = sqliteTable('call_participants', {
	id: text('id').primaryKey(),
	callId: text('call_id')
		.notNull()
		.references(() => calls.id, { onDelete: 'cascade' }),
	userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
	guestPassId: text('guest_pass_id').references(() => callGuestPasses.id, { onDelete: 'cascade' }),
	sessionId: text('session_id').notNull(),
	tracks: text('tracks', { mode: 'json' }).$type<TrackName[]>().notNull().default([]),
	muted: integer('muted', { mode: 'boolean' }).notNull().default(false),
	cameraOff: integer('camera_off', { mode: 'boolean' }).notNull().default(false),
	joinedAt: integer('joined_at').notNull(),
	leftAt: integer('left_at'),
	/** A guest's last request about the call (0014); guests have no socket for presence. */
	seenAt: integer('seen_at')
});

export const invitationStatuses = [
	'ringing',
	'accepted',
	'declined',
	'missed',
	'cancelled'
] as const;
export type InvitationStatus = (typeof invitationStatuses)[number];

export const callInvitations = sqliteTable('call_invitations', {
	id: text('id').primaryKey(),
	callId: text('call_id')
		.notNull()
		.references(() => calls.id, { onDelete: 'cascade' }),
	inviterId: text('inviter_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	inviteeId: text('invitee_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	status: text('status', { enum: invitationStatuses }).notNull().default('ringing'),
	createdAt: integer('created_at').notNull(),
	answeredAt: integer('answered_at')
});
