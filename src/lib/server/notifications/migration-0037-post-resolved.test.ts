import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

// 0037_post_resolved copies notifications forward to add the post_resolved kinds, and gives
// posts their resolution. Migrations apply in name order.
const target = '0037_post_resolved.sql';
const migrations = readdirSync('migrations')
	.filter((f) => f.endsWith('.sql'))
	.sort();

function migratedBefore() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON');
	for (const file of migrations.filter((f) => f < target)) {
		sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
	}
	sqlite.exec(
		"INSERT INTO users (id, email, name, username, created_at) VALUES ('u1', 'a@example.com', 'Ada', 'ada', 0), ('u2', 'b@example.com', 'Bo', 'bo', 0)"
	);
	return sqlite;
}

describe('migration 0037_post_resolved', () => {
	it('keeps every notification as it was, held ones too, and its indexes', () => {
		const sqlite = migratedBefore();
		sqlite.exec(`
			INSERT INTO notifications (id, user_id, actor_id, kind, item_key, url, title, source, created_at, read_at, archived_at, emailed_at, held_at, summary, emoji)
				VALUES ('n1', 'u2', 'u1', 'comment_resolved', 'post:p1', '/posts/p1', 'Plan', 'comment.resolved:c1', 5, 6, NULL, 7, NULL, 'Ada resolved it', NULL),
					('n2', 'u1', 'u2', 'comment', 'post:p1', '/posts/p1#comment-c1', 'Plan', 'comment.created:c1', 8, NULL, 9, 8, 8, NULL, '👍');
		`);
		const rows = () => sqlite.prepare('SELECT * FROM notifications ORDER BY id').all();
		const indexes = () =>
			sqlite
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'notifications' AND sql IS NOT NULL ORDER BY name"
				)
				.all();
		const [rowsBefore, indexesBefore] = [rows(), indexes()];

		sqlite.exec(readFileSync(`migrations/${target}`, 'utf8'));

		expect(rows()).toEqual(rowsBefore);
		expect(indexes()).toEqual(indexesBefore);
		expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
	});

	it('accepts the new kinds, and still refuses an unknown one', () => {
		const sqlite = migratedBefore();
		sqlite.exec(readFileSync(`migrations/${target}`, 'utf8'));
		const insert = (kind: string) =>
			sqlite
				.prepare(
					"INSERT INTO notifications (id, user_id, actor_id, kind, item_key, url, source, created_at) VALUES (?, 'u1', 'u2', ?, 'post:p1', '/posts/p1', ?, 0)"
				)
				.run(`n-${kind}`, kind, kind);
		expect(() => insert('post_resolved')).not.toThrow();
		expect(() => insert('post_resolved_from_comment')).not.toThrow();
		expect(() => insert('post_unresolved')).toThrow(/CHECK constraint/);
	});

	it('leaves existing posts without a resolution', () => {
		const sqlite = migratedBefore();
		sqlite.exec(`
			INSERT INTO projects (id, name, private, created_by, created_at) VALUES ('pr', 'Launch', 0, 'u1', 0);
			INSERT INTO posts (id, project_id, author_id, title, body, body_text, created_at, last_activity_at, resolved_at, resolved_by)
				VALUES ('p1', 'pr', 'u1', 'Plan', '{}', '', 1, 1, 3, 'u2');
		`);
		sqlite.exec(readFileSync(`migrations/${target}`, 'utf8'));
		expect(sqlite.prepare('SELECT resolved_at, resolved_body FROM posts').all()).toEqual([
			{ resolved_at: 3, resolved_body: null }
		]);
	});
});
