import { describe, expect, it } from 'vitest';
import { fakeD1 } from '../testing/fake-d1';
import { createOrgAndAdmin } from '../setup';
import { createSession, readSession } from '../auth/session';
import { getMemberByUserId } from '../members';
import { touchLastSeen } from './seen';
import { lastSeenText } from '../../people/seen';

const second = 1000;
const minute = 60 * second;
const start = Date.UTC(2026, 10, 18, 9, 0);

async function world() {
	const { DB } = fakeD1();
	const env = { DB } as unknown as Env;
	const userId = await createOrgAndAdmin(env, {
		orgName: 'Acme',
		adminName: 'Ada',
		email: 'ada@example.com'
	});
	const lastSeen = async () => (await getMemberByUserId(env, userId))!.lastSeenAt;
	return { env, userId, lastSeen };
}

describe('last seen', () => {
	it('is written at most once a minute however often the person does something', async () => {
		const { env, userId, lastSeen } = await world();
		const writes: number[] = [];
		for (let t = start; t < start + 3 * minute; t += 10 * second) {
			await touchLastSeen(env, userId, t);
			const seen = await lastSeen();
			if (seen !== writes.at(-1)) writes.push(seen!);
		}
		expect(writes).toEqual([start, start + minute, start + 2 * minute]);
	});

	it('skips the database when the caller already knows it is fresh', async () => {
		const { env, userId, lastSeen } = await world();
		await touchLastSeen(env, userId, start);
		await touchLastSeen(env, userId, start + 2 * minute, start + 90 * second);
		expect(await lastSeen()).toBe(start);
	});

	it('comes back with the session, so a request can tell whether to write', async () => {
		const { env, userId } = await world();
		await touchLastSeen(env, userId, start);
		const { token } = await createSession(env, userId, start);
		expect((await readSession(env, token, start))?.lastSeenAt).toBe(start);
	});

	it.each([
		[null, 'Not seen yet'],
		[start - 30 * second, 'Active now'],
		[start - 4 * minute, 'Active now'],
		[start - 10 * minute, 'Last seen 10 minutes ago'],
		[start - 3 * 60 * minute, 'Last seen 3 hours ago']
	])('seen at %s reads "%s"', (seenAt, text) => {
		expect(lastSeenText(seenAt, start)).toBe(text);
	});
});
