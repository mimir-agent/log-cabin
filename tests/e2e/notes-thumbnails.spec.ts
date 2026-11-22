// A note's thumbnail, drawn by the Worker itself: after the note is saved the picture is
// served to people who can open the note, and to no one else.
// `pnpm test:e2e` builds, starts the server (serve.ts) and runs this file.
import { expect, test } from '@playwright/test';
import { baseURL, notes, people } from './fixtures.ts';

const note = notes.meeting;
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test('a saved note gets a thumbnail its readers can fetch and signed-out visitors cannot', async ({
	browser
}) => {
	const context = await browser.newContext({ baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);

	// Saving the note, even under the same title, is a new version to draw.
	const saved = await context.request.post(`/notes/${note.id}?/rename`, {
		form: { title: note.title },
		headers: { origin: baseURL, accept: 'text/html' }
	});
	expect(saved.status(), 'saving the note under its own title').toBeLessThan(400);

	// The job runs after the queue's 5 s hold.
	for (const size of ['grid', 'og']) {
		await expect
			.poll(
				async () => {
					const response = await context.request.get(`/notes/${note.id}/thumbnail?size=${size}`);
					if (response.status() !== 200) return `status ${response.status()}`;
					const bytes = [...(await response.body()).subarray(0, 8)];
					return JSON.stringify(bytes) === JSON.stringify(pngSignature) ? 'png' : 'not a PNG';
				},
				{ message: `the ${size} thumbnail, as a PNG`, timeout: 30_000 }
			)
			.toBe('png');
	}

	const signedOut = await (
		await browser.newContext({ baseURL })
	).request.get(`/notes/${note.id}/thumbnail?size=grid`, { maxRedirects: 0 });
	expect(signedOut.status(), 'a private note’s thumbnail, signed out').not.toBe(200);
});
