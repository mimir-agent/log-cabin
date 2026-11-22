import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeD1 } from '../testing/fake-d1';
import { useTestEnv } from '../testing/env';
import { calcomWorld, connect, deliver, booking, origin } from './testing';

// 0014 turns the one organization-wide Cal.com connection into the first admin's own.
const migration = readFileSync('migrations/0014_calcom2.sql', 'utf8');
// Today's code reads every table as the latest migration left it, so a test that runs it after
// 0014 applies the migrations that came later too.
const later = readdirSync('migrations')
	.filter((file) => file.endsWith('.sql') && file > '0014_calcom2.sql')
	.sort()
	.map((file) => readFileSync(`migrations/${file}`, 'utf8'));

/** A webhook secret and API key sealed the way the app seals them, with the test SESSION_SECRET. */
async function sealedByTheApp() {
	const w = await calcomWorld();
	const { webhookSecret } = await connect(w.admin, { place: 'room', apiKey: 'cal_live_old' });
	const sealed = w.sqlite
		.prepare('SELECT webhook_secret, api_key FROM calcom_connections')
		.get() as { webhook_secret: string; api_key: string };
	return { webhookSecret, sealed };
}

/** A database as it stood before 0014: two admins, Ada first; Ada's connection in Ops. */
async function before0014() {
	const old = await sealedByTheApp();
	const { DB, sqlite } = fakeD1({ until: '0014' });
	sqlite.exec(`
		INSERT INTO org (id, name, created_at) VALUES (1, 'Campfire', 0);
		INSERT INTO users (id, email, name, created_at) VALUES
			('u-ada', 'ada@example.com', 'Ada', 0),
			('u-bo', 'bo@example.com', 'Bo', 0),
			('u-cy', 'cy@example.com', 'Cy', 0),
			('u-di', 'di@example.com', 'Di', 0);
		INSERT INTO members (id, user_id, role, created_at, deactivated_at) VALUES
			('m-di', 'u-di', 'admin', 1, 2),
			('m-ada', 'u-ada', 'admin', 3, NULL),
			('m-bo', 'u-bo', 'admin', 4, NULL),
			('m-cy', 'u-cy', 'member', 0, NULL);
		INSERT INTO projects (id, name, created_by, created_at) VALUES ('p-ops', 'Ops', 'u-bo', 0);
		INSERT INTO calcom_bookings (id, uid, title, starts_at, ends_at, created_at)
			VALUES ('b1', 'uid-1', 'Intro', 0, 1, 0);
	`);
	sqlite
		.prepare(
			"INSERT INTO calcom_settings (id, project_id, webhook_secret, api_key, updated_at) VALUES (1, 'p-ops', ?, ?, 7)"
		)
		.run(old.sealed.webhook_secret, old.sealed.api_key);
	return { DB, sqlite, old };
}

afterEach(() => vi.unstubAllGlobals());

describe('migration 0014', () => {
	it('makes the organization’s connection the first active admin’s, bookings included', async () => {
		const { sqlite, old } = await before0014();

		sqlite.exec(migration);

		expect(sqlite.prepare('SELECT * FROM calcom_connections').all()).toEqual([
			{
				user_id: 'u-ada',
				webhook_id: expect.stringMatching(/^[0-9a-f]{32}$/),
				webhook_secret: old.sealed.webhook_secret,
				api_key: old.sealed.api_key,
				project_id: 'p-ops',
				updated_at: 7
			}
		]);
		expect(sqlite.prepare('SELECT id, owner_id FROM calcom_bookings').all()).toEqual([
			{ id: 'b1', owner_id: 'u-ada' }
		]);
		const settings = sqlite
			.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'calcom_settings'")
			.get();
		expect(settings?.n).toBe(0);
	});

	it('leaves the old connection working: its secret verifies at the admin’s new webhook URL', async () => {
		const { DB, sqlite, old } = await before0014();
		sqlite.exec(migration);
		for (const sql of later) sqlite.exec(sql);
		const { webhook_id } = sqlite.prepare('SELECT webhook_id FROM calcom_connections').get() as {
			webhook_id: string;
		};
		const calcomApi = vi.fn(async () => Response.json({ status: 'success' }));
		vi.stubGlobal('fetch', calcomApi);
		useTestEnv({
			DB,
			SESSION_SECRET: 'test-session-secret',
			REALTIME_APP_ID: 'app',
			REALTIME_APP_TOKEN: 'token'
		} as unknown as Env);

		const answer = await deliver(
			`${origin}/integrations/calcom/webhook/${webhook_id}`,
			'BOOKING_CREATED',
			booking,
			old.webhookSecret
		);

		expect(answer.status).toBe(201);
		const [, init] = calcomApi.mock.calls[0] as unknown as [string, RequestInit];
		expect(new Headers(init.headers).get('authorization')).toBe('Bearer cal_live_old');
	});

	it('refuses to run when there is a connection and no active admin to carry it', async () => {
		const { sqlite } = await before0014();
		sqlite.exec("UPDATE members SET deactivated_at = 5 WHERE role = 'admin'");

		expect(() => sqlite.exec(migration)).toThrow(
			/NOT NULL constraint failed: calcom_connections\.user_id/
		);
	});

	it('runs on a database where Cal.com was never connected', async () => {
		const { sqlite } = fakeD1({ until: '0014' });
		sqlite.exec(migration);
		expect(sqlite.prepare('SELECT count(*) AS n FROM calcom_connections').get()?.n).toBe(0);
	});
});
