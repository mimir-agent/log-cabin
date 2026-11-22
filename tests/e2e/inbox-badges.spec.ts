// The badge on an inbox row is Campsite's: a reaction's emoji and a follow-up's alarm stand in
// place of the avatar; a comment, reply and feedback request keep the avatar with a quote,
// reply or question-mark badge. Cy's rows are archived so no other spec's unread counts move.
import { expect, test } from '@playwright/test';
import { baseURL, people, post } from './fixtures.ts';
import { d1 } from './database.ts';

const rows = [
	{
		id: '01E2EBADGE0000000000000001',
		kind: 'reaction',
		summary: 'Bo reacted 🎉 to your thread',
		emoji: '🎉'
	},
	{
		id: '01E2EBADGE0000000000000002',
		kind: 'follow_up',
		summary: 'Follow up on Badge probe',
		emoji: null
	},
	{
		id: '01E2EBADGE0000000000000003',
		kind: 'comment',
		summary: 'Bo commented on Badge probe',
		emoji: null
	},
	{
		id: '01E2EBADGE0000000000000004',
		kind: 'reply',
		summary: 'Bo replied to your comment',
		emoji: null
	},
	{
		id: '01E2EBADGE0000000000000005',
		kind: 'feedback',
		summary: 'Bo requested your feedback',
		emoji: null
	},
	{
		id: '01E2EBADGE0000000000000006',
		kind: 'reaction',
		summary: null,
		emoji: null
	}
];

test.beforeAll(() => {
	const values = rows.map(
		({ id, kind, summary, emoji }) =>
			`('${id}', '${people.cy.id}', '${people.bo.id}', '${kind}', 'badge:${id}', '/posts/${post.id}', 'Badge probe', ${summary ? `'${summary}'` : 'NULL'}, ${emoji ? `'${emoji}'` : 'NULL'}, 'e2e:${id}', ${Date.now()}, ${Date.now()}, ${Date.now()})`
	);
	d1(
		`INSERT INTO notifications (id, user_id, actor_id, kind, item_key, url, title, summary, emoji, source, created_at, read_at, archived_at) VALUES ${values.join(', ')};`
	);
});

test.afterAll(() => {
	d1(`DELETE FROM notifications WHERE id IN (${rows.map(({ id }) => `'${id}'`).join(', ')});`);
});

test('inbox badges are Campsite’s', async ({ browser }) => {
	const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
	await context.addCookies([{ name: 'campfire_session', value: people.cy.token, url: baseURL }]);
	const page = await context.newPage();
	await page.goto('/inbox?tab=archived', { waitUntil: 'networkidle' });
	const row = (summary: string) => page.getByRole('listitem').filter({ hasText: summary });

	const reaction = row('Bo reacted 🎉 to your thread');
	await expect(reaction.locator('[data-mark="emoji"]')).toHaveText('🎉');
	await expect(reaction.locator('[data-icon]'), 'no avatar badge').toHaveCount(0);

	// A reaction made before the emoji was stored has neither summary nor emoji: the old row.
	const oldReaction = row('Bo reacted').filter({ hasNotText: '🎉' });
	await expect(oldReaction.locator('[data-icon]')).toBeVisible();
	await expect(oldReaction.locator('[data-mark="emoji"]')).toHaveCount(0);

	await expect(row('Follow up on Badge probe').locator('[data-mark="alarm"]')).toBeVisible();
	await expect(row('Bo commented on Badge probe').locator('[data-icon="quote"]')).toBeVisible();
	await expect(row('Bo replied to your comment').locator('[data-icon="reply2"]')).toBeVisible();
	const feedback = row('Bo requested your feedback').locator('[data-icon="question-mark"]');
	await expect(feedback).toBeVisible();
	await expect(feedback).toHaveAttribute('data-tone', 'brand');
	await context.close();
});
