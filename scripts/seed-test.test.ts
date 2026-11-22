import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { emailDomain, people, seedSql, wipeSql } from './seed-test.js';

// Stands in for wrangler: records each call and fails, so nothing reaches Cloudflare.
function stubWrangler() {
	const dir = mkdtempSync(join(tmpdir(), 'wrangler-stub-'));
	const log = join(dir, 'calls.log');
	const stub = join(dir, 'wrangler');
	writeFileSync(stub, `#!/bin/sh\necho "$*" >> '${log}'\nexit 1\n`);
	chmodSync(stub, 0o755);
	writeFileSync(log, '');
	return { stub, calls: () => readFileSync(log, 'utf8') };
}

function run(script: string, args: string[]) {
	const wrangler = stubWrangler();
	const result = spawnSync(script, args, {
		encoding: 'utf8',
		env: { ...process.env, WRANGLER: wrangler.stub }
	});
	return { status: result.status, stderr: result.stderr, calls: wrangler.calls() };
}

function migratedDatabase() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON');
	for (const file of readdirSync('migrations').sort()) {
		sqlite.exec(readFileSync(join('migrations', file), 'utf8'));
	}
	return sqlite;
}

const count = (sqlite: DatabaseSync, table: string) =>
	(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

describe.each(['scripts/reset-test.sh', 'scripts/seed-test.js'])('%s', (script) => {
	const command = script.endsWith('.js') ? ['node', script] : [script];

	it.each([
		[['--env', 'beta'], 'campfire-beta'],
		[[], 'campfire']
	])('refuses %j (%s) without calling wrangler', (args, database) => {
		const { status, stderr, calls } = run(command[0], [...command.slice(1), ...args]);
		expect(status).not.toBe(0);
		expect(stderr).toContain(`is ${database} in wrangler.jsonc. Refusing`);
		expect(calls).toBe('');
	});

	it('goes on to wrangler for campfire-test and for --local', () => {
		for (const args of [['--env', 'test'], ['--local']]) {
			const { calls } = run(command[0], [...command.slice(1), ...args]);
			expect(calls).toMatch(/^d1 migrations apply campfire(-test)? /);
		}
	});
});

describe('seedSql', () => {
	const sqlite = migratedDatabase();
	sqlite.exec(seedSql(Date.now()));

	it('makes one org of fake people, every one at the reserved domain', () => {
		expect(sqlite.prepare('SELECT name FROM org').all()).toEqual([{ name: 'Campfire Test' }]);
		const users = sqlite.prepare('SELECT email FROM users').all() as { email: string }[];
		expect(users.map((u) => u.email).sort()).toEqual(
			Object.keys(people)
				.map((key) => `${key}@${emailDomain}`)
				.sort()
		);
		expect(count(sqlite, "members WHERE role = 'guest'")).toBe(1);
	});

	it('writes enough content for audits and timings', () => {
		expect(count(sqlite, 'projects')).toBe(3);
		expect(count(sqlite, 'posts')).toBeGreaterThanOrEqual(50);
		expect(count(sqlite, 'comments')).toBeGreaterThanOrEqual(150);
		expect(count(sqlite, 'notes')).toBe(5);
		expect(count(sqlite, 'chat_threads')).toBe(4);
		expect(count(sqlite, 'messages')).toBe(200);
		expect(count(sqlite, 'reactions')).toBeGreaterThan(0);
		expect(count(sqlite, 'message_reactions')).toBeGreaterThan(0);
		const perPerson = sqlite
			.prepare('SELECT count(*) AS n FROM notifications GROUP BY user_id')
			.all() as { n: number }[];
		expect(perPerson.length).toBe(6);
		expect(Math.min(...perPerson.map((p) => p.n))).toBeGreaterThanOrEqual(2);
	});

	it('writes the same content on every run', () => {
		const text = (sql: string) => sql.replace(/[0-9A-HJKMNP-TV-Z]{26}|\b\d{13}\b/g, '');
		expect(text(seedSql(1_700_000_000_000))).toBe(text(seedSql(1_800_000_000_000)));
	});

	it('wipes every app table, so the seed applies again', () => {
		const tables = sqlite.prepare('PRAGMA table_list').all();
		sqlite.exec(`BEGIN; ${wipeSql(tables)} COMMIT;`);
		expect(count(sqlite, 'users')).toBe(0);
		expect(count(sqlite, 'search_index')).toBe(0);
		sqlite.exec(seedSql(Date.now()));
		expect(count(sqlite, 'messages')).toBe(200);
	});

	it("keeps the migration history and Cloudflare's own tables", () => {
		const kept = ['d1_migrations', '_cf_KV', 'sqlite_sequence'].map((name) => ({
			schema: 'main',
			type: 'table',
			name
		}));
		expect(wipeSql(kept)).not.toContain('DELETE');
	});
});
