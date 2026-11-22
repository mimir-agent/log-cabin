import { sql } from 'drizzle-orm';
import type { SignedIn } from '../auth/session';
import { db } from '../db';
import { visibleProjectIds } from '../posts/access';

export type ActivityEntry = {
	kind: 'post' | 'comment';
	actorName: string;
	postTitle: string;
	projectName: string;
	url: string;
	createdAt: number;
};

/** The newest posts and comments in the projects this person can see, leaving out archived ones. */
export async function listActivity(env: Env, who: SignedIn, limit = 50): Promise<ActivityEntry[]> {
	const visible = sql`projects.archived_at IS NULL AND ${visibleProjectIds(who)}`;
	return db(env).all<ActivityEntry>(sql`
		SELECT 'post' AS kind, u.name AS actorName, po.title AS postTitle, projects.name AS projectName,
			'/posts/' || po.id AS url, po.created_at AS createdAt
		FROM posts po
		JOIN users u ON u.id = po.author_id
		JOIN projects ON projects.id = po.project_id
		WHERE ${visible}
		UNION ALL
		SELECT 'comment', u.name, po.title, projects.name,
			'/posts/' || po.id || '#comment-' || c.id, c.created_at
		FROM comments c
		JOIN posts po ON po.id = c.post_id
		JOIN users u ON u.id = c.author_id
		JOIN projects ON projects.id = po.project_id
		WHERE ${visible}
		ORDER BY createdAt DESC
		LIMIT ${limit}`);
}
