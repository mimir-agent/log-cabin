// Starts the built Worker under `wrangler dev` with a fresh local database for the
// end-to-end tests: migrations applied, then the people, project, notes and threads in fixtures.ts.
// Run `pnpm build` first; `pnpm test:e2e` does both.
import { execFileSync, spawn } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import {
	call,
	camp,
	cave,
	comment,
	crew,
	devVars,
	endingCalls,
	images,
	notes,
	pastCall,
	people,
	persistTo,
	photos,
	port,
	post,
	posts,
	project,
	snow,
	threads,
	yard,
	zoned,
	type Person
} from './fixtures.ts';

const local = ['--local', '--persist-to', persistTo];
const wrangler = (...args: string[]) =>
	execFileSync('pnpm', ['exec', 'wrangler', ...args, ...local], { stdio: 'inherit' });
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const row = (values: (string | number)[]) =>
	`(${values.map((v) => (typeof v === 'number' ? v : `'${v.replaceAll("'", "''")}'`)).join(', ')})`;
const insert = (table: string, columns: string, rows: (string | number)[][]) =>
	`INSERT INTO ${table} (${columns}) VALUES ${rows.map(row).join(', ')};`;
const docOf = (text: string) =>
	JSON.stringify({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});
/** A solid 32×32 PNG in one colour, so each seeded image looks different. */
function png([r, g, b]: number[]): Buffer {
	const chunk = (type: string, data: Buffer) => {
		const body = Buffer.concat([Buffer.from(type), data]);
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body));
		return Buffer.concat([length, body, crc]);
	};
	const size = 32;
	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
	const row = Buffer.from([0, ...Array.from({ length: size }, () => [r, g, b]).flat()]);
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))),
		chunk('IEND', Buffer.alloc(0))
	]);
}
const colours = [
	[230, 120, 40],
	[40, 140, 200],
	[60, 170, 90],
	[180, 60, 160]
];

/** What happened at each of `zoned`'s moments; the inbox items and the thread are read. */
function zonedRows() {
	const moments = Object.entries(zoned.at) as ['pacific' | 'tokyo', number][];
	const { ada, dee } = people;
	return [
		insert('chat_threads', 'id, dm_key, created_by, created_at, last_message_at', [
			[zoned.threadId, [ada.id, dee.id].sort().join(':'), dee.id, zoned.at.tokyo, zoned.at.pacific]
		]),
		insert('chat_thread_members', 'thread_id, user_id, last_read_at, created_at', [
			[zoned.threadId, ada.id, now, zoned.at.tokyo],
			[zoned.threadId, dee.id, now, zoned.at.tokyo]
		]),
		...moments.flatMap(([moment, at]) => {
			const id = (kind: Parameters<typeof zoned.id>[0]) => zoned.id(kind, moment);
			const text = `At the ${moment} moment`;
			return [
				insert('messages', 'id, thread_id, author_id, body, body_text, created_at', [
					[id('MSG'), zoned.threadId, dee.id, docOf(text), text, at]
				]),
				insert('calls', 'id, thread_id, started_by, started_at, ended_at', [
					[id('CA11'), zoned.threadId, ada.id, at, at + 600_000]
				]),
				insert('call_participants', 'id, call_id, user_id, session_id, joined_at, left_at', [
					[id('PART'), id('CA11'), ada.id, `e2e-session-${moment}`, at, at + 600_000]
				]),
				insert(
					'posts',
					'id, project_id, author_id, title, body, body_text, created_at, last_activity_at',
					[[id('P0ST'), project.id, ada.id, text, docOf(text), text, at, at]]
				),
				insert(
					'notes',
					'id, author_id, title, body, body_text, created_at, updated_at, updated_by',
					[[id('N0TE'), ada.id, text, docOf(text), text, at, at, ada.id]]
				),
				insert(
					'notifications',
					'id, user_id, actor_id, kind, item_key, url, title, source, created_at, read_at',
					[
						[
							id('NT1F'),
							ada.id,
							dee.id,
							'post',
							`post:${id('P0ST')}`,
							`/posts/${id('P0ST')}`,
							text,
							`post.created:${id('P0ST')}`,
							at,
							now
						]
					]
				)
			];
		})
	];
}

/** The colour of the org's own emoji. */
const emojiColour = [250, 240, 220];

