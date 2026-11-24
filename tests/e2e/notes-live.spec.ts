// Live note editing, end to end: the built Worker under `wrangler dev`, real browsers.
// `pnpm test:e2e` builds, starts the server (serve.ts) and runs this file.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { expect, test, type Browser, type Page } from '@playwright/test';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import { writeUpdate } from 'y-protocols/sync';
import { baseURL, notes, people, persistTo, port, type Person } from './fixtures.ts';

const trip = notes.trip;

/** Signs in as `who` in a browser context of their own and opens the note live. */
async function open(browser: Browser, who: Person, noteId = trip.id): Promise<Page> {
	const context = await browser.newContext({ baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto(`/notes/${noteId}`);
	await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
	return page;
}

/** The note's body: the live editor (the comment box below is another). */
const body = (page: Page) => page.getByRole('textbox', { name: /^Write something/ });

/** The note's text as written, without the names on other people's cursors. */
const written = (page: Page) =>
	body(page).evaluate((element) => {
		const copy = element.cloneNode(true) as HTMLElement;
		for (const caret of copy.querySelectorAll('.live-caret')) caret.remove();
		return copy.textContent ?? '';
	});

/** Status of a WebSocket upgrade to `path` with `who`'s session: 101 when it opens. */
function upgrade(who: Person, path: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const req = request({
			host: 'localhost',
			port,
			path,
			headers: {
				connection: 'Upgrade',
				upgrade: 'websocket',
				'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
				'sec-websocket-version': '13',
				origin: baseURL,
				cookie: `campfire_session=${people[who].token}`
			}
		});
		req.on('upgrade', (_res, socket) => {
			socket.destroy();
			resolve(101);
		});
		req.on('response', (res) => {
			res.resume();
			resolve(res.statusCode ?? 0);
		});
		req.on('error', reject);
		req.end();
	});
}

/** A sync update frame adding a paragraph, as a page could forge it. */
function forgedUpdate(text: string): number[] {
	const doc = new Y.Doc();
	const paragraph = new Y.XmlElement('paragraph');
	paragraph.insert(0, [new Y.XmlText(text)]);
	doc.getXmlFragment('default').insert(0, [paragraph]);
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, 0);
	writeUpdate(encoder, Y.encodeStateAsUpdate(doc));
	return [...encoding.toUint8Array(encoder)];
}

function d1(sql: string): Record<string, unknown>[] {
	const out = execFileSync(
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
			'--json',
			'--command',
			sql
		],
		{ encoding: 'utf8' }
	);
	return JSON.parse(out)[0].results;
}

function r2Snapshot(noteId: string): Buffer {
	const file = `${persistTo}-snapshot.bin`;
	execFileSync('pnpm', [
		'exec',
		'wrangler',
		'r2',
		'object',
		'get',
		`campfire/notes/${noteId}/ydoc.bin`,
		'--local',
		'--persist-to',
		persistTo,
		'--file',
		file
	]);
	return readFileSync(file);
}

test.describe.configure({ mode: 'serial' });

test('a note written before live editing opens with its content intact', async ({ browser }) => {
	const page = await open(browser, 'ada', notes.old.id);
	await expect(body(page).locator('h2')).toHaveText('Route');
	await expect(body(page).locator('strong')).toHaveText('north gate');
	await expect(body(page).locator('li')).toHaveText(['Water', 'Maps']);
	await page.reload();
	await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
	// Seeded once: reopening doesn't add the stored body a second time.
	await expect(body(page).locator('li')).toHaveText(['Water', 'Maps']);
	await page.context().close();
});

test('only people the note is shared with can open its socket', async () => {
	expect(await upgrade('dee', `/realtime/note/${trip.id}`)).toBe(403);
	expect(await upgrade('dee', '/realtime/note/01NOSUCHNOTE00000000000000')).toBe(403);
	expect(await upgrade('cy', `/realtime/note/${trip.id}`)).toBe(101);
});

