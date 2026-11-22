// Links in view load their page's code ahead of a tap, but only once the page has loaded and its
// fonts are in: on a slow phone line the extra chunks would otherwise hold up the font.
import { devices, expect, test } from '@playwright/test';
import { baseURL, people } from './fixtures.ts';

test('links in view load their code only after the load event and the fonts', async ({
	browser
}) => {
	const context = await browser.newContext({ ...devices['iPhone 13'], baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	const page = await context.newPage();
	// A slow font, so the fonts come in well after the page's own code.
	await page.route('**/*.woff2', async (route) => {
		await new Promise((done) => setTimeout(done, 1500));
		await route.continue();
	});
	const response = await page.goto('/home');
	// The page's own route code is named in its HTML, and the router loads the root error page
	// (node 1) as it starts; any other route's code is a link's.
	const own = (await response!.text()).match(/\/_app\/immutable\/nodes\/[^"]+/g)!;
	await page.waitForLoadState('networkidle');

	const nodes = await page.evaluate((own) => {
		const [navigation] = performance.getEntriesByType(
			'navigation'
		) as PerformanceNavigationTiming[];
		const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
		const fonts = resources.filter((r) => r.name.endsWith('.woff2'));
		const settled = Math.max(navigation.loadEventStart, ...fonts.map((f) => f.responseEnd));
		const others = resources.filter(({ name }) => {
			const path = new URL(name).pathname;
			return (
				path.startsWith('/_app/immutable/nodes/') &&
				!path.startsWith('/_app/immutable/nodes/1.') &&
				!own.includes(path)
			);
		});
		return {
			fonts: fonts.length,
			early: others.filter((r) => r.startTime < settled).map((r) => r.name),
			late: others.filter((r) => r.startTime >= settled).length
		};
	}, own);
	expect(nodes.fonts, 'the page loads a font').toBeGreaterThan(0);
	expect(nodes.early, 'link code started before the page and fonts were in').toEqual([]);
	expect(nodes.late, 'link code loaded once they were').toBeGreaterThan(0);
	await context.close();
});
