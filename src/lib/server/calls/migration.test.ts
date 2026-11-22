import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

// 0011 copies calls, call_participants and notifications into new tables. This applies
// every migration before it to a database with rows in all three, then 0011, with foreign
// keys enforced as D1 enforces them, and checks that nothing was lost on the way.
const migrations = readdirSync('migrations')
	.filter((f) => f.endsWith('.sql'))
	.sort();
const target = '0011_calls2.sql';

function databaseBefore(file: string) {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON');
	for (const earlier of migrations.filter((f) => f < file)) {
		sqlite.exec(readFileSync(`migrations/${earlier}`, 'utf8'));
	}
	return sqlite;
}

function seed(sqlite: DatabaseSync) {
	sqlite.exec(`
		INSERT INTO users (id, email, name, created_at) VALUES ('u1', 'a@example.com', 'Ada', 0), ('u2', 'b@example.com', 'Bo', 0);
		INSERT INTO projects (id, name, created_by, created_at) VALUES ('p1', 'Ops', 'u1', 0);
		INSERT INTO chat_threads (id, title, created_by, created_at, last_message_at) VALUES ('t1', 'Pairing', 'u1', 0, 0);
		INSERT INTO calcom_bookings (id, uid, title, starts_at, ends_at, created_at) VALUES ('b1', 'uid-1', 'Intro', 0, 1, 0);
		INSERT INTO calls (id, project_id, started_by, started_at, ended_at, calcom_booking_id) VALUES ('c1', 'p1', 'u1', 10, 70, 'b1');
		INSERT INTO calls (id, thread_id, started_by, started_at) VALUES ('c2', 't1', 'u2', 20);
		INSERT INTO call_participants (id, call_id, user_id, session_id, tracks, muted, camera_off, joined_at, left_at)
			VALUES ('cp1', 'c1', 'u1', 's1', '["audio","video"]', 1, 0, 11, 70),
			       ('cp2', 'c1', 'u2', 's2', '["audio"]', 0, 1, 12, 60),
			       ('cp3', 'c2', 'u2', 's3', '[]', 0, 0, 21, NULL);
		INSERT INTO notifications (id, user_id, actor_id, kind, item_key, url, title, source, created_at, read_at, archived_at, emailed_at)
			VALUES ('n1', 'u2', 'u1', 'mention', 'post:x', '/posts/x', 'Plan', 'mention:post:x', 5, 6, NULL, 7),
			       ('n2', 'u1', 'u2', 'message', 'thread:t1', '/chat/t1', NULL, 'message.created:m1', 8, NULL, 9, NULL);
	`);
}

const rows = (sqlite: DatabaseSync, table: string) =>
	sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all();

describe('migration 0011', () => {
	it('keeps every call, participant and notification it copies forward', () => {
		const sqlite = databaseBefore(target);
		seed(sqlite);
		const before = {
			calls: rows(sqlite, 'calls'),
			participants: rows(sqlite, 'call_participants'),
			notifications: rows(sqlite, 'notifications')
		};
		sqlite.exec(readFileSync(`migrations/${target}`, 'utf8'));

		expect(rows(sqlite, 'calls')).toEqual(
			before.calls.map((call) => ({ ...call, room_owner_id: null }))
		);
		expect(rows(sqlite, 'call_participants')).toEqual(
			before.participants.map((p) => ({ ...p, guest_pass_id: null }))
		);
		expect(rows(sqlite, 'notifications')).toEqual(before.notifications);
		expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
	});

	it('still cascades a deleted project to its calls and their participants', () => {
		const sqlite = databaseBefore(target);
		seed(sqlite);
		sqlite.exec(readFileSync(`migrations/${target}`, 'utf8'));
		sqlite.exec("DELETE FROM projects WHERE id = 'p1'");
		expect(rows(sqlite, 'calls').map((c) => c.id)).toEqual(['c2']);
		expect(rows(sqlite, 'call_participants').map((p) => p.id)).toEqual(['cp3']);
	});

	it('pushes calls to people who saved their settings before calls could ring', () => {
		const sqlite = databaseBefore(target);
		seed(sqlite);
		sqlite.exec(`
			INSERT INTO notification_settings (user_id, email_kinds, push_kinds, digest, digest_hour, digest_weekday)
				VALUES ('u1', '["mention"]', '["mention","message"]', 'daily', 8, 0),
				       ('u2', '["mention"]', '["call","post"]', 'off', 8, 0);
		`);
		sqlite.exec(readFileSync(`migrations/${target}`, 'utf8'));

		const kinds = sqlite
			.prepare(
				'SELECT user_id, email_kinds, push_kinds FROM notification_settings ORDER BY user_id'
			)
			.all();
		expect(kinds).toEqual([
			{ user_id: 'u1', email_kinds: '["mention"]', push_kinds: '["mention","message","call"]' },
			{ user_id: 'u2', email_kinds: '["mention"]', push_kinds: '["call","post"]' }
		]);
	});
});