/** The snow note in Trail, Bo's comment on it, its link's fetched preview and the org's emoji. */
function snowRows() {
	const { note, comment, link, emoji } = snow;
	const { ada, bo } = people;
	// Fetched just now, so the server answers from it and never goes to the web.
	const preview = { kind: 'page', ...link, image: null, domain: new URL(link.url).hostname };
	return [
		insert(
			'notes',
			'id, author_id, title, body, body_text, project_id, project_permission, created_at, updated_at, updated_by',
			[
				[
					note.id,
					ada.id,
					note.title,
					JSON.stringify(note.body),
					note.text,
					snow.project.id,
					'view',
					now,
					now,
					ada.id
				]
			]
		),
		insert('note_shares', 'note_id, user_id, permission, created_at', [
			[note.id, bo.id, 'edit', now]
		]),
		insert('note_comments', 'id, note_id, author_id, body, body_text, created_at', [
			[comment.id, note.id, bo.id, docOf(comment.text), comment.text, now]
		]),
		insert('link_previews', 'url, preview, fetched_at', [[link.url, JSON.stringify(preview), now]]),
		insert('custom_emoji', 'id, name, content_type, size, created_by, created_at', [
			[emoji.id, emoji.name, 'image/png', png(emojiColour).length, ada.id, now]
		])
	];
}

rmSync(persistTo, { recursive: true, force: true });
wrangler('d1', 'migrations', 'apply', 'campfire');

