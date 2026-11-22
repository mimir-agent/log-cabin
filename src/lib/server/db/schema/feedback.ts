import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core';
import { users } from './core';
import { posts } from './posts';

// Mirrors migrations/0021_posts3.sql.

export const postFeedbackRequests = sqliteTable(
	'post_feedback_requests',
	{
		id: text('id').primaryKey(),
		postId: text('post_id')
			.notNull()
			.references(() => posts.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		requestedBy: text('requested_by')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at').notNull(),
		repliedAt: integer('replied_at'),
		dismissedAt: integer('dismissed_at')
	},
	(t) => [unique().on(t.postId, t.userId)]
);
