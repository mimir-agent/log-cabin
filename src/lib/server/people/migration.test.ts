import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

// 0015 gives everyone already here a username made from their name, then refuses any user
// without a valid one. This applies every migration before it to a database with people in
// it, then 0015.
const target = '0015_people.sql';
const earlier = readdirSync('migrations')
	.filter((f) => f.endsWith('.sql') && f < target)
	.sort();

function migrated(names: string[]) {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON');
	for (const file of earlier) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
	const insert = sqlite.prepare(
		'INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)'
	);
	names.forEach((name, i) => insert.run(`u${i}`, `p${i}@example.com`, name, i));
	sqlite.exec(readFileSync(`migrations/${target}`, 'utf8'));
	return sqlite;
}

const usernames = (sqlite: DatabaseSync) =>
	sqlite
		.prepare('SELECT name, username FROM users ORDER BY created_at')
		.all()
		.map((row) => [row.name, row.username]);

describe('migration 0015', () => {
	it('gives everyone a unique username from their name, numbering repeats by who joined first', () => {
		const sqlite = migrated([
			'Ada Okafor',
			'Bo',
			'ada okafor',
			'李',
			'X',
			'Jean-Luc O’Brien 2nd',
			'Ada  Okafor',
			'A very long name that goes past the limit'
		]);
		expect(usernames(sqlite)).toEqual([
			['Ada Okafor', 'adaokafor'],
			['Bo', 'bo'],
			['ada okafor', 'adaokafor-2'],
			['李', 'member'],
			['X', 'member-2'],
			['Jean-Luc O’Brien 2nd', 'jeanlucobrien2nd'],
			['Ada  Okafor', 'adaokafor-3'],
			['A very long name that goes past the limit', 'averylongnamethatgoespastth']
		]);
	});

	it('refuses a user added without a username, with a malformed one, or with a taken one', () => {
		const sqlite = migrated(['Ada']);
		const insert = (username: string | null) => () =>
			sqlite
				.prepare(
					"INSERT INTO users (id, email, name, username, created_at) VALUES ('n', 'n@example.com', 'N', ?, 0)"
				)
				.run(username);

		expect(insert(null)).toThrow(/users.username must be/);
		expect(insert('Has Caps')).toThrow(/users.username must be/);
		expect(insert('ada')).toThrow(/UNIQUE/);
		expect(() => sqlite.prepare("UPDATE users SET username = 'a' WHERE id = 'u0'").run()).toThrow(
			/users.username must be/
		);
	});
});
