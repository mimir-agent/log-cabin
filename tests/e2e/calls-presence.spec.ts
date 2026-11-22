// A call's members stay in it while their call pages are open, however often those pages
// reload their data. The hub's presence is what the server checks: whoever it doesn't see
// on the call's topic, past the join grace, is taken out of the call.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { baseURL, call, people } from './fixtures.ts';

const inCall = (page: Page) => page.getByText('2 people in the call').first();

/** Opens the call page as `who`, keeping every frame it sends on its realtime socket. */
async function open(browser: Browser, who: keyof typeof call.participants) {
	const context = await browser.newContext({ baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people[who].token, url: baseURL }]);
	const page = await context.newPage();
	const sent: string[] = [];
	page.on('websocket', (socket) =>
		socket.on('framesent', (frame) => sent.push(`${frame.payload}`))
	);
	await page.goto(`/calls/${call.id}`);
	await expect(inCall(page)).toBeVisible();
	return { who, page, sent };
}

test('both members stay in the call past the join grace while its pages reload', async ({
	browser
}) => {
	// Seeding came before this test, so this is past the end of both people's join grace.
	const until = Date.now() + call.joinedAfterSeedMs + 30_000;
	test.setTimeout(until - Date.now() + 30_000);
	const both = [await open(browser, 'ada'), await open(browser, 'bo')];

	// Each mute change makes the server tell the call, and every call page reloads its data.
	for (let muted = true; Date.now() < until; muted = !muted) {
		for (const { who, page } of both) {
			const response = await page.request.post(`/calls/${call.id}/sfu`, {
				data: { op: 'media', participantId: call.participants[who], muted, cameraOff: false }
			});
			expect(response.status(), `${who}'s mute change`).toBe(200);
		}
		await both[0].page.waitForTimeout(1000);
	}

	for (const { who, page, sent } of both) {
		await expect(inCall(page), who).toBeVisible();
		// Leaving the topic, even for a moment, would let the server count them gone.
		expect(
			sent.filter((frame) => frame.includes('"unsubscribe"')),
			who
		).toEqual([]);
	}
});
