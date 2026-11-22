import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { notificationKinds } from '../db/schema/notifications';

// 0023 copies notifications forward to add 'join_request'. Migrations apply in name order, so
// this applies them that way, as a fresh database gets them.
const target = '0023_invites2.sql';
const migrations = readdirSync('migrations')
	.filter((f) => f.endsWith('.sql'))
	.sort();

function migrated(upTo: (file: string) => boolean) {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON');
	for (const file of migrations.filter(upTo)) {
		sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
	}
	sqlite.exec(
		"INSERT INTO users (id, email, name, username, created_at) VALUES ('u1', 'a@example.com', 'Ada', 'ada', 0), ('u2', 'b@example.com', 'Bo', 'bo', 0)"
	);
	return sqlite;
}

describe('migration 0023', () => {
	it('leaves a fresh database accepting every notification kind', () => {
		const sqlite = migrated(() => true);
		const insert = sqlite.prepare(
			"INSERT INTO notifications (id, user_id, actor_id, kind, item_key, url, source, created_at) VALUES (?, 'u1', 'u2', ?, 'item', '/', ?, 0)"
		);
		for (const kind of notificationKinds) {
			expect(() => insert.run(kind, kind, kind), kind).not.toThrow();
		}
	});

	it('keeps every notification it copies forward, and pushes join requests to saved settings', () => {
		const sqlite = migrated((f) => f < target);
		sqlite.exec(`
			INSERT INTO notifications (id, user_id, actor_id, kind, item_key, url, title, source, created_at, read_at, archived_at, emailed_at)
				VALUES ('n1', 'u2', 'u1', 'follow_up', 'post:x', '/posts/x', 'Plan', 'follow_up:f1', 5, 6, NULL, 7),
				       ('n2', 'u1', 'u2', 'feedback', 'post:x', '/posts/x', 'Plan', 'feedback:r1', 8, NULL, 9, NULL);
			INSERT INTO notification_settings (user_id, email_kinds, push_kinds, digest, digest_hour, digest_weekday)
				VALUES ('u1', '["mention"]', '["mention","feedback"]', 'daily', 8, 1);
		`);
		const before = sqlite.prepare('SELECT * FROM notifications ORDER BY id').all();
		sqlite.exec(readFileSync(`migrations/${target}`, 'utf8'));

		expect(sqlite.prepare('SELECT * FROM notifications ORDER BY id').all()).toEqual(before);
		expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
		const { push_kinds } = sqlite
			.prepare("SELECT push_kinds FROM notification_settings WHERE user_id = 'u1'")
			.get() as { push_kinds: string };
		expect(JSON.parse(push_kinds)).toEqual(['mention', 'feedback', 'join_request']);
	});
});
