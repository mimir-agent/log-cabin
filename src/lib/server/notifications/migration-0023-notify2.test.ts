import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

// 0023_notify2 copies notifications forward to add the reaction and project kinds, after
// 0023_invites2 copied it to add join requests. Migrations apply in name order.
const target = '0023_notify2.sql';
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

describe('migration 0023_notify2', () => {
	it('runs after 0023_invites2, whose copy of notifications it copies again', () => {
		expect(migrations.indexOf(target)).toBeGreaterThan(migrations.indexOf('0023_invites2.sql'));
	});

	it('subscribes the authors and commenters of existing posts to their comments', () => {
		const sqlite = migratedBefore();
		sqlite.exec(`
			INSERT INTO projects (id, name, private, created_by, created_at) VALUES ('pr', 'Launch', 0, 'u1', 0);
			INSERT INTO posts (id, project_id, author_id, title, body, body_text, created_at, last_activity_at)
				VALUES ('p1', 'pr', 'u1', 'Plan', '{}', '', 1, 1);
			INSERT INTO comments (id, post_id, author_id, body, body_text, created_at)
				VALUES ('c1', 'p1', 'u2', '{}', '', 2), ('c2', 'p1', 'u2', '{}', '', 3);
		`);
		sqlite.exec(readFileSync(`migrations/${target}`, 'utf8'));
		expect(
			sqlite.prepare('SELECT post_id, user_id FROM post_subscriptions ORDER BY user_id').all()
		).toEqual([
			{ post_id: 'p1', user_id: 'u1' },
			{ post_id: 'p1', user_id: 'u2' }
		]);
	});

	it('keeps every notification, and pushes the new kinds to saved settings', () => {
		const sqlite = migratedBefore();
		sqlite.exec(`
			INSERT INTO notifications (id, user_id, actor_id, kind, item_key, url, title, source, created_at, read_at, archived_at, emailed_at)
				VALUES ('n1', 'u2', 'u1', 'join_request', 'join:u1', '/members', 'a@example.com', 'join.requested:u1', 5, 6, NULL, 7);
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
		expect(JSON.parse(push_kinds).sort()).toEqual(
			[
				'mention',
				'feedback',
				'reaction',
				'added_to_project',
				'project_renamed',
				'project_archived',
				'post_moved'
			].sort()
		);
	});

	it('carries a saved digest choice over to the daily and weekly digests', () => {
		const sqlite = migratedBefore();
		sqlite.exec(`
			INSERT INTO users (id, email, name, username, created_at) VALUES ('u3', 'c@example.com', 'Cy', 'cy', 0);
			INSERT INTO notification_settings (user_id, email_kinds, push_kinds, digest, digest_hour, digest_weekday, last_digest_at)
				VALUES ('u1', '["mention"]', '[]', 'daily', 7, 1, 99),
					('u2', '[]', '[]', 'weekly', 15, 2, NULL),
					('u3', '[]', '[]', 'off', 8, 1, NULL);
		`);
		sqlite.exec(readFileSync(`migrations/${target}`, 'utf8'));

		expect(
			sqlite
				.prepare(
					'SELECT user_id, email_kinds, daily_digest, daily_digest_hour, weekly_digest, weekly_digest_weekday, weekly_digest_hour, last_daily_digest_at FROM notification_settings ORDER BY user_id'
				)
				.all()
		).toEqual([
			expect.objectContaining({
				user_id: 'u1',
				email_kinds: '["mention"]',
				daily_digest: 1,
				daily_digest_hour: 7,
				weekly_digest: 0,
				weekly_digest_weekday: 5,
				weekly_digest_hour: 17,
				last_daily_digest_at: null
			}),
			expect.objectContaining({
				user_id: 'u2',
				daily_digest: 0,
				daily_digest_hour: 9,
				weekly_digest: 1,
				weekly_digest_weekday: 2,
				weekly_digest_hour: 15
			}),
			expect.objectContaining({ user_id: 'u3', daily_digest: 0, weekly_digest: 0 })
		]);
	});
});
