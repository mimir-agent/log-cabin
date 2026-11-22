import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

// Mirrors migrations/0008_ai.sql, which also adds org.ai_enabled and the cleanup triggers.

export const summarySubjects = ['post', 'note', 'thread'] as const;
export type SummarySubject = (typeof summarySubjects)[number];

export const aiSummaries = sqliteTable(
	'ai_summaries',
	{
		subjectType: text('subject_type', { enum: summarySubjects }).notNull(),
		subjectId: text('subject_id').notNull(),
		contentHash: text('content_hash').notNull(),
		summary: text('summary').notNull(),
		createdAt: integer('created_at').notNull()
	},
	(t) => [primaryKey({ columns: [t.subjectType, t.subjectId] })]
);
