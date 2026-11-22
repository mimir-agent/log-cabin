import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { users } from './core';
import { invites } from './auth';
import { projects } from './posts';

// Mirrors migrations/0023_invites2.sql. org.domain_join and the members onboarding columns
// are declared in core.ts.

export const inviteProjects = sqliteTable(
	'invite_projects',
	{
		inviteId: text('invite_id')
			.notNull()
			.references(() => invites.id, { onDelete: 'cascade' }),
		projectId: text('project_id')
			.notNull()
			.references(() => projects.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.inviteId, t.projectId] })]
);

export const joinRequests = sqliteTable('join_requests', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	createdAt: integer('created_at').notNull()
});