const now = Date.now();
const everyone = Object.values(people);
const sql = [
	insert('org', 'id, name, created_at', [[1, 'Campfire', now]]),
	insert(
		'users',
		'id, email, name, username, created_at',
		everyone.map((p) => {
			const username = p.name.toLowerCase();
			return [p.id, `${username}@example.com`, p.name, username, now];
		})
	),
	insert(
		'members',
		'id, user_id, role, created_at, onboarded_at',
		everyone.map((p) => [`m-${p.id}`, p.id, p.role, now, now])
	),
	insert('projects', 'id, name, created_by, created_at', [
		[project.id, project.name, people.ada.id, now],
		[camp.id, camp.name, people.bo.id, now]
	]),
	insert('project_members', 'project_id, user_id, created_at', [[project.id, people.ada.id, now]]),
	insert('projects', 'id, name, private, created_by, created_at', [
		[cave.id, cave.name, 1, people.ada.id, now]
	]),
	insert(
		'project_members',
		'project_id, user_id, created_at',
		cave.members.map((who) => [cave.id, people[who].id, now])
	),
	insert(
		'posts',
		'id, project_id, author_id, title, body, body_text, created_at, last_activity_at',
		[
			[
				cave.post.id,
				cave.id,
				people.ada.id,
				cave.post.title,
				docOf(cave.post.text),
				cave.post.text,
				now,
				now
			]
		]
	),
	insert(
		'posts',
		'id, project_id, author_id, title, body, body_text, created_at, last_activity_at',
		[[post.id, project.id, people.bo.id, post.title, docOf(post.text), post.text, now, now]]
	),
	insert('comments', 'id, post_id, author_id, body, body_text, created_at', [
		[post.comment.id, post.id, people.bo.id, docOf(post.comment.text), post.comment.text, now]
	]),
	insert('reactions', 'id, subject_type, subject_id, user_id, emoji, created_at', [
		[`r-${post.id}`, 'post', post.id, people.bo.id, '👍', now]
	]),
	insert('notifications', 'id, user_id, actor_id, kind, item_key, url, title, source, created_at', [
		[
			post.notification,
			people.ada.id,
			people.bo.id,
			'comment',
			`post:${post.id}`,
			`/posts/${post.id}`,
			post.title,
			`comment.created:${post.comment.id}`,
			now
		]
	]),
	insert(
		'sessions',
		'token_hash, user_id, expires_at, created_at',
		everyone.map((p) => [sha256(p.token), p.id, now + 86_400_000, now])
	),
	...Object.values(notes).flatMap((note) => [
		insert('notes', 'id, author_id, title, body, body_text, created_at, updated_at, updated_by', [
			[
				note.id,
				people.ada.id,
				note.title,
				JSON.stringify(note.body),
				note.text,
				now,
				now,
				people.ada.id
			]
		]),
		...note.shares.map(([who, permission]) =>
			insert('note_shares', 'note_id, user_id, permission, created_at', [
				[note.id, people[who].id, permission, now]
			])
		)
	]),
	...Object.values(threads).flatMap((thread) => {
		const other = people[thread.with];
		const doc = {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: thread.text }] }]
		};
		return [
			insert('chat_threads', 'id, dm_key, created_by, created_at, last_message_at', [
				[thread.id, [people.ada.id, other.id].sort().join(':'), other.id, now - 2, now]
			]),
			insert('chat_thread_members', 'thread_id, user_id, last_read_at, created_at', [
				[thread.id, people.ada.id, now - 1, now - 2],
				[thread.id, other.id, now, now - 2]
			]),
			insert('messages', 'id, thread_id, author_id, body, body_text, created_at', [
				[`m-${thread.id}`, thread.id, other.id, JSON.stringify(doc), thread.text, now]
			])
		];
	}),
	insert('chat_threads', 'id, title, project_id, created_by, created_at, last_message_at', [
		[cave.chatId, '', cave.id, people.ada.id, now, now]
	]),
	insert(
		'chat_thread_members',
		'thread_id, user_id, last_read_at, created_at',
		cave.members.map((who) => [cave.chatId, people[who].id, now, now])
	),
	insert('projects', 'id, name, created_by, created_at, archived_at', [
		[yard.id, yard.name, people.ada.id, now, now]
	]),
	insert('project_members', 'project_id, user_id, created_at', [[yard.id, people.ada.id, now]]),
	insert(
		'posts',
		'id, project_id, author_id, title, body, body_text, created_at, last_activity_at',
		[
			[
				yard.post.id,
				yard.id,
				people.ada.id,
				yard.post.title,
				docOf(yard.post.text),
				yard.post.text,
				now,
				now
			]
		]
	),
	insert('comments', 'id, post_id, author_id, body, body_text, created_at', [
		[
			yard.post.comment.id,
			yard.post.id,
			people.bo.id,
			docOf(yard.post.comment.text),
			yard.post.comment.text,
			now
		]
	]),
	insert('chat_threads', 'id, title, project_id, created_by, created_at, last_message_at', [
		[yard.chatId, '', yard.id, people.ada.id, now, now]
	]),
	insert('chat_thread_members', 'thread_id, user_id, last_read_at, created_at', [
		[yard.chatId, people.ada.id, now, now]
	]),
	insert('chat_threads', 'id, title, created_by, created_at, last_message_at', [
		[crew.id, crew.title, people.bo.id, now - 400_000, now - 100_000]
	]),
	insert(
		'chat_thread_members',
		'thread_id, user_id, last_read_at, created_at',
		[people.ada, people.bo, people.cy].map((person) => [crew.id, person.id, now, now - 400_000])
	),
	// SQLite caps a statement's variables, so the 300 messages go in batches of 50.
	...Array.from({ length: crew.messageCount / 50 }, (_, batch) =>
		insert(
			'messages',
			'id, thread_id, author_id, body, body_text, created_at',
			Array.from({ length: 50 }, (_, i) => {
				const n = batch * 50 + i + 1;
				const author = n % 2 ? people.bo : people.cy;
				return [
					`01E2ECREWM${String(n).padStart(3, '0')}`.padEnd(26, '0'),
					crew.id,
					author.id,
					docOf(crew.text(n)),
					crew.text(n),
					now - 400_000 + n * 1000
				];
			})
		)
	),
	insert('chat_threads', 'id, title, created_by, created_at, last_message_at', [
		[photos.id, photos.title, people.bo.id, now - 100_000, now - 10_000]
	]),
	insert(
		'chat_thread_members',
		'thread_id, user_id, last_read_at, created_at',
		[people.ada, people.bo].map((person) => [photos.id, person.id, now, now - 100_000])
	),
	insert(
		'attachments',
		'id, thread_id, uploaded_by, name, content_type, size, created_at',
		photos.files.map((file, i) => [
			file.id,
			photos.id,
			people.bo.id,
			file.name,
			'image/png',
			png(colours[i]).length,
			now
		])
	),
	insert(
		'messages',
		'id, thread_id, author_id, body, body_text, created_at',
		photos.messages.map(({ id, from, content }, i) => [
			id,
			photos.id,
			people[from].id,
			JSON.stringify({ type: 'doc', content }),
			content[0].type === 'paragraph' ? 'x'.repeat(120) : '',
			now - 50_000 + i * 1000
		])
	),
	insert('calls', 'id, thread_id, started_by, started_at', [
		[call.id, call.threadId, people.ada.id, now]
	]),
	insert(
		'call_participants',
		'id, call_id, user_id, session_id, joined_at',
		(['ada', 'bo'] as const).map((who) => [
			call.participants[who],
			call.id,
			people[who].id,
			`e2e-session-${who}`,
			now + call.joinedAfterSeedMs
		])
	),
	insert('calls', 'id, project_id, started_by, started_at', [
		[endingCalls.project.id, project.id, people.ada.id, now]
	]),
	insert('calls', 'id, thread_id, started_by, started_at', [
		[endingCalls.thread.id, threads.cy.id, people.ada.id, now]
	]),
	insert(
		'call_participants',
		'id, call_id, user_id, session_id, joined_at',
		[endingCalls.project, endingCalls.thread].flatMap(({ id, participants }) =>
			Object.entries(participants).map(([who, participantId]) => [
				participantId,
				id,
				people[who as Person].id,
				`e2e-session-${participantId}`,
				now + endingCalls.joinedAfterSeedMs
			])
		)
	),
	insert('calls', 'id, thread_id, started_by, started_at, ended_at', [
		[pastCall.id, pastCall.threadId, people.ada.id, pastCall.startedAt, pastCall.endedAt]
	]),
	insert('call_participants', 'id, call_id, user_id, session_id, joined_at, left_at', [
		[
			pastCall.participant,
			pastCall.id,
			people.ada.id,
			'e2e-session-past',
			pastCall.startedAt,
			pastCall.endedAt
		]
	]),
	...zonedRows(),
	insert(
		'posts',
		'id, project_id, author_id, title, body, body_text, created_at, last_activity_at',
		Object.values(posts).map((post) => [
			post.id,
			project.id,
			people.ada.id,
			post.title,
			JSON.stringify(post.body),
			post.text,
			now,
			now
		])
	),
	insert('comments', 'id, post_id, author_id, body, body_text, created_at', [
		[comment.id, comment.postId, people.bo.id, JSON.stringify(comment.body), comment.text, now]
	]),
	insert(
		'attachments',
		'id, project_id, uploaded_by, name, content_type, size, created_at',
		images.map((image, i) => [
			image.id,
			project.id,
			people.ada.id,
			image.name,
			'image/png',
			png(colours[i]).length,
			now
		])
	),
	...snowRows()
].join('\n');
const seed = `${persistTo}-seed.sql`;
writeFileSync(seed, sql);
wrangler('d1', 'execute', 'campfire', '--file', seed);