test('two people typing in the same paragraph at once converge, with named cursors', async ({
	browser
}) => {
	const ada = await open(browser, 'ada');
	const bo = await open(browser, 'bo');
	await body(ada).locator('p').first().click();
	await ada.keyboard.press('End');
	await body(bo).locator('p').first().click();
	await bo.keyboard.press('Home');

	await Promise.all([
		ada.keyboard.type(' tents lanterns', { delay: 40 }),
		bo.keyboard.type('Zephyrquartz stoves ', { delay: 40 })
	]);
	await expect.poll(() => written(ada)).toBe('Zephyrquartz stoves Packing list tents lanterns');
	await expect.poll(() => written(bo)).toBe('Zephyrquartz stoves Packing list tents lanterns');

	await expect(ada.locator('.live-caret-name', { hasText: 'Bo' })).toBeVisible();
	await expect(bo.locator('.live-caret-name', { hasText: 'Ada' })).toBeVisible();
	const here = ada.getByRole('list', { name: 'Here now' });
	await expect
		.poll(() =>
			here.getByRole('listitem').evaluateAll((faces) => faces.map((f) => f.getAttribute('title')))
		)
		.toEqual(['Ada (you)', 'Bo']);
	await ada.context().close();
	await bo.context().close();
});

test('someone who can only view sees changes live, and the server refuses their writes', async ({
	browser
}) => {
	const ada = await open(browser, 'ada');
	const cy = await open(browser, 'cy');
	await expect(body(cy)).toHaveAttribute('contenteditable', 'false');

	await body(ada).locator('p').first().click();
	await ada.keyboard.press('End');
	await ada.keyboard.type(' maps', { delay: 20 });
	await expect.poll(() => written(cy)).toContain('tents lanterns maps');

	const code = await cy.evaluate(
		({ noteId, frame }) =>
			new Promise<number>((resolve) => {
				const ws = new WebSocket(`ws://${location.host}/realtime/note/${noteId}`);
				ws.onopen = () => ws.send(new Uint8Array(frame));
				ws.onclose = (event) => resolve(event.code);
			}),
		{ noteId: trip.id, frame: forgedUpdate('Forged by a viewer') }
	);
	expect(code).toBe(1008);
	await ada.waitForTimeout(500);
	expect(await written(ada)).toBe('Zephyrquartz stoves Packing list tents lanterns maps');
	await ada.context().close();
	await cy.context().close();
});

test('after everyone leaves, the merged text is stored in R2 and D1 and is searchable', async ({
	browser
}) => {
	// The last socket closed in the test before; give the hub a moment to snapshot.
	await expect
		.poll(() => d1(`SELECT body_text FROM notes WHERE id = '${trip.id}'`)[0].body_text, {
			timeout: 10_000
		})
		.toBe('Zephyrquartz stoves Packing list tents lanterns maps');
	const [stored] = d1(`SELECT version FROM notes WHERE id = '${trip.id}'`);
	expect(stored.version).toBeGreaterThan(1);

	const snapshot = new Y.Doc();
	Y.applyUpdate(snapshot, r2Snapshot(trip.id));
	expect(snapshot.getXmlFragment('default').toString()).toContain(
		'Zephyrquartz stoves Packing list tents lanterns maps'
	);

	const ada = await open(browser, 'ada');
	await expect(body(ada)).toHaveText('Zephyrquartz stoves Packing list tents lanterns maps');
	await ada.goto('/search?q=zephyrquartz');
	await expect(ada.getByRole('link', { name: /Trip/ })).toBeVisible();
	await ada.context().close();
});

test('what someone types offline merges when they come back', async ({ browser }) => {
	const ada = await open(browser, 'ada');
	const bo = await open(browser, 'bo');
	await ada.context().setOffline(true);
	await expect(ada.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();

	await body(ada).locator('p').first().click();
	await ada.keyboard.press('End');
	await ada.keyboard.type(' offline-compass', { delay: 20 });
	await body(bo).locator('p').first().click();
	await bo.keyboard.press('Home');
	await bo.keyboard.type('Online-rope ', { delay: 20 });
	await bo.waitForTimeout(500);
	expect(await written(bo)).not.toContain('offline-compass');

	await ada.context().setOffline(false);
	await expect(ada.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();
	await expect.poll(() => written(bo)).toContain('offline-compass');
	await expect.poll(() => written(ada)).toContain('Online-rope');
	expect(await written(ada)).toBe(await written(bo));
	await ada.context().close();
	await bo.context().close();
});
