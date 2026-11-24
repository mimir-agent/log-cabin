// How long a keystroke takes on a long note, on a phone with a slow processor. It types into a
// note of about 3000 words, open live with a second person watching, and into the post
// composer holding the same words, at 390 × 844 with touch and Chrome's CPU slowed 4×; once
// more at normal speed to show the slowdown applied. Each key's main-thread time is read from a
// Chrome trace (scripts/typing-trace.ts). The table and the traces land in test-results/typing.
//
//   pnpm exec playwright test --config playwright.perf.config.ts
//
// Runs differ by about 2 ms at p95 on the same code, so one run can fail the p95 asserts below
// on a head that passes when read as the median of three runs.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import {
	keyWork,
	selfTimes,
	summarise,
	type Key,
	type Summary,
	type TraceEvent
} from '../../scripts/typing-trace.ts';
import { caretTaken, liveContext } from '../e2e/editor.ts';
import { baseURL, people, persistTo, project } from '../e2e/fixtures.ts';

const out = 'test-results/typing';
const noteId = '01E2EL0NGN0TE0000000000000';
const typed = 'the crew walked the ridge at dawn and marked each washout with a flag ';
const phone = {
	baseURL,
	viewport: { width: 390, height: 844 },
	deviceScaleFactor: 3,
	isMobile: true,
	hasTouch: true,
	...liveContext
};

type DocNode = { type: string; attrs?: object; content?: DocNode[]; text?: string };

/** Headings, paragraphs and bullet lists of made-up words, until there are `words` of them. */
function longDoc(words: number): { doc: DocNode; count: number } {
	const vocabulary = typed.trim().split(' ');
	let count = 0;
	const sentence = (length: number) => {
		const text = Array.from({ length }, () => vocabulary[(count++ * 5) % vocabulary.length]);
		return text.join(' ') + '.';
	};
	const paragraph = (text: string): DocNode => ({
		type: 'paragraph',
		content: [{ type: 'text', text }]
	});
	const content: DocNode[] = [];
	for (let section = 1; count < words; section++) {
		content.push({
			type: 'heading',
			attrs: { level: 2 },
			content: [{ type: 'text', text: `Section ${section}` }]
		});
		count += 2;
		for (let i = 0; i < 3; i++) content.push(paragraph(sentence(60)));
		content.push({
			type: 'bulletList',
			content: Array.from({ length: 4 }, () => ({
				type: 'listItem',
				content: [paragraph(sentence(9))]
			}))
		});
	}
	return { doc: { type: 'doc', content }, count };
}

const { doc, count: wordCount } = longDoc(3000);

/** Puts the note in the test database, as serve.ts puts its notes there, and shares it with Bo. */
function seedNote() {
	const now = Date.now();
	const textOf = (node: DocNode): string[] =>
		node.text ? [node.text] : (node.content ?? []).flatMap(textOf);
	const text = textOf(doc).join('\n');
	const quote = (value: string | number) =>
		typeof value === 'number' ? value : `'${value.replaceAll("'", "''")}'`;
	const row = (values: (string | number)[]) => `(${values.map(quote).join(', ')})`;
	const sql = [
		`INSERT INTO notes (id, author_id, title, body, body_text, created_at, updated_at, updated_by) VALUES ${row([noteId, people.ada.id, 'Long note', JSON.stringify(doc), text, now, now, people.ada.id])};`,
		`INSERT INTO note_shares (note_id, user_id, permission, created_at) VALUES ${row([noteId, people.bo.id, 'edit', now])};`
	].join('\n');
	const file = join(tmpdir(), 'typing-seed.sql');
	writeFileSync(file, sql);
	execFileSync(
		'pnpm',
		[
			'exec',
			'wrangler',
			'd1',
			'execute',
			'campfire',
			'--local',
			'--persist-to',
			persistTo,
			'--file',
			file
		],
		{ stdio: 'inherit' }
	);
}

