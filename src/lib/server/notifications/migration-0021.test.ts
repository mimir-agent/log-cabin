import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

// 0021 copies notifications forward to add two kinds. This applies every migration before it
// to a database with notifications and saved settings, with foreign keys enforced as D1
// enforces them, then 0021, and checks that nothing was lost and the new kinds are pushed.
const target = '0021_posts3.sql';
const earlier = readdirSync('migrations')
	.filter((f) => f.endsWith('.sql') && f < target)
	.sort();

function migratedWithRows() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON');
	for (const file of earlier) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
	sqlite.exec(`
		INSERT INTO users (id, email, name, username, created_at) VALUES ('u1', 'a@example.com', 'Ada', 'ada', 0), ('u2', 'b@example.com', 'Bo', 'bo', 0);
		INSERT INTO notifications (id, user_id, actor_id, kind, item_key, url, title, source, created_at, read_at, archived_at, emailed_at)
			VALUES ('n1', 'u2', 'u1', 'call', 'call:c1', '/calls/c1', NULL, 'call.missed:i1', 5, 6, NULL, 7),
			       ('n2', 'u1', 'u2', 'mention', 'post:x', '/posts/x', 'Plan', 'mention:post:x', 8, NULL, 9, NULL);
		INSERT INTO notification_settings (user_id, email_kinds, push_kinds, digest, digest_hour, digest_weekday)
			VALUES ('u1', '["mention"]', '["mention","call"]', 'daily', 8, 1);
	`);
	const before = sqlite.prepare('SELECT * FROM notifications ORDER BY id').all();
	sqlite.exec(readFileSync(`migrations/${target}`, 'utf8'));
	return { sqlite, before };
}

describe('migration 0021', () => {
	it('keeps every notification it copies forward', () => {
		const { sqlite, before } = migratedWithRows();
		expect(sqlite.prepare('SELECT * FROM notifications ORDER BY id').all()).toEqual(before);
		expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
	});

	it('pushes the new kinds to people who saved their settings before them', () => {
		const { sqlite } = migratedWithRows();
		const { push_kinds, email_kinds } = sqlite
			.prepare("SELECT push_kinds, email_kinds FROM notification_settings WHERE user_id = 'u1'")
			.get() as { push_kinds: string; email_kinds: string };
		expect(JSON.parse(push_kinds)).toEqual(['mention', 'call', 'feedback', 'follow_up']);
		expect(JSON.parse(email_kinds), 'email keeps its own choices').toEqual(['mention']);
	});
});
