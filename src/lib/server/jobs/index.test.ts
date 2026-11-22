import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobMessage } from '../events';
import { consumeJobs, handlers } from './index';

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

const job: JobMessage = {
	kind: 'post.updated',
	postId: 'p1',
	projectId: 'pr1',
	authorId: 'u1',
	emittedAt: 1
};

async function consume(body: JobMessage) {
	const { sqlite, d1 } = fakeD1();
	const message = { body, ack: vi.fn(), retry: vi.fn() };
	const batch = { messages: [message] } as unknown as MessageBatch<JobMessage>;
	await consumeJobs(batch, { DB: d1 } as unknown as Env);
	const log = sqlite.prepare('SELECT kind, payload, status, error FROM job_log').all();
	return { message, log };
}

afterEach(() => {
	delete handlers['post.updated'];
});

describe('consumeJobs', () => {
	it('acks a kind with no handler and logs it as unhandled', async () => {
		const { message, log } = await consume(job);
		expect(message.ack).toHaveBeenCalled();
		expect(message.retry).not.toHaveBeenCalled();
		expect(log).toEqual([
			{ kind: 'post.updated', payload: JSON.stringify(job), status: 'unhandled', error: null }
		]);
	});

	it('runs the handler, acks, and logs done when the handler succeeds', async () => {
		const handler = vi.fn(async () => {});
		handlers['post.updated'] = handler;
		const { message, log } = await consume(job);
		expect(handler).toHaveBeenCalledWith(expect.anything(), job);
		expect(message.ack).toHaveBeenCalled();
		expect(log).toEqual([expect.objectContaining({ status: 'done', error: null })]);
	});

	it('retries and logs failed with the error message when the handler throws', async () => {
		handlers['post.updated'] = async () => {
			throw new Error('post p1 not found');
		};
		const { message, log } = await consume(job);
		expect(message.retry).toHaveBeenCalled();
		expect(message.ack).not.toHaveBeenCalled();
		expect(log).toEqual([
			expect.objectContaining({ status: 'failed', error: 'post p1 not found' })
		]);
	});
});