for (const [i, image] of [...images, ...photos.files].entries()) {
	const file = `${persistTo}-${image.name}`;
	writeFileSync(file, png(colours[i % colours.length]));
	wrangler(
		'r2',
		'object',
		'put',
		`campfire/attachments/${image.id}`,
		'--file',
		file,
		'--content-type',
		'image/png'
	);
}

const emojiFile = `${persistTo}-${snow.emoji.name}.png`;
writeFileSync(emojiFile, png(emojiColour));
wrangler(
	'r2',
	'object',
	'put',
	`campfire/emoji/${snow.emoji.id}`,
	'--file',
	emojiFile,
	'--content-type',
	'image/png'
);

// A new VAPID pair for each run, so the Worker signs its pushes with keys that exist only here.
const vapidKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({
	format: 'jwk'
});
const vapid = {
	VAPID_PUBLIC_KEY: Buffer.concat([
		Buffer.of(4),
		Buffer.from(vapidKey.x!, 'base64url'),
		Buffer.from(vapidKey.y!, 'base64url')
	]).toString('base64url'),
	VAPID_PRIVATE_KEY: vapidKey.d!
};
const vars = Object.entries({ ...devVars, ...vapid }).flatMap(([name, value]) => [
	'--var',
	`${name}:${value}`
]);
const dev = spawn('pnpm', ['exec', 'wrangler', 'dev', ...local, ...vars, '--port', String(port)], {
	stdio: 'inherit'
});
process.on('SIGTERM', () => dev.kill('SIGTERM'));
dev.on('exit', (code) => process.exit(code ?? 0));
