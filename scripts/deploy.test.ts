import { spawnSync } from 'node:child_process';
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
	existsSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = resolve(import.meta.dirname, '..');

// A copy of script/ and the real wrangler.jsonc, a build that passes --no-build's check, and
// a stand-in wrangler that logs each call and answers as an empty account: no database,
// bucket or queue yet. Nothing reaches Cloudflare.
function sandbox(secretList: 'new-worker' | string[]) {
	const dir = mkdtempSync(join(tmpdir(), 'deploy-'));
	cpSync(join(repo, 'script'), join(dir, 'script'), { recursive: true });
	cpSync(join(repo, 'wrangler.jsonc'), join(dir, 'wrangler.jsonc'));
	symlinkSync(join(repo, 'node_modules'), join(dir, 'node_modules'));
	writeFileSync(join(dir, 'package.json'), '{"scripts":{"build":"true"}}');
	for (const file of [
		'cloudflare/_worker.js',
		'cloudflare-tmp/server.js',
		'output/server/index.js',
		'cloudflare/_app/version.json',
		'cloudflare/_app/immutable/chunk.js'
	]) {
		const path = join(dir, '.svelte-kit', file);
		mkdirSync(join(path, '..'), { recursive: true });
		writeFileSync(path, 'x');
	}
	const stub = join(dir, 'wrangler.mjs');
	writeFileSync(
		stub,
		`import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const dir = ${JSON.stringify(dir)};
appendFileSync(dir + '/calls.log', args.join(' ') + '\\n');
const has = (...words) => words.every((word, i) => args[i] === word);
const reply = (text, code = 0) => { process.stdout.write(text); process.exit(code); };
if (has('whoami')) reply('{"loggedIn":true,"accounts":[{"id":"a","name":"A"}]}');
if (has('d1', 'create')) { writeFileSync(dir + '/database', args[2]); reply(''); }
if (has('d1', 'list')) reply(existsSync(dir + '/database')
	? JSON.stringify([{ name: readFileSync(dir + '/database', 'utf8'), uuid: '22222222-2222-2222-2222-222222222222' }])
	: '[]');
if (has('queues', 'info')) reply('Queue "' + args[2] + '" does not exist', 1);
if (has('secret', 'list')) {
	const names = ${JSON.stringify(secretList)};
	if (names === 'new-worker') { process.stderr.write('If this is a new Worker'); process.exit(1); }
	reply(JSON.stringify(names.map((name) => ({ name, type: 'secret_text' }))));
}
if (args[0] === 'deploy' && !args.includes('--dry-run')) {
	const file = args[args.indexOf('--secrets-file') + 1];
	if (args.includes('--secrets-file')) writeFileSync(dir + '/secrets-sent.json', readFileSync(file));
	reply('Deployed at https://worker.example.workers.dev\\n');
}
reply('');
`
	);
	return {
		dir,
		run(args: string[]) {
			const result = spawnSync(join(dir, 'script/deploy'), args, {
				env: {
					...process.env,
					WRANGLER: `node ${stub}`,
					WRANGLER_CONFIG: join(dir, 'wrangler.jsonc'),
					CLOUDFLARE_ACCOUNT_ID: ''
				},
				encoding: 'utf8'
			});
			return { ...result, out: result.stdout + result.stderr };
		},
		calls: () => readFileSync(join(dir, 'calls.log'), 'utf8'),
		secretsSent: () =>
			existsSync(join(dir, 'secrets-sent.json'))
				? (JSON.parse(readFileSync(join(dir, 'secrets-sent.json'), 'utf8')) as Record<
						string,
						string
					>)
				: null
	};
}

const allSecrets = [
	'SESSION_SECRET',
	'SETUP_TOKEN',
	'VAPID_PUBLIC_KEY',
	'VAPID_PRIVATE_KEY',
	'ATPROTO_CLIENT_KEY',
	'APP_URL'
];

describe('script/deploy', { timeout: 30_000 }, () => {
	it.each([
		['no arguments', [], 'campfire'],
		['--no-build', ['--no-build'], 'campfire'],
		['--env staging', ['--env', 'staging'], 'campfire-staging'],
		['--env=staging', ['--env=staging'], 'campfire-staging'],
		['--env test --no-build', ['--env', 'test', '--no-build'], 'campfire-test']
	])('still deploys with %s, and the first deploy makes every secret', (_name, args, worker) => {
		const world = sandbox('new-worker');
		const result = world.run(args);
		expect(result.out).toContain(`Deploying Worker ${worker}`);
		expect(result.status, result.out).toBe(0);
		expect(result.out).toContain('Deployed: https://worker.example.workers.dev');
		expect(Object.keys(world.secretsSent()!).sort()).toEqual(
			[
				'ATPROTO_CLIENT_KEY',
				'SESSION_SECRET',
				'SETUP_TOKEN',
				'VAPID_PRIVATE_KEY',
				'VAPID_PUBLIC_KEY'
			].sort()
		);
		expect(result.out).toContain(`Setup token: ${world.secretsSent()!.SETUP_TOKEN}`);
	});

	it('gives an existing deploy only the client key it lacks, and nothing when it has them all', () => {
		const upgrade = sandbox(allSecrets.filter((name) => name !== 'ATPROTO_CLIENT_KEY'));
		const result = upgrade.run(['--no-build']);
		expect(result.status, result.out).toBe(0);
		expect(Object.keys(upgrade.secretsSent()!)).toEqual(['ATPROTO_CLIENT_KEY']);
		expect(result.out).not.toContain('Setup token');

		const complete = sandbox(allSecrets);
		const second = complete.run(['--no-build']);
		expect(second.status, second.out).toBe(0);
		expect(second.out).toContain('Secrets are already set');
		expect(complete.secretsSent()).toBeNull();
	});

	it('deploys beta on its custom domain, and puts no APP_URL secret (it is in the config)', () => {
		const world = sandbox('new-worker');
		const result = world.run(['--env', 'beta', '--no-build']);
		expect(result.out).toContain('Deploying Worker campfire-beta');
		expect(result.status, result.out).toBe(0);
		expect(result.out).toContain('Deployed: https://cabin.yaaia.id');
		expect(world.calls()).not.toMatch(/^secret put APP_URL/m);

		// The address the script reports and the one the Worker reads must be the same host.
		const config = readFileSync(join(repo, 'wrangler.jsonc'), 'utf8');
		expect(config.match(/"beta": \{[\s\S]*?"APP_URL": "([^"]+)"/)?.[1]).toBe(
			'https://cabin.yaaia.id'
		);
	});

	it.each([
		['production', []],
		['staging', ['--env', 'staging']],
		['test', ['--env', 'test']]
	])('still puts the APP_URL secret on %s', (_name, args) => {
		const world = sandbox('new-worker');
		const result = world.run([...args, '--no-build']);
		expect(result.status, result.out).toBe(0);
		expect(world.calls()).toMatch(/^secret put APP_URL/m);
	});

	it('keeps its usage and refusals', () => {
		const world = sandbox('new-worker');
		expect(world.run(['--help']).status).toBe(0);
		expect(world.run(['--env', 'production']).status).toBe(2);
		expect(world.run(['--env']).status).toBe(2);
		expect(world.run(['--nope']).status).toBe(2);
		expect(world.run(['--env', 'prod']).out).toContain(
			'Expected --env staging, --env beta, --env test'
		);
	});
});
