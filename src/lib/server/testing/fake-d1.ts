import { useTestEnv } from './env';
// An in-memory D1 for tests: node:sqlite behind the slice of the D1 API drizzle calls,
// with every migration in migrations/ applied in order, so queries run against the real schema.
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

// D1 refuses a statement with more bound parameters than this (developers.cloudflare.com/d1/platform/limits).
const maxBoundParameters = 100;

class FakeStatement {
	constructor(
		private sqlite: DatabaseSync,
		private sql: string,
		private params: SQLInputValue[] = []
	) {}

	bind(...params: SQLInputValue[]) {
		if (params.length > maxBoundParameters) {
			throw new Error(
				`fake D1: expected at most ${maxBoundParameters} bound parameters, as D1 allows, got ${params.length} for: ${this.sql}`
			);
		}
		return new FakeStatement(this.sqlite, this.sql, params);
	}

	async all() {
		return { results: this.sqlite.prepare(this.sql).all(...this.params), success: true, meta: {} };
	}

	async raw() {
		const statement = this.sqlite.prepare(this.sql);
		statement.setReturnArrays(true);
		return statement.all(...this.params);
	}

	async run() {
		this.sqlite.prepare(this.sql).run(...this.params);
		return { results: [], success: true, meta: {} };
	}

	async first() {
		return this.sqlite.prepare(this.sql).get(...this.params) ?? null;
	}
}

/** until: apply only the migrations whose file names sort before it, to test the next one. */
export function fakeD1(options: { until?: string } = {}) {
	const sqlite = new DatabaseSync(':memory:');
	const migrations = readdirSync('migrations').filter(
		(f) => f.endsWith('.sql') && (options.until === undefined || f < options.until)
	);
	for (const file of migrations.sort()) {
		sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
	}
	// Every statement's SQL, in order, for tests that count queries or check their plans.
	const queries: string[] = [];
	const d1 = {
		prepare: (sql: string) => {
			queries.push(sql);
			return new FakeStatement(sqlite, sql);
		},
		async batch(statements: FakeStatement[]) {
			sqlite.exec('BEGIN');
			try {
				const results = [];
				for (const statement of statements) results.push(await statement.all());
				sqlite.exec('COMMIT');
				return results;
			} catch (e) {
				sqlite.exec('ROLLBACK');
				throw e;
			}
		}
	};
	return { DB: d1 as unknown as D1Database, sqlite, queries };
}

/** The plan steps that read a whole table rather than searching an index, e.g. "SCAN reactions". */
export function tableScans(sqlite: DatabaseSync, sql: string): string[] {
	const plan = sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as { detail: string }[];
	return plan.map((step) => step.detail).filter((detail) => /^SCAN \w+$/.test(detail));
}

/** An Env with only DB filled in, plus whatever vars a test sets. */
// Builds a fresh env and makes it the one getEnv() returns.
export function fakeEnv(vars: Partial<Env> = {}): Env {
	const env = { ...vars, DB: fakeD1().DB } as Env;
	useTestEnv(env);
	return env;
}
