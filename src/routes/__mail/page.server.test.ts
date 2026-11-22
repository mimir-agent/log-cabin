import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useTestEnv } from '#lib/server/testing/env.js';
import { load } from './+page.server';

// Enough of D1 for drizzle, over an in-memory SQLite with the real migration applied.
function fakeD1() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec(readFileSync('migrations/0001_core.sql', 'utf8'));
	const prepare = (sql: string) => ({
		bind: (...params: never[]) => ({
			run: async () => ({ success: true, meta: sqlite.prepare(sql).run(...params), results: [] }),
			all: async () => ({ success: true, meta: {}, results: sqlite.prepare(sql).all(...params) }),
			raw: async () => {
				const statement = sqlite.prepare(sql);
				statement.setReturnArrays(true);
				return statement.all(...params);
			}
		})
	});
	return { sqlite, d1: { prepare } as unknown as D1Database };
}

function visit(env: Partial<Env>, search: string) {
	useTestEnv(env);
	const event = { url: new URL(`https://campfire.test/__mail${search}`) };
	return load(event as unknown as Parameters<typeof load>[0]);
}

describe('/__mail', () => {
	it('answers 404 when MAIL_VIEWER_TOKEN is not set', async () => {
		const { d1 } = fakeD1();
		await expect(visit({ DB: d1 }, '?token=')).rejects.toMatchObject({ status: 404 });
	});

	it('answers 404 when the token is wrong or missing', async () => {
		const { d1 } = fakeD1();
		const env = { DB: d1, MAIL_VIEWER_TOKEN: 'secret' };
		await expect(visit(env, '?token=guess')).rejects.toMatchObject({ status: 404 });
		await expect(visit(env, '')).rejects.toMatchObject({ status: 404 });
	});

	it('lists the latest 50 messages, newest first, with the right token', async () => {
		const { sqlite, d1 } = fakeD1();
		const insert = sqlite.prepare(
			'INSERT INTO dev_mail (id, to_address, from_address, subject, text_body, html_body, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)'
		);
		for (let i = 1; i <= 52; i++) {
			insert.run(`m${i}`, 'ada@example.com', 'campfire@example.com', `Subject ${i}`, 'Body', i);
		}

		const data = await visit({ DB: d1, MAIL_VIEWER_TOKEN: 'secret' }, '?token=secret');

		const messages = (data as { messages: { subject: string }[] }).messages;
		expect(messages).toHaveLength(50);
		expect(messages[0]).toMatchObject({ subject: 'Subject 52', toAddress: 'ada@example.com' });
		expect(messages.at(-1)).toMatchObject({ subject: 'Subject 3' });
	});
});