async function signIn(browser: Browser, who: keyof typeof people, options = {}) {
	const context = await browser.newContext({ ...phone, ...options });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	return context.newPage();
}

type Chain = {
	focus(): Chain;
	setTextSelection(at: number): Chain;
	scrollIntoView(): Chain;
	run(): boolean;
};
type EditorElement = HTMLElement & {
	editor: {
		state: {
			doc: {
				descendants(
					each: (node: { isTextblock: boolean; nodeSize: number }, pos: number) => void
				): void;
			};
		};
		chain(): Chain;
		commands: { setContent(content: unknown, options: { emitUpdate: boolean }): boolean };
	};
};

/** Puts the caret at the end of the document's middle text block, or of its last. */
async function placeCaret(body: Locator, where: 'middle' | 'end') {
	await body.evaluate((element, place) => {
		const { editor } = element as EditorElement;
		const ends: number[] = [];
		editor.state.doc.descendants((node, pos) => {
			if (node.isTextblock && node.nodeSize > 2) ends.push(pos + node.nodeSize - 1);
		});
		const at = place === 'end' ? ends.at(-1)! : ends[Math.floor(ends.length / 2)];
		editor.chain().focus().setTextSelection(at).scrollIntoView().run();
	}, where);
	await caretTaken(body);
}

/** Types `text` at ten keys a second. */
async function type(page: Page, text: string) {
	for (const key of text) {
		const started = Date.now();
		await page.keyboard.press(key);
		await page.waitForTimeout(Math.max(0, 100 - (Date.now() - started)));
	}
}

type Row = {
	surface: string;
	where: 'middle' | 'end';
	cpu: number;
	keys: Summary;
	notLaidOut: number;
	selfMs: [string, number][];
};

/** One recorded run: 60 characters typed at `cpu`× slowdown, read back from the trace. */
async function record(
	browser: Browser,
	page: Page,
	body: Locator,
	surface: string,
	where: 'middle' | 'end',
	cpu: number
): Promise<Row> {
	const cdp = await page.context().newCDPSession(page);
	await placeCaret(body, where);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
	await browser.startTracing(page, {
		categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline']
	});
	await type(page, typed.slice(0, 60));
	await page.waitForTimeout(1000);
	const trace = await browser.stopTracing();
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	const name = `${surface.replaceAll(' ', '-')}-${where}-${cpu}x`;
	writeFileSync(join(out, `${name}.trace.json.gz`), gzipSync(trace));
	const parsed = JSON.parse(trace.toString()) as { traceEvents: TraceEvent[] } | TraceEvent[];
	const events = Array.isArray(parsed) ? parsed : parsed.traceEvents;
	const keys: Key[] = keyWork(events);
	return {
		surface,
		where,
		cpu,
		keys: summarise(keys.map((key) => key.ms)),
		notLaidOut: keys.filter((key) => !key.laidOut).length,
		selfMs: selfTimes(events, keys).slice(0, 6)
	};
}

/** How many times each key stringified something as big as the document. */
async function wholeDocStringifies(page: Page, characters: number): Promise<number> {
	await page.evaluate(() => {
		const stringify = JSON.stringify;
		const big: number[] = [];
		Object.assign(window, { bigStringifies: big });
		JSON.stringify = function (this: unknown, ...args: unknown[]) {
			const result = Reflect.apply(stringify, this, args) as string | undefined;
			if (result && result.length > 10_000) big.push(result.length);
			return result;
		} as typeof JSON.stringify;
	});
	await type(page, typed.slice(0, characters));
	const calls = await page.evaluate(
		() => (window as unknown as { bigStringifies: number[] }).bigStringifies.length
	);
	return calls / characters;
}

const fixed = (n: number) => n.toFixed(1);

