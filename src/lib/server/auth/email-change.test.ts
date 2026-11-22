import { describe, expect, it } from 'vitest';
import { fakeD1 } from '../testing/fake-d1';
import { createOrgAndAdmin } from '../setup';
import { emailLimit } from './magic-link';
import {
	confirmEmailChange,
	pendingEmailChange,
	requestEmailChange,
	sentEmailChange
} from './email-change';

const origin = 'https://campfire.test';
const minute = 60 * 1000;
const hour = 60 * minute;

async function world() {
	const { DB, sqlite } = fakeD1();
	const env = { DB, EMAIL_TRANSPORT: 'log', EMAIL_FROM: 'Campfire <campfire@example.com>' } as Env;
	await createOrgAndAdmin(env, { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' });
	const ada = sqlite.prepare('SELECT id FROM users').get() as { id: string };
	sqlite
		.prepare(
			`INSERT INTO users (id, email, name, username, created_at) VALUES ('u_bo', 'bo@example.com', 'Bo', 'bo', 0)`
		)
		.run();
	const mails = () =>
		sqlite.prepare('SELECT to_address, subject, text_body FROM dev_mail ORDER BY rowid').all() as {
			to_address: string;
			subject: string;
			text_body: string;
		}[];
	const emailOf = (id: string) =>
		(sqlite.prepare('SELECT email FROM users WHERE id = ?').get(id) as { email: string }).email;
	const ask = (newEmail: string, now: number, ip = '203.0.113.1') =>
		requestEmailChange(env, { userId: ada.id, newEmail, ip, origin, orgName: 'Acme' }, now);
	return { env, sqlite, mails, emailOf, ask, adaId: ada.id };
}

function tokenFromMail(body: string): string {
	const match = body.match(/\/login\/confirm-email\?token=(\S+)/);
	if (!match) throw new Error(`expected a confirm-email link in the mail body, got: ${body}`);
	return decodeURIComponent(match[1]);
}

describe('changing the sign-in email', () => {
	it('mails the new address a link; the old address keeps working until it is opened', async () => {
		const { ask, mails, emailOf, adaId } = await world();
		const now = Date.now();

		expect(await ask('ada.new@example.com', now)).toMatchObject({ ok: true });

		const sent = mails();
		expect(sent).toHaveLength(1);
		expect(sent[0].to_address).toBe('ada.new@example.com');
		expect(sent[0].subject).toBe('Confirm your new email for Acme');
		expect(emailOf(adaId)).toBe('ada@example.com');
	});

	it('shows the pending address until it is confirmed', async () => {
		const { env, ask, mails, adaId } = await world();
		const now = Date.now();
		expect(await pendingEmailChange(env, adaId, now)).toBeNull();

		await ask('ada.new@example.com', now);
		expect(await pendingEmailChange(env, adaId, now + minute)).toBe('ada.new@example.com');

		await confirmEmailChange(
			env,
			tokenFromMail(mails()[0].text_body),
			origin,
			'Acme',
			now + minute
		);
		expect(await pendingEmailChange(env, adaId, now + 2 * minute)).toBeNull();
	});

	it('changes the email when the link is confirmed, and tells the old address', async () => {
		const { env, ask, mails, emailOf, adaId } = await world();
		const now = Date.now();
		await ask('Ada.New@Example.com', now);
		const token = tokenFromMail(mails()[0].text_body);

		const done = await confirmEmailChange(env, token, origin, 'Acme', now + minute);

		expect(done).toEqual({ ok: true, email: 'ada.new@example.com' });
		expect(emailOf(adaId)).toBe('ada.new@example.com');
		const sent = mails();
		expect(sent, 'expected the confirm mail and the notice').toHaveLength(2);
		expect(sent[1].to_address).toBe('ada@example.com');
		expect(sent[1].subject).toBe('Your sign-in email for Acme was changed');
		expect(sent[1].text_body).toContain('ada.new@example.com');
	});

	it('works once', async () => {
		const { env, ask, mails } = await world();
		const now = Date.now();
		await ask('ada.new@example.com', now);
		const token = tokenFromMail(mails()[0].text_body);

		expect((await confirmEmailChange(env, token, origin, 'Acme', now + minute)).ok).toBe(true);
		expect(await confirmEmailChange(env, token, origin, 'Acme', now + 2 * minute)).toEqual({
			ok: false
		});
		expect(mails(), 'a used link must not send another notice').toHaveLength(2);
	});

	it('expires after an hour', async () => {
		const { env, ask, mails, emailOf, adaId } = await world();
		const now = Date.now();
		await ask('ada.new@example.com', now);
		const token = tokenFromMail(mails()[0].text_body);

		expect(await confirmEmailChange(env, token, origin, 'Acme', now + hour + 1)).toEqual({
			ok: false
		});
		expect(emailOf(adaId)).toBe('ada@example.com');
		expect(mails()[0].text_body).toContain('1 hour');
	});

	it('a newer link replaces the older one', async () => {
		const { env, ask, mails } = await world();
		const now = Date.now();
		await ask('first@example.com', now);
		await ask('second@example.com', now + minute);
		const [first, second] = mails().map((m) => tokenFromMail(m.text_body));

		expect(await confirmEmailChange(env, first, origin, 'Acme', now + 2 * minute)).toEqual({
			ok: false
		});
		expect(await confirmEmailChange(env, second, origin, 'Acme', now + 2 * minute)).toEqual({
			ok: true,
			email: 'second@example.com'
		});
	});

	it('refuses an address that is taken, without naming whose, and sends nothing', async () => {
		const { ask, mails } = await world();

		const refused = await ask('bo@example.com', Date.now());

		expect(refused).toEqual({ ok: false, reason: 'taken' });
		expect(mails()).toHaveLength(0);
	});

	it('refuses an address that was taken between the request and the confirm', async () => {
		const { env, sqlite, ask, mails, emailOf, adaId } = await world();
		const now = Date.now();
		await ask('late@example.com', now);
		sqlite
			.prepare(
				`INSERT INTO users (id, email, name, username, created_at) VALUES ('u_cy', 'late@example.com', 'Cy', 'cy', 0)`
			)
			.run();

		expect(
			await confirmEmailChange(
				env,
				tokenFromMail(mails()[0].text_body),
				origin,
				'Acme',
				now + minute
			)
		).toEqual({ ok: false });
		expect(emailOf(adaId)).toBe('ada@example.com');
		expect(mails(), 'no notice for a change that did not happen').toHaveLength(1);
	});

	it('refuses your own address and a malformed one', async () => {
		const { ask } = await world();
		expect(await ask('ADA@example.com', Date.now())).toEqual({ ok: false, reason: 'same' });
		expect(await ask('not an email', Date.now())).toEqual({ ok: false, reason: 'emailInvalid' });
	});

	it('limits requests per member', async () => {
		const { ask, mails } = await world();
		const now = Date.now();
		for (let i = 0; i < emailLimit; i++) {
			expect(await ask(`n${i}@example.com`, now + i)).toMatchObject({ ok: true });
		}
		expect(await ask('one-more@example.com', now + minute)).toEqual({
			ok: false,
			reason: 'rateLimited'
		});
		expect(mails()).toHaveLength(emailLimit);
		expect(await ask('one-more@example.com', now + 16 * minute)).toMatchObject({ ok: true });
	});

	it('counts taken addresses against the limit, so they can’t be probed in bulk', async () => {
		const { ask } = await world();
		const now = Date.now();
		for (let i = 0; i < emailLimit; i++) await ask('bo@example.com', now + i);
		expect(await ask('bo@example.com', now + minute)).toEqual({
			ok: false,
			reason: 'rateLimited'
		});
	});

	it('says which address a live link is for, without using it up', async () => {
		const { env, ask, mails } = await world();
		const now = Date.now();
		await ask('ada.new@example.com', now);
		const token = tokenFromMail(mails()[0].text_body);

		expect(await sentEmailChange(env, token, now + minute)).toBe('ada.new@example.com');
		expect(await sentEmailChange(env, token, now + minute)).toBe('ada.new@example.com');
		expect(await sentEmailChange(env, token, now + hour + minute)).toBeNull();
		expect(await sentEmailChange(env, 'nonsense', now)).toBeNull();

		await confirmEmailChange(env, token, origin, 'Acme', now + minute);
		expect(await sentEmailChange(env, token, now + minute)).toBeNull();
	});

	it('refuses a token that is not a link it sent', async () => {
		const { env } = await world();
		expect(await confirmEmailChange(env, 'nonsense', origin, 'Acme')).toEqual({ ok: false });
	});
});
