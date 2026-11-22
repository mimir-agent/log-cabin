// Fills a database with the "Campfire Test" org: six fake people and enough projects, posts,
// notes and chat for tests, audits and timings to mean something. The text is generated from a
// fixed seed, so every run writes the same content; ids and times follow the clock, so the feed
// looks recent and a reseeded note never meets an old note's saved document.
//
//   node scripts/seed-test.js --local      the local database `wrangler dev --local` uses
//   node scripts/seed-test.js --env test   the campfire-test D1 database
//   --reset                                empties every app table first
//
// It refuses any remote database but campfire-test, before running wrangler at all.
//
// Environment:
//   WRANGLER         command that runs wrangler (default: "pnpm exec wrangler")
//   WRANGLER_CONFIG  config file to read (default: wrangler.jsonc)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { unstable_readConfig } from 'wrangler';

const testDatabase = 'campfire-test';
export const emailDomain = 'campfire-test.example';

function main() {
	const { values } = parseArgs({
		options: {
			local: { type: 'boolean', default: false },
			env: { type: 'string' },
			reset: { type: 'boolean', default: false }
		}
	});
	const config = process.env.WRANGLER_CONFIG ?? 'wrangler.jsonc';
	const database = unstable_readConfig({ config, env: values.env }).d1_databases[0].database_name;
	if (!values.local && database !== testDatabase) {
		console.error(
			`Expected the ${testDatabase} database or --local; ${values.env ? `--env ${values.env}` : 'no --env'} is ${database} in ${config}. Refusing: tests never write to it.`
		);
		process.exit(1);
	}

	const [command, ...prefix] = (process.env.WRANGLER ?? 'pnpm exec wrangler').split(' ');
	const target = [
		'--config',
		config,
		...(values.env ? ['--env', values.env] : []),
		...(values.local ? ['--local'] : ['--remote'])
	];
	const wrangler = (...args) =>
		execFileSync(command, [...prefix, ...args, ...target], {
			encoding: 'utf8',
			env: { ...process.env, CI: 'true' },
			stdio: ['ignore', 'pipe', 'inherit']
		});

	wrangler('d1', 'migrations', 'apply', database);
	if (values.reset) {
		const [{ results }] = JSON.parse(
			wrangler('d1', 'execute', database, '--json', '--command', 'PRAGMA table_list')
		);
		wrangler('d1', 'execute', database, '--command', wipeSql(results));
	}
	const file = join(mkdtempSync(join(tmpdir(), 'seed-test-')), 'seed.sql');
	writeFileSync(file, seedSql(Date.now()));
	wrangler('d1', 'execute', database, '--file', file);
	console.log(`Seeded ${database} (${values.local ? 'local' : 'remote'})`);
}

/**
 * Deletes every row the app wrote. Schema, migration history and Cloudflare's own tables stay,
 * and so does search_vocab: fts5vocab's read-only list of search_index's words, which empties
 * with it.
 */
export function wipeSql(tables) {
	const app = tables.filter(
		(t) =>
			t.schema === 'main' &&
			(t.type === 'table' || t.type === 'virtual') &&
			!/^(sqlite_|_cf_|d1_migrations$|search_vocab$)/.test(t.name)
	);
	return ['PRAGMA defer_foreign_keys = on;', ...app.map((t) => `DELETE FROM "${t.name}";`)].join(
		'\n'
	);
}

export const people = {
	ada: { name: 'Ada Moreno', role: 'admin' },
	ben: { name: 'Ben Okafor', role: 'member' },
	cleo: { name: 'Cleo Hart', role: 'member' },
	dev: { name: 'Dev Sharma', role: 'member' },
	fay: { name: 'Fay Lindqvist', role: 'member' },
	eli: { name: 'Eli Brandt', role: 'guest' }
};

