import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { fakeD1 } from '../testing/fake-d1';
import { createOrgAndAdmin } from '../setup';
import { createMember, getMember } from '../members';
import { db, schema } from '../db';
import { crons } from '../jobs';
import { clearStatus, setStatus } from './status';
import { activeStatus } from '../../people/status';

const minute = 60_000;
// Wednesday 18 November 2026, 10:00 in Tokyo (01:00 UTC).
const now = Date.UTC(2026, 10, 18, 1, 0);

async function org() {
	const { DB } = fakeD1();
	const env = { DB } as unknown as Env;
	await createOrgAndAdmin(env, { orgName: 'Acme', adminName: 'Ada', email: 'ada@example.com' });
	const bo = await createMember(env, { email: 'bo@example.com', name: 'Bo', role: 'member' });
	await db(env)
		.update(schema.users)
		.set({ timezone: 'Asia/Tokyo' })
		.where(eq(schema.users.id, bo.userId));
	const statusOf = async (at: number) => {
		const row = await getMember(env, bo.memberId);
		return row ? activeStatus(row, at) : undefined;
	};
	return { env, bo, statusOf };
}

const lunch = { emoji: '🥪', text: 'Lunch', expiry: '30m' };

describe('setting a status', () => {
	it('shows the emoji and text until it runs out', async () => {
		const { env, bo, statusOf } = await org();
		expect(await setStatus(env, bo.userId, lunch, now)).toEqual({ ok: true });
		expect(await statusOf(now + 29 * minute)).toEqual({
			emoji: '🥪',
			text: 'Lunch',
			expiresAt: now + 30 * minute
		});
		expect(await statusOf(now + 30 * minute)).toBeNull();
	});

	it.each([
		['today', Date.UTC(2026, 10, 18, 15, 0)], // midnight Thursday in Tokyo
		['this_week', Date.UTC(2026, 10, 22, 15, 0)], // midnight at the end of Sunday in Tokyo
		['never', null]
	])('"%s" ends at midnight in the person’s own time zone, or never', async (expiry, endsAt) => {
		const { env, bo, statusOf } = await org();
		await setStatus(env, bo.userId, { ...lunch, expiry }, now);
		expect((await statusOf(now))?.expiresAt).toBe(endsAt);
	});

	it('reads a custom time in the person’s time zone', async () => {
		const { env, bo, statusOf } = await org();
		await setStatus(
			env,
			bo.userId,
			{ ...lunch, expiry: 'custom', customAt: '2026-11-18T18:30' },
			now
		);
		expect((await statusOf(now))?.expiresAt).toBe(Date.UTC(2026, 10, 18, 9, 30));
	});

	it.each([
		['no text', { ...lunch, text: '  ' }],
		['no emoji', { ...lunch, emoji: '' }],
		['more than 80 characters', { ...lunch, text: 'x'.repeat(81) }],
		['an unknown expiry', { ...lunch, expiry: 'tomorrow' }],
		['a custom time in the past', { ...lunch, expiry: 'custom', customAt: '2026-11-18T09:00' }],
		['a custom time that isn’t one', { ...lunch, expiry: 'custom', customAt: 'soon' }]
	])('refuses one with %s', async (_, input) => {
		const { env, bo, statusOf } = await org();
		expect(await setStatus(env, bo.userId, input, now)).toMatchObject({ ok: false });
		expect(await statusOf(now)).toBeNull();
	});

	it('can be cleared by hand', async () => {
		const { env, bo, statusOf } = await org();
		await setStatus(env, bo.userId, { ...lunch, expiry: 'never' }, now);
		await clearStatus(env, bo.userId);
		expect(await statusOf(now)).toBeNull();
	});
});

describe('the five-minute cron', () => {
	it('clears statuses that have run out and leaves the rest', async () => {
		const { env, bo } = await org();
		const cy = await createMember(env, { email: 'cy@example.com', name: 'Cy', role: 'member' });
		await setStatus(env, bo.userId, lunch, now);
		await setStatus(env, cy.userId, { ...lunch, expiry: '4h' }, now);

		await crons['*/5 * * * *'](env, now + 35 * minute);

		const raw = async (memberId: string) => {
			const row = await getMember(env, memberId);
			return row && [row.statusEmoji, row.statusText, row.statusExpiresAt];
		};
		expect(await raw(bo.memberId)).toEqual([null, null, null]);
		expect(await raw(cy.memberId)).toEqual(['🥪', 'Lunch', now + 240 * minute]);
	});
});
