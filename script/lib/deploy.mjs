// Helpers for script/deploy. Each command reads its input from argv or stdin and prints plain text.
//
//   config <config> <env|"">               worker, database, database id, bucket and queue, one per line
//   app-url <config> <env|"">              https://<host> of the custom domain, or nothing without one
//   set-database-id <config> <name> <id>   writes the id into the block for that database, keeping comments
//   accounts                               stdin: `wrangler whoami --json`; prints "id<TAB>name" per account
//   database-id <name>                     stdin: `wrangler d1 list --json`; prints the id, or nothing
//   missing-secrets <name...>              stdin: `wrangler secret list --format json`; prints absent names
//                                          (both VAPID keys if either is absent: they work only as a pair)
//   generate-secrets <file> <name...>      writes generated values as JSON to <file>; prints SETUP_TOKEN if made
//                                          (ATPROTO_CLIENT_KEY is an ES256 private JWK whose kid is lc-YYYYMMDD)
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { unstable_readConfig } from 'wrangler';

const [command, ...args] = process.argv.slice(2);
const stdin = () => readFileSync(0, 'utf8');

function fail(message) {
	console.error(message);
	process.exit(1);
}

function readConfig(config, env) {
	return unstable_readConfig({ config, env: env || undefined });
}

function vapidKeys() {
	const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
	const { x, y } = publicKey.export({ format: 'jwk' });
	const { d } = privateKey.export({ format: 'jwk' });
	const point = Buffer.concat([
		Buffer.from([4]),
		Buffer.from(x, 'base64url'),
		Buffer.from(y, 'base64url')
	]);
	return { VAPID_PUBLIC_KEY: point.toString('base64url'), VAPID_PRIVATE_KEY: d };
}

function atprotoClientKey() {
	const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
	const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
	const jwk = {
		...privateKey.export({ format: 'jwk' }),
		kid: `lc-${day}`,
		use: 'sig',
		alg: 'ES256'
	};
	return JSON.stringify(jwk);
}

const commands = {
	config([config, env]) {
		const c = readConfig(config, env);
		const [db] = c.d1_databases;
		const [bucket] = c.r2_buckets;
		const [queue] = c.queues.producers;
		console.log(
			[c.name, db.database_name, db.database_id, bucket.bucket_name, queue.queue].join('\n')
		);
	},

	'set-database-id'([config, name, id]) {
		const text = readFileSync(config, 'utf8');
		const block = new RegExp(
			`("database_name"\\s*:\\s*"${name}"[^}]*?"database_id"\\s*:\\s*")[^"]*(")`
		);
		if (!block.test(text)) {
			fail(`Expected a "database_id" after "database_name": "${name}" in ${config}; found none.`);
		}
		writeFileSync(config, text.replace(block, `$1${id}$2`));
	},

	'app-url'([config, env]) {
		const c = readConfig(config, env);
		const domain = (c.routes ?? []).find((r) => typeof r === 'object' && r.custom_domain);
		if (domain) console.log(`https://${domain.pattern}`);
	},

	accounts() {
		for (const account of JSON.parse(stdin()).accounts)
			console.log(`${account.id}\t${account.name}`);
	},

	'database-id'([name]) {
		const database = JSON.parse(stdin()).find((db) => db.name === name);
		if (database) console.log(database.uuid);
	},

	'missing-secrets'(names) {
		const present = new Set(JSON.parse(stdin()).map((secret) => secret.name));
		const vapid = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'];
		const vapidMissing = vapid.some((name) => !present.has(name));
		for (const name of names) {
			if (vapid.includes(name) ? vapidMissing : !present.has(name)) console.log(name);
		}
	},

	'generate-secrets'([file, ...names]) {
		const values = {};
		for (const name of names) {
			if (name === 'VAPID_PUBLIC_KEY') Object.assign(values, vapidKeys());
			else if (name === 'ATPROTO_CLIENT_KEY') values[name] = atprotoClientKey();
			else if (name !== 'VAPID_PRIVATE_KEY') values[name] = randomBytes(32).toString('hex');
		}
		writeFileSync(file, JSON.stringify(values), { mode: 0o600 });
		if (values.SETUP_TOKEN) console.log(values.SETUP_TOKEN);
	}
};

if (!commands[command])
	fail(`Expected one of: ${Object.keys(commands).join(', ')}; got "${command}".`);
commands[command](args);
