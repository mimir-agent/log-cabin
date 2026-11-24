import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

// 0041_project_subscriptions subscribes every member, as they are and as they join, and drops them when they leave.
const target = '0041_project_subscriptions.sql';
const migrations = readdirSync('migrations')
	.filter((f) => f.endsWith('.sql'))
	.sort();

describe('migration 0041_project_subscriptions', () => {
	it('subscribes the members already there and each one who joins, never a favourite', () => {
		const sqlite = new DatabaseSync(':memory:');
		sqlite.exec('PRAGMA foreign_keys = ON');
		for (const file of migrations.filter((f) => f < target)) {
			sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
		}
		sqlite.exec(`
			INSERT INTO users (id, email, name, username, created_at)
				VALUES ('u1', 'a@example.com', 'Ada', 'ada', 0), ('u2', 'b@example.com', 'Bo', 'bo', 0), ('u3', 'c@example.com', 'Cy', 'cy', 0);
			INSERT INTO projects (id, name, private, created_by, created_at) VALUES ('pr', 'Plans', 0, 'u1', 0);
			INSERT INTO project_members (project_id, user_id, created_at) VALUES ('pr', 'u1', 1);
			INSERT INTO project_favorites (project_id, user_id, created_at) VALUES ('pr', 'u3', 2);
		`);
		sqlite.exec(readFileSync(`migrations/${target}`, 'utf8'));
		sqlite.exec(
			"INSERT INTO project_members (project_id, user_id, created_at) VALUES ('pr', 'u2', 3)"
		);
		const subscribed = sqlite
			.prepare('SELECT user_id, created_at FROM project_subscriptions ORDER BY user_id')
			.all();
		expect(subscribed).toEqual([
			{ user_id: 'u1', created_at: 1 },
			{ user_id: 'u2', created_at: 3 }
		]);
	});

	it('drops a member’s subscription when they leave', () => {
		const sqlite = new DatabaseSync(':memory:');
		sqlite.exec('PRAGMA foreign_keys = ON');
		for (const file of migrations.filter((f) => f <= target)) {
			sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
		}
		sqlite.exec(`
					INSERT INTO users (id, email, name, username, created_at)
						VALUES ('u1', 'a@example.com', 'Ada', 'ada', 0), ('u2', 'b@example.com', 'Bo', 'bo', 0);
					INSERT INTO projects (id, name, private, created_by, created_at) VALUES ('pr', 'Plans', 0, 'u1', 0);
					INSERT INTO project_members (project_id, user_id, created_at) VALUES ('pr', 'u1', 1), ('pr', 'u2', 2);
					DELETE FROM project_members WHERE user_id = 'u2';
				`);
		const subscribed = sqlite.prepare('SELECT user_id FROM project_subscriptions').all();
		expect(subscribed).toEqual([{ user_id: 'u1' }]);
	});
});
