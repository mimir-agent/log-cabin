// A post is a moment: a feed row says who and when, and what came back, with the time and the
// answers ending on one edge; a post's page names its author and links its time. On a 390 × 844
// touch screen and a 1280 × 800 window. Against the built Worker (serve.ts).
import {
	expect,
	test,
	type Browser,
	type BrowserContext,
	type BrowserContextOptions,
	type Locator
} from '@playwright/test';
import { d1 } from './database.ts';
import { baseURL, people, posts, project } from './fixtures.ts';

const profiles: Record<string, BrowserContextOptions> = {
	phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
	desktop: { viewport: { width: 1280, height: 800 } }
};

const longName = 'Evelyn Marguerite Abernathy-Featherstonehaugh of the Upper Valley';
const answered = {
	id: '01E2EM0MENT0F1VEANSWERS000',
	title: 'A very long title that has to be cut short before it reaches the time at the right edge'
};
const answerers = ['bo', 'cy', 'dee', 'fay', 'ada'] as const;
const now = Date.now();

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
	const id = (n: number) => `01E2EM0MENTC0MMENT${String(n).padStart(8, '0')}`;
	d1(
		[
			`UPDATE users SET name = '${longName}' WHERE id = '${people.eve.id}'`,
			`INSERT INTO posts (id, project_id, author_id, title, body, body_text, created_at, edited_at, last_activity_at) VALUES ('${answered.id}', '${project.id}', '${people.eve.id}', '${answered.title}', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Five people answered"}]}]}', 'Five people answered this one, and the preview runs long enough to be cut off.', ${now}, ${now}, ${now})`,
			...answerers.map(
				(who, n) =>
					`INSERT INTO comments (id, post_id, author_id, body, body_text, created_at) VALUES ('${id(n)}', '${answered.id}', '${people[who].id}', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Yes"}]}]}', 'Yes', ${now + n})`
			)
		].join('; ')
	);
});

test.afterAll(() => {
	d1(
		[
			`UPDATE users SET name = 'Eve' WHERE id = '${people.eve.id}'`,
			`DELETE FROM comments WHERE post_id = '${answered.id}'`,
			`DELETE FROM posts WHERE id = '${answered.id}'`
		].join('; ')
	);
});

async function signIn(browser: Browser, use: BrowserContextOptions) {
	const context = await browser.newContext({ ...use, baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people.ada.token, url: baseURL }]);
	return context;
}

const rightEdge = async (locator: Locator) =>
	(await locator.evaluate((el) => el.getBoundingClientRect().right)) as number;

for (const [name, use] of Object.entries(profiles)) {
	test.describe(name, () => {
		let context: BrowserContext;

		test.beforeAll(async ({ browser }) => {
			context = await signIn(browser, use);
		});
		test.afterAll(() => context.close());

		test('every feed row names its author and the time of day', async () => {
			const page = await context.newPage();
			await page.goto(`/projects/${project.id}`, { waitUntil: 'networkidle' });
			const rows = page.locator('article.row');
			expect(await rows.count()).toBeGreaterThanOrEqual(3);
			for (const row of await rows.all()) {
				await expect(row.locator('.author')).not.toBeEmpty();
				await expect(row.locator('time.time')).toHaveText(/^\d{1,2}:\d{2}\s[AP]M$/);
			}
			await expect(rows.filter({ hasText: 'Packing' }).locator('.author')).toHaveText('Ada');
			await expect(rows.filter({ hasText: answered.title }).locator('.author')).toHaveText(
				longName
			);
		});

		test('a post with answers shows at most two faces, the bubble and the count; one without shows nothing', async () => {
			const page = await context.newPage();
			await page.goto(`/projects/${project.id}`, { waitUntil: 'networkidle' });
			const rows = page.locator('article.row');

			const five = rows.filter({ hasText: answered.title });
			await expect(five.locator('.answers .face')).toHaveCount(2);
			await expect(five.locator('.answers svg')).toHaveCount(1);
			await expect(five.locator('.answers')).toContainText('5');

			const packing = rows.filter({ hasText: 'Packing' });
			await expect(packing.locator('.answers .face')).toHaveCount(1);

			const photos = rows.filter({ hasText: posts.photos.title });
			await expect(photos.locator('.answers')).toHaveCount(0);
		});

		test('no row has the old grey count chip', async () => {
			const page = await context.newPage();
			await page.goto(`/projects/${project.id}`, { waitUntil: 'networkidle' });
			await expect(page.locator('article.row').first()).toBeVisible();
			await expect(page.locator('article.row .count')).toHaveCount(0);
		});

		test('the time and the answers end on one edge, on every row', async () => {
			const page = await context.newPage();
			await page.goto(`/projects/${project.id}`, { waitUntil: 'networkidle' });
			const edges: number[] = [];
			for (const row of await page.locator('article.row').all()) {
				const time = await rightEdge(row.locator('time.time'));
				edges.push(time);
				const answers = row.locator('.answers');
				if (await answers.count()) {
					expect(Math.abs((await rightEdge(answers)) - time)).toBeLessThanOrEqual(1);
				}
			}
			expect(edges.length).toBeGreaterThanOrEqual(3);
			expect(Math.max(...edges) - Math.min(...edges)).toBeLessThanOrEqual(1);
		});

		test('a post page reads name · time, links its own time and says edited', async () => {
			const page = await context.newPage();
			await page.goto(`/posts/${answered.id}`, { waitUntil: 'networkidle' });
			const byline = page.locator('header.byline');
			await expect(byline).toContainText(longName);
			await expect(byline.locator('a.when')).toHaveAttribute('href', `/posts/${answered.id}`);
			await expect(byline.locator('a.when time')).toBeVisible();
			await expect(byline).toContainText('·');
			await expect(byline).toContainText('edited');
			const text = (await byline.innerText()).replace(/\s+/g, ' ');
			expect(text.indexOf('·')).toBeGreaterThan(text.indexOf(longName));
			expect(text.indexOf('edited')).toBeGreaterThan(text.indexOf('·'));
		});

		test('the post body holds 36em', async () => {
			const page = await context.newPage();
			await page.goto(`/posts/${posts.packing.id}`, { waitUntil: 'networkidle' });
			const body = page.locator('.prose[data-size="post"]').first();
			const { size, max } = await body.evaluate((el) => {
				const style = getComputedStyle(el);
				return { size: parseFloat(style.fontSize), max: style.maxWidth };
			});
			expect(max).toBe(`${size * 36}px`);
		});
	});
}
