// A small Worker that backs up the beta database to its own R2 bucket, on its own schedule and apart from
// the app's releases, so a bad release can't stop it.
//
//   scheduled   every day: writes daily/<date>.sql.gz
//   POST /run?label=pre-migration-<id>   (Authorization: Bearer <BACKUP_TOKEN>): writes <label>/<time>.sql.gz
//   GET  /latest                         (same header): the newest daily backup's key, time and size
//   anything else answers 404
//
// What a backup holds: every ordinary table, as INSERT OR REPLACE statements, in one gzip file. It leaves out the
// search index (FTS5 virtual tables can't be exported; script/reindex rebuilds it) and SQLite's own tables. To
// restore: make a database, apply the migrations, run the file against it, then script/reindex. docs/beta.md has
// the steps.
//
// Bindings: DB (the beta D1 database), BUCKET (the backups bucket), BACKUP_TOKEN (secret).

const PAGE = 200;

/** Quoted SQL name. */
const q = (name) => `"${name.replaceAll('"', '""')}"`;

async function listTables(db) {
	const { results } = await db
		.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name")
		.all();
	const virtual = results
		.filter((r) => /^CREATE VIRTUAL TABLE/i.test(r.sql ?? ''))
		.map((r) => r.name);
	const skip = (name) =>
		name.startsWith('sqlite_') ||
		name.startsWith('_cf_') ||
		virtual.some((v) => name === v || name.startsWith(`${v}_`));
	return results.map((r) => r.name).filter((name) => !skip(name));
}

/** Tables with the ones other tables point at first, so a restore works even where foreign keys are checked per statement. */
async function inLoadOrder(db, tables) {
	const parents = new Map();
	for (const table of tables) {
		const { results } = await db.prepare(`PRAGMA foreign_key_list(${q(table)})`).all();
		parents.set(
			table,
			[...new Set(results.map((r) => r.table))].filter((p) => p !== table)
		);
	}
	const ordered = [];
	const seen = new Set();
	const visit = (table) => {
		if (seen.has(table) || !parents.has(table)) return;
		seen.add(table); // a cycle between tables stops here; the PRAGMA at the top of the file covers it
		for (const parent of parents.get(table)) visit(parent);
		ordered.push(table);
	};
	for (const table of tables) visit(table);
	return ordered;
}

async function* dumpLines(db, tables, counts) {
	for (const table of tables) {
		const { results: info } = await db.prepare(`PRAGMA table_xinfo(${q(table)})`).all();
		// hidden: 0 is an ordinary column; generated columns can't be written.
		const columns = info.filter((c) => c.hidden === 0).map((c) => c.name);
		const list = columns.map(q).join(', ');
		const values = columns.map((c) => `quote(${q(c)})`).join(" || ',' || ");
		counts[table] = 0;
		for (let offset = 0; ; offset += PAGE) {
			const { results } = await db
				.prepare(
					`SELECT 'INSERT OR REPLACE INTO ${q(table).replaceAll("'", "''")} (${list.replaceAll("'", "''")}) VALUES (' || ${values} || ');' AS line FROM ${q(table)} LIMIT ${PAGE} OFFSET ${offset}`
				)
				.all();
			for (const row of results) yield row.line;
			counts[table] += results.length;
			if (results.length < PAGE) break;
		}
	}
}

async function latestMigration(db) {
	try {
		const row = await db.prepare('SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1').first();
		return row?.name ?? 'none';
	} catch {
		return 'none';
	}
}

/** Writes one backup and returns what it holds. */
export async function backup(env, prefix, now = new Date()) {
	const tables = await inLoadOrder(env.DB, await listTables(env.DB));
	const counts = {};
	const migration = await latestMigration(env.DB);
	const lines = [
		`-- backup of the beta database at ${now.toISOString()}`,
		`-- latest migration: ${migration}`,
		'PRAGMA defer_foreign_keys = TRUE;'
	];
	for await (const line of dumpLines(env.DB, tables, counts)) lines.push(line);
	const text = `${lines.join('\n')}\n`;
	const body = await new Response(
		new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
	).arrayBuffer();
	const stamp = now
		.toISOString()
		.replace(/[:]/g, '-')
		.replace(/\.\d+Z$/, 'Z');
	const key =
		prefix === 'daily' ? `daily/${stamp.slice(0, 10)}.sql.gz` : `${prefix}/${stamp}.sql.gz`;
	const rows = Object.values(counts).reduce((a, b) => a + b, 0);
	await env.BUCKET.put(key, body, {
		customMetadata: { rows: String(rows), tables: String(tables.length), migration }
	});
	return { key, bytes: body.byteLength, tables: tables.length, rows, migration, counts };
}

const authorized = (request, env) =>
	Boolean(env.BACKUP_TOKEN) &&
	request.headers.get('authorization') === `Bearer ${env.BACKUP_TOKEN}`;

export default {
	async scheduled(_event, env) {
		const result = await backup(env, 'daily');
		console.log(
			`backup ${result.key}: ${result.bytes} bytes, ${result.tables} tables, ${result.rows} rows, migration ${result.migration}`
		);
	},

	async fetch(request, env) {
		const url = new URL(request.url);
		if (!authorized(request, env)) return new Response('Not found', { status: 404 });
		if (request.method === 'POST' && url.pathname === '/run') {
			const label = url.searchParams.get('label') ?? '';
			if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(label) || label === 'daily') {
				return new Response('Expected label=<lowercase letters, digits, dashes>', { status: 400 });
			}
			return Response.json(await backup(env, label));
		}
		if (request.method === 'GET' && url.pathname === '/latest') {
			const { objects } = await env.BUCKET.list({ prefix: 'daily/' });
			const newest = objects.sort((a, b) => b.key.localeCompare(a.key))[0];
			return Response.json(
				newest
					? {
							key: newest.key,
							uploaded: newest.uploaded.toISOString(),
							bytes: newest.size,
							...newest.customMetadata
						}
					: { key: null }
			);
		}
		return new Response('Not found', { status: 404 });
	}
};
