import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

// 0035_comment_resolved copies notifications forward to add the comment_resolved kind, and adds
// the resolved columns to comments. Migrations apply in name order.
const target = '0035_comment_resolved.sql';
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

describe('migration 0035_comment_resolved', () => {
	it('keeps every notification as it was, held ones too, and its indexes', () => {
		const sqlite = migratedBefore();
		sqlite.exec(`
			INSERT INTO notifications (id, user_id, actor_id, kind, item_key, url, title, source, created_at, read_at, archived_at, emailed_at, held_at)
				VALUES ('n1', 'u2', 'u1', 'reaction', 'reactions:post:p1', '/posts/p1', 'Plan', 'reaction.created:r1', 5, 6, NULL, 7, NULL),
					('n2', 'u1', 'u2', 'comment', 'post:p1', '/posts/p1#comment-c1', 'Plan', 'comment.created:c1', 8, NULL, 9, 8, 8);
			INSERT INTO notification_settings (user_id, email_kinds, push_kinds, daily_digest, daily_digest_hour, weekly_digest, weekly_digest_weekday, weekly_digest_hour)
				VALUES ('u1', '["mention"]', '["mention","feedback"]', 1, 8, 1, 5, 17);
		`);
		const rows = () => sqlite.prepare('SELECT * FROM notifications ORDER BY id').all();
		const settings = () => sqlite.prepare('SELECT * FROM notification_settings').all();
		const [notificationsBefore, settingsBefore] = [rows(), settings()];
		const indexes = () =>
			sqlite
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'notifications' AND sql IS NOT NULL ORDER BY name"
				)
				.all();
		const indexesBefore = indexes();

		sqlite.exec(readFileSync(`migrations/${target}`, 'utf8'));

		expect(rows()).toEqual(notificationsBefore);
		expect(settings()).toEqual(settingsBefore);
		expect(indexes()).toEqual(indexesBefore);
		expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
	});

	it('accepts the new kind, and still refuses an unknown one', () => {
		const sqlite = migratedBefore();
		sqlite.exec(readFileSync(`migrations/${target}`, 'utf8'));
		const insert = (kind: string) =>
			sqlite
				.prepare(
					"INSERT INTO notifications (id, user_id, actor_id, kind, item_key, url, source, created_at) VALUES (?, 'u1', 'u2', ?, 'post:p1', '/posts/p1', ?, 0)"
				)
				.run(`n-${kind}`, kind, kind);
		expect(() => insert('comment_resolved')).not.toThrow();
		expect(() => insert('comment_unresolved')).toThrow(/CHECK constraint/);
	});

	it('leaves existing comments open, and lets one be resolved and its resolver deleted', () => {
		const sqlite = migratedBefore();
		sqlite.exec(`
			INSERT INTO projects (id, name, private, created_by, created_at) VALUES ('pr', 'Launch', 0, 'u1', 0);
			INSERT INTO posts (id, project_id, author_id, title, body, body_text, created_at, last_activity_at)
				VALUES ('p1', 'pr', 'u1', 'Plan', '{}', '', 1, 1);
			INSERT INTO comments (id, post_id, author_id, body, body_text, created_at) VALUES ('c1', 'p1', 'u2', '{}', '', 2);
		`);
		sqlite.exec(readFileSync(`migrations/${target}`, 'utf8'));
		expect(sqlite.prepare('SELECT resolved_at, resolved_by FROM comments').all()).toEqual([
			{ resolved_at: null, resolved_by: null }
		]);
		sqlite.exec(
			"INSERT INTO users (id, email, name, username, created_at) VALUES ('u3', 'c@example.com', 'Cy', 'cy', 0)"
		);
		sqlite.exec("UPDATE comments SET resolved_at = 9, resolved_by = 'u3'");
		sqlite.exec("DELETE FROM users WHERE id = 'u3'");
		expect(sqlite.prepare('SELECT resolved_at, resolved_by FROM comments').all()).toEqual([
			{ resolved_at: 9, resolved_by: null }
		]);
	});
});
