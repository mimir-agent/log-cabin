// The invitations page opens, from another page as a tap does, when the org already has invites
// of every kind: open, expired, accepted and revoked. Only the open ones are listed.
import { expect, test } from '@playwright/test';
import { d1 } from './database.ts';
import { baseURL, people } from './fixtures.ts';

const day = 86_400_000;
const eve = `(SELECT id FROM members WHERE user_id = '${people.eve.id}')`;

function seedInvite(id: string, email: string | null, expiresAt: number, state = 'NULL, NULL') {
	d1(
		`INSERT INTO invites (id, token_hash, email, role, invited_by, expires_at, accepted_at, revoked_at, created_at)
		 VALUES ('${id}', 'hash-${id}', ${email ? `'${email}'` : 'NULL'}, 'member', ${eve}, ${expiresAt}, ${state}, ${Date.now()})`
	);
}

test('with open, expired, accepted and revoked invites, the page opens and lists the open ones', async ({
	browser
}) => {
	const now = Date.now();
	seedInvite('01E2EINVITEOPENEMAIL00000', 'open@example.com', now + 3 * day);
	seedInvite('01E2EINVITEOPENLINK000000', null, now + 5 * day);
	seedInvite('01E2EINVITEEXPIRED0000000', 'expired@example.com', now - day);
	seedInvite('01E2EINVITEACCEPTED000000', 'accepted@example.com', now + day, `${now}, NULL`);
	seedInvite('01E2EINVITEREVOKED0000000', 'revoked@example.com', now + day, `NULL, ${now}`);

	const context = await browser.newContext({ baseURL });
	await context.addCookies([{ name: 'campfire_session', value: people.eve.token, url: baseURL }]);
	const page = await context.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));

	await page.goto('/notes', { waitUntil: 'networkidle' });
	await page.evaluate(() => {
		const link = document.createElement('a');
		link.href = '/settings/invites';
		link.textContent = 'to invites';
		document.body.appendChild(link);
	});
	await page.getByRole('link', { name: 'to invites' }).click();

	await expect(page).toHaveURL('/settings/invites');
	await expect(page.getByText('open@example.com')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Revoke' })).toHaveCount(2);
	for (const gone of ['expired', 'accepted', 'revoked']) {
		await expect(page.getByText(`${gone}@example.com`)).toHaveCount(0);
	}
	await expect(page.getByRole('button', { name: 'Create link', exact: true })).toBeVisible();
	expect(errors).toEqual([]);
});