function table(rows: Row[], stringifies: Record<string, number>): string {
	const head =
		'| surface | where | CPU | keys | p50 ms | p95 ms | max ms | over 16 ms | no layout |';
	const lines = rows.map(
		({ surface, where, cpu, keys, notLaidOut }) =>
			`| ${surface} | ${where} | ${cpu}× | ${keys.n} | ${fixed(keys.p50)} | ${fixed(keys.p95)} | ${fixed(keys.max)} | ${keys.over16} | ${notLaidOut} |`
	);
	const where = rows
		.filter((row) => row.cpu === 4)
		.map(
			(row) =>
				`${row.surface}, ${row.where}, 4×: ${row.selfMs.map(([name, ms]) => `${name} ${fixed(ms)}`).join(', ')}`
		);
	const big = Object.entries(stringifies).map(
		([surface, perKey]) => `${surface}: ${perKey} whole-document JSON.stringify calls per key`
	);
	return [
		`A note of ${wordCount} words.`,
		'',
		head,
		head.replace(/[^|]/g, '-'),
		...lines,
		'',
		'Self time per key in ms, by trace event:',
		...where.map((line) => `- ${line}`),
		'',
		...big.map((line) => `- ${line}`),
		''
	].join('\n');
}

test('typing on a 3000-word note stays under a frame at 4× CPU, live or in the composer', async ({
	browser
}) => {
	test.setTimeout(480_000);
	mkdirSync(out, { recursive: true });
	seedNote();

	// Bo has the note open too, so every key Ada types is sent on to someone.
	const bo = await signIn(browser, 'bo');
	await bo.goto(`/notes/${noteId}`, { waitUntil: 'networkidle' });
	const note = await signIn(browser, 'ada');
	await note.goto(`/notes/${noteId}`, { waitUntil: 'networkidle' });
	await expect(note.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
	const noteBody = note.getByRole('textbox', { name: /^Write something/ });

	const composer = await signIn(browser, 'ada');
	await composer.goto(`/projects/${project.id}/new`, { waitUntil: 'networkidle' });
	const composerBody = composer.locator('.ProseMirror').first();
	await composerBody.evaluate(
		(element, doc) =>
			(element as EditorElement).editor.commands.setContent(doc, { emitUpdate: true }),
		doc
	);

	const surfaces = [
		{ name: 'live note', page: note, body: noteBody },
		{ name: 'composer', page: composer, body: composerBody }
	];
	const rows: Row[] = [];
	const stringifies: Record<string, number> = {};
	for (const { name, page, body } of surfaces) {
		await placeCaret(body, 'middle');
		await type(page, typed.slice(0, 20));
		for (const cpu of [4, 1]) {
			for (const where of ['middle', 'end'] as const) {
				rows.push(await record(browser, page, body, name, where, cpu));
			}
		}
		stringifies[name] = await wholeDocStringifies(page, 20);
	}

	const text = table(rows, stringifies);
	process.stdout.write(`\n${text}\n`);
	writeFileSync(join(out, 'typing.md'), text);

	const find = (surface: string, where: string, cpu: number) =>
		rows.find((row) => row.surface === surface && row.where === where && row.cpu === cpu)!;
	for (const where of ['middle', 'end']) {
		for (const { name } of surfaces) {
			const slow = find(name, where, 4);
			const normal = find(name, where, 1);
			expect.soft(slow.keys.p95, `${name}, ${where}: p95 at 4×`).toBeLessThan(16);
			expect.soft(slow.keys.max, `${name}, ${where}: max at 4×`).toBeLessThanOrEqual(33);
			expect.soft(slow.notLaidOut, `${name}, ${where}: keys with no layout found`).toBeLessThan(6);
			expect
				.soft(normal.keys.p50, `${name}, ${where}: p50 at 1× against 4×, so the slowdown applied`)
				.toBeLessThan(slow.keys.p50);
		}
		expect
			.soft(find('live note', where, 4).keys.p95, `${where}: live note p95 against the composer's`)
			.toBeLessThanOrEqual(find('composer', where, 4).keys.p95 + 2);
	}
	expect.soft(stringifies['live note'], 'whole-document JSON.stringify calls per key').toBe(0);
});