// mulberry32: a small PRNG, so the same seed gives the same content everywhere.
function random(seed) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const subjects = [
	'the beta',
	'the onboarding flow',
	'the pricing page',
	'search',
	'the mobile layout',
	'the release notes',
	'the importer',
	'the weekly sync',
	'the help center',
	'invoices',
	'the sign-up form',
	'dark mode'
];
const verbs = [
	'ship',
	'review',
	'test',
	'trim',
	'rewrite',
	'measure',
	'sketch',
	'split',
	'document',
	'pause'
];
const whens = [
	'by Friday',
	'next week',
	'before the demo',
	'after the freeze',
	'this sprint',
	'tomorrow morning'
];
const openers = [
	'I think we should',
	'Can we',
	'Let us',
	'We could',
	'Someone should',
	'I would like to'
];
const remarks = [
	'Sounds good to me.',
	'Agreed, with one caveat.',
	'I can take this.',
	'Not sure yet, let me check.',
	'Ship it.',
	'Can we see numbers first?',
	'Done on my side.',
	'This blocks the next step.',
	'Nice work.',
	'I left notes inline.'
];
const emoji = ['👍', '🎉', '👀', '❤️', '🔥', '✅'];

/** The seed as SQL statements, with times counted back from now. */
export function seedSql(now) {
	const rand = random(20261118);
	const pick = (list) => list[Math.floor(rand() * list.length)];
	const sample = (list, n) => [...list].sort(() => rand() - 0.5).slice(0, n);
	const sentence = () => `${pick(openers)} ${pick(verbs)} ${pick(subjects)} ${pick(whens)}.`;
	const paragraph = (n) => Array.from({ length: n }, sentence).join(' ');
	const doc = (text) =>
		JSON.stringify({
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
		});

	// A ULID for a time: 10 characters of milliseconds, then 16 from the PRNG.
	const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
	const id = (time) => {
		let out = '';
		for (let i = 0, t = time; i < 10; i++, t = Math.floor(t / 32)) out = alphabet[t % 32] + out;
		for (let i = 0; i < 16; i++) out += alphabet[Math.floor(rand() * 32)];
		return out;
	};
	const day = 86_400_000;
	let clock = now - 20 * day;
	const tick = (ms) => (clock += Math.floor(ms * (0.5 + rand())));

	const rows = {};
	const add = (table, row) => (rows[table] ??= []).push(row);

	const start = tick(0);
	add('org', { id: 1, name: 'Campfire Test', created_at: start });
	const user = {};
	for (const [key, person] of Object.entries(people)) {
		user[key] = id(start);
		add('users', {
			id: user[key],
			email: `${key}@${emailDomain}`,
			name: person.name,
			username: key,
			created_at: start
		});
		// Seeded people are long-standing members, past onboarding.
		add('members', {
			id: id(start),
			user_id: user[key],
			role: person.role,
			created_at: start,
			onboarded_at: start
		});
	}
	const staff = Object.keys(people).filter((key) => people[key].role !== 'guest');

	const projects = ['Launch Plan', 'Field Notes', 'Support Desk'].map((name, i) => {
		const project = { id: id(start), people: i === 0 ? [...staff, 'eli'] : staff };
		add('projects', {
			id: project.id,
			name,
			description: `Fake project ${i + 1} for tests.`,
			created_by: user.ada,
			created_at: start
		});
		for (const key of project.people) {
			add('project_members', { project_id: project.id, user_id: user[key], created_at: start });
		}
		return project;
	});

	const react = (subjectType, subjectId, who, at) => {
		for (const key of sample(who, Math.floor(rand() * 4))) {
			add('reactions', {
				id: id(at),
				subject_type: subjectType,
				subject_id: subjectId,
				user_id: user[key],
				emoji: pick(emoji),
				created_at: at
			});
		}
	};

	const capital = (word) => word[0].toUpperCase() + word.slice(1);
	const posts = [];
	for (let n = 0; n < 54; n++) {
		const project = projects[n % 3];
		const created = tick(day / 3);
		const post = {
			id: id(created),
			project,
			title: `${capital(pick(verbs))} ${pick(subjects)} ${pick(whens)}`,
			comments: []
		};
		const body = paragraph(3);
		const row = {
			id: post.id,
			project_id: project.id,
			author_id: user[pick(project.people)],
			title: post.title,
			body: doc(body),
			body_text: body,
			created_at: created,
			last_activity_at: created
		};
		add('posts', row);
		react('post', post.id, project.people, created);
		for (let c = 0; c < 3; c++) {
			const at = created + (c + 1) * Math.floor(day / 12);
			const comment = { id: id(at), author: pick(project.people) };
			const text = pick(remarks);
			add('comments', {
				id: comment.id,
				post_id: post.id,
				parent_id: c === 2 ? post.comments[0].id : null,
				author_id: user[comment.author],
				body: doc(text),
				body_text: text,
				created_at: at
			});
			react('comment', comment.id, project.people, at);
			post.comments.push(comment);
			row.last_activity_at = at;
		}
		posts.push(post);
	}
	for (let n = 0; n < 5; n++) {
		const created = now - (5 - n) * day;
		const author = staff[n];
		const text = paragraph(6);
		const shared = n < 2 ? projects[n] : null;
		const note = id(created);
		add('notes', {
			id: note,
			author_id: user[author],
			title: `Notes on ${pick(subjects)}`,
			body: doc(text),
			body_text: text,
			project_id: shared?.id ?? null,
			project_permission: shared ? (n === 0 ? 'edit' : 'view') : 'none',
			created_at: created,
			updated_at: created,
			updated_by: user[author]
		});
		if (n === 2)
			add('note_shares', {
				note_id: note,
				user_id: user.ben,
				permission: 'edit',
				created_at: created
			});
	}

	const threads = [
		{ who: ['ada', 'ben'] },
		{ who: ['cleo', 'dev'] },
		{ who: ['ada', 'ben', 'cleo', 'fay'], title: 'Design crit' },
		{ who: staff, title: 'Release room' }
	];
	const messages = [];
	for (const thread of threads) {
		clock = now - 3 * day;
		const created = tick(0);
		thread.id = id(created);
		const row = {
			id: thread.id,
			title: thread.title ?? null,
			dm_key: thread.title
				? null
				: thread.who
						.map((key) => user[key])
						.sort()
						.join(':'),
			created_by: user[thread.who[0]],
			created_at: created,
			last_message_at: created
		};
		add('chat_threads', row);
		const ids = [];
		for (let m = 0; m < 50; m++) {
			const at = tick(day / 20);
			const message = { id: id(at), thread, author: pick(thread.who), at };
			const text = rand() < 0.5 ? pick(remarks) : sentence();
			add('messages', {
				id: message.id,
				thread_id: thread.id,
				author_id: user[message.author],
				reply_to_id: m % 10 === 9 ? ids[m - 3] : null,
				body: doc(text),
				body_text: text,
				created_at: at
			});
			for (const key of sample(thread.who, Math.floor(rand() * 3))) {
				add('message_reactions', {
					message_id: message.id,
					user_id: user[key],
					emoji: pick(emoji),
					created_at: at
				});
			}
			ids.push(message.id);
			messages.push(message);
			row.last_message_at = at;
		}
		for (const key of thread.who) {
			add('chat_thread_members', {
				thread_id: thread.id,
				user_id: user[key],
				last_read_at: row.last_message_at - day / 4,
				created_at: created
			});
		}
	}

	// A few for each person: comments on posts they can see, and a chat message if they chat.
	for (const key of Object.keys(people)) {
		const message = messages.findLast((m) => m.thread.who.includes(key) && m.author !== key);
		const visible = posts.filter((post) => post.project.people.includes(key));
		const onPosts = sample(visible, message ? 2 : 3)
			.map((post) => ({ post, comment: post.comments.find((c) => c.author !== key) }))
			.filter(({ comment }) => comment);
		onPosts.forEach(({ post, comment }, i) => {
			add('notifications', {
				id: id(now - i * 3_600_000),
				user_id: user[key],
				actor_id: user[comment.author],
				kind: 'comment',
				item_key: `post:${post.id}`,
				url: `/posts/${post.id}#comment-${comment.id}`,
				title: post.title,
				source: `comment.created:${comment.id}`,
				created_at: now - i * 3_600_000,
				read_at: i === 1 ? now : null
			});
		});
		if (message) {
			add('notifications', {
				id: id(message.at),
				user_id: user[key],
				actor_id: user[message.author],
				kind: 'message',
				item_key: `thread:${message.thread.id}`,
				url: `/chat/${message.thread.id}`,
				title: null,
				source: `message.created:${message.id}`,
				created_at: message.at
			});
		}
	}

	return Object.entries(rows)
		.map(([table, list]) => {
			const columns = Object.keys(Object.assign({}, ...list));
			const values = list.map((row) => `(${columns.map((c) => sqlValue(row[c])).join(', ')})`);
			return `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${values.join(',\n')};`;
		})
		.join('\n');
}

function sqlValue(value) {
	if (value === null || value === undefined) return 'NULL';
	if (typeof value === 'number') return String(value);
	return `'${String(value).replaceAll("'", "''")}'`;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
