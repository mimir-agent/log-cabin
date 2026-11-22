import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const helper = resolve(import.meta.dirname, '../script/lib/deploy.mjs');
const run = (args: string[], input = '') =>
	spawnSync('node', [helper, ...args], { input, encoding: 'utf8' });

describe('deploy.mjs generate-secrets', () => {
	it('writes ATPROTO_CLIENT_KEY as a P-256 private JWK named for the day it was made', () => {
		const file = join(mkdtempSync(join(tmpdir(), 'secrets-')), 'secrets.json');
		const result = run(['generate-secrets', file, 'SESSION_SECRET', 'ATPROTO_CLIENT_KEY']);
		expect(result.status, result.stderr).toBe(0);
		const values = JSON.parse(readFileSync(file, 'utf8'));
		const key = JSON.parse(values.ATPROTO_CLIENT_KEY);
		const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
		expect(key).toMatchObject({
			kty: 'EC',
			crv: 'P-256',
			use: 'sig',
			alg: 'ES256',
			kid: `lc-${day}`
		});
		expect(key.d).toEqual(expect.any(String));
		expect(values.SESSION_SECRET).toMatch(/^[0-9a-f]{64}$/);
	});

	it('makes a different key each time', () => {
		const dir = mkdtempSync(join(tmpdir(), 'secrets-'));
		const made = [1, 2].map((n) => {
			run(['generate-secrets', join(dir, `${n}.json`), 'ATPROTO_CLIENT_KEY']);
			return JSON.parse(JSON.parse(readFileSync(join(dir, `${n}.json`), 'utf8')).ATPROTO_CLIENT_KEY)
				.d;
		});
		expect(made[0]).not.toBe(made[1]);
	});
});

describe('deploy.mjs missing-secrets', () => {
	it('lists ATPROTO_CLIENT_KEY when the Worker lacks it, and only then', () => {
		const names = ['SESSION_SECRET', 'ATPROTO_CLIENT_KEY'];
		const lacking = run(
			['missing-secrets', ...names],
			JSON.stringify([{ name: 'SESSION_SECRET' }])
		);
		expect(lacking.stdout).toBe('ATPROTO_CLIENT_KEY\n');
		const has = run(
			['missing-secrets', ...names],
			JSON.stringify([{ name: 'SESSION_SECRET' }, { name: 'ATPROTO_CLIENT_KEY' }])
		);
		expect(has.stdout).toBe('');
	});
});
