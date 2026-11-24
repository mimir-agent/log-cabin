import { describe, expect, it } from 'vitest';
import { calcom as strings } from '../../strings/calcom';
import { createProject } from '../posts/projects';
import { useTestEnv } from '../testing/env';
import { load as bookingLoad } from '../../../routes/calls/booking/[id]/+page.server';
import { load as callLoad } from '../../../routes/calls/[id]/+page.server';
import { load as callsIndexLoad } from '../../../routes/calls/+page.server';
import { actions as orgActions } from '../../../routes/settings/org/+page.server';
import type { SignedIn } from '../auth/session';
import {
	book,
	booking,
	calcomAnswers,
	calcomWorld,
	connect,
	connection,
	deliver,
	origin,
	pageEvent,
	saveSettings,
	settingsEvent,
	statusOrRedirect
} from './testing';
import { actions as settingsActions, load } from '../../../routes/settings/calcom/+page.server';

function openLink(who: SignedIn, bookingId: string) {
	return statusOrRedirect(() =>
		bookingLoad(pageEvent(who, `/calls/booking/${bookingId}`, { id: bookingId }))
	);
}

async function callPage(who: SignedIn, callPath: string) {
	const callId = callPath.split('/')[2];
	return (await callLoad(pageEvent(who, callPath, { id: callId }))) as {
		place: { kind: string; id: string };
		booking: { title: string; attendees: { name: string; email: string }[] } | null;
	};
}

describe('Cal.com, one connection per member', () => {
	it('gives each member their own webhook, which takes only their own secret', async () => {
		const w = await calcomWorld();
		const bo = await w.person('Bo', 'member');
		const ada = await connect(w.admin, { place: w.projectId, apiKey: 'cal_live_ada' });
		const bos = await connect(bo, { place: 'room', apiKey: 'cal_live_bo' });

		expect(ada.webhookUrl).not.toBe(bos.webhookUrl);
		expect(ada.webhookSecret).not.toBe(bos.webhookSecret);
		expect(
			(await deliver(ada.webhookUrl, 'BOOKING_CREATED', booking, bos.webhookSecret)).status
		).toBe(401);
		expect(
			(await deliver(bos.webhookUrl, 'BOOKING_CREATED', booking, ada.webhookSecret)).status
		).toBe(401);
		const stored = w.sqlite.prepare('SELECT count(*) AS n FROM calcom_bookings').get();
		expect(stored?.n, 'a booking signed with someone else’s secret must not be stored').toBe(0);

		await book(ada, booking);
		await book(bos, { ...booking, uid: 'bk_bo' });
		const auths = w.calcomRequests().map((r) => r.auth);
		expect(auths, 'each booking’s link is written with its own member’s key').toEqual([
			'Bearer cal_live_ada',
			'Bearer cal_live_bo'
		]);
		const owners = w.sqlite
			.prepare('SELECT uid, owner_id FROM calcom_bookings ORDER BY uid')
			.all()
			.map((r) => [r.uid, r.owner_id]);
		expect(owners).toEqual([
			['bk_123', w.admin.user.id],
			['bk_bo', bo.user.id]
		]);
	});

	it('gives a booking a call link, written onto the Cal.com booking', async () => {
		const w = await calcomWorld();
		const ada = await connect(w.admin, { place: w.projectId, apiKey: 'cal_live_abc' });

		const { id, url } = await book(ada);

		expect(url).toMatch(new RegExp(`^${origin}/calls/booking/${id}\\?guest=[\\w-]{43}$`));
		const [request] = w.calcomRequests();
		expect(request.url).toBe('https://api.cal.com/v2/bookings/bk_123/location');
		expect(request.method).toBe('PATCH');
		expect(request.headers.get('cal-api-version')).toBe('2024-08-13');
		expect(request.body).toEqual({ location: { type: 'link', link: url } });
		const row = w.sqlite.prepare('SELECT * FROM calcom_bookings WHERE id = ?').get(id);
		expect(row).toMatchObject({ uid: 'bk_123', title: booking.title });
		expect(JSON.parse(String(row?.attendees))).toEqual([
			{ name: 'Grace Hopper', email: 'grace@example.org' },
			{ name: 'Alan Turing', email: 'alan@example.org' }
		]);
	});

	it('answers a repeated delivery of the same booking with the same link', async () => {
		const w = await calcomWorld();
		const ada = await connect(w.admin, { place: w.projectId });

		const first = await deliver(ada.webhookUrl, 'BOOKING_CREATED', booking, ada.webhookSecret);
		const again = await deliver(ada.webhookUrl, 'BOOKING_CREATED', booking, ada.webhookSecret);

		expect(again).toEqual({ status: 200, body: first.body });
	});

	it('leaves a booking with two hosts with the host whose webhook got it first', async () => {
		const w = await calcomWorld();
		const bo = await w.person('Bo', 'member');
		const ada = await connect(w.admin, { place: w.projectId, apiKey: 'cal_live_ada' });
		const bos = await connect(bo, { place: 'room', apiKey: 'cal_live_bo' });
		const first = await book(ada);

		const second = await deliver(bos.webhookUrl, 'BOOKING_CREATED', booking, bos.webhookSecret);

		expect(second).toEqual({ status: 200, body: first });
		expect(w.calcomRequests().map((r) => r.auth)).toEqual(['Bearer cal_live_ada']);
	});

	it('refuses a delivery with a wrong or missing signature, or to a webhook nobody has', async () => {
		const w = await calcomWorld();
		const ada = await connect(w.admin, { place: w.projectId });

		expect((await deliver(ada.webhookUrl, 'BOOKING_CREATED', booking, 'not-it')).status).toBe(401);
		expect((await deliver(ada.webhookUrl, 'BOOKING_CREATED', booking, null)).status).toBe(401);
		const unknown = `${origin}/integrations/calcom/webhook/nobodys`;
		expect((await deliver(unknown, 'BOOKING_CREATED', booking, ada.webhookSecret)).status).toBe(
			404
		);
		const stored = w.sqlite.prepare('SELECT count(*) AS n FROM calcom_bookings').get();
		expect(stored?.n).toBe(0);
	});

	it('writes the link through a self-hosted Cal.com’s API when CALCOM_API_URL is set', async () => {
		const w = await calcomWorld();
		useTestEnv({ ...w.env, CALCOM_API_URL: 'https://cal.example.org/api/v2' });
		const ada = await connect(w.admin, { place: w.projectId });

		await book(ada);

		expect(w.calcomRequests()[0].url).toBe(
			'https://cal.example.org/api/v2/bookings/bk_123/location'
		);
	});

	it('fails the delivery when Cal.com refuses the new location, so Cal.com retries it', async () => {
		const w = await calcomWorld();
		const ada = await connect(w.admin, { place: w.projectId });
		calcomAnswers(() => new Response('invalid api key', { status: 401 }));

		await expect(
			deliver(ada.webhookUrl, 'BOOKING_CREATED', booking, ada.webhookSecret)
		).rejects.toThrow(/bk_123.*401.*invalid api key/);
	});

	it('marks a booking cancelled when its owner’s Cal.com reports it cancelled', async () => {
		const w = await calcomWorld();
		const ada = await connect(w.admin, { place: w.projectId });
		await book(ada);

		const answer = await deliver(ada.webhookUrl, 'BOOKING_CANCELLED', booking, ada.webhookSecret);

		expect(answer.status).toBe(200);
		const row = w.sqlite.prepare("SELECT cancelled_at FROM calcom_bookings WHERE uid = 'bk_123'");
		expect(row.get()?.cancelled_at).not.toBeNull();
	});

	it('stores each API key and webhook secret encrypted', async () => {
		const w = await calcomWorld();
		const { webhookSecret } = await connect(w.admin, {
			place: w.projectId,
			apiKey: 'cal_live_abc'
		});

		const raw = w.sqlite.prepare('SELECT webhook_secret, api_key FROM calcom_connections').get();
		expect(String(raw?.api_key)).not.toContain('cal_live_abc');
		expect(String(raw?.webhook_secret)).not.toContain(webhookSecret);
	});

	it('keeps the webhook and the API key when saved with the key left blank', async () => {
		const w = await calcomWorld();
		const before = await connect(w.admin, { place: w.projectId, apiKey: 'cal_live_abc' });

		const after = await connect(w.admin, { place: 'room', apiKey: '' });

		expect(after).toEqual({ ...before, projectId: null });
		await book(after);
		expect(w.calcomRequests()[0].auth).toBe('Bearer cal_live_abc');
	});

	it('refuses to connect without an API key', async () => {
		const w = await calcomWorld();
		const result = await saveSettings(w.admin, { place: w.projectId, apiKey: '' });
		expect(result).toMatchObject({ status: 400 });
		expect(await connection(w.admin)).toBeNull();
	});

	it('offers only the personal room and projects the member can post in', async () => {
		const w = await calcomWorld();
		const bo = await w.person('Bo', 'member');
		const hidden = await createProject(w.env, w.admin, {
			name: 'Sales',
			description: '',
			private: true
		});

		const data = (await load(settingsEvent(bo))) as { projects: { id: string }[] };

		expect(data.projects.map((p) => p.id)).toEqual([w.projectId]);
		expect(await saveSettings(bo, { place: hidden, apiKey: 'k' })).toMatchObject({ status: 400 });
		expect(await saveSettings(bo, { place: 'nowhere', apiKey: 'k' })).toMatchObject({
			status: 400,
			data: { message: strings.errors.placeMissing }
		});
		expect(await connection(bo)).toBeNull();
	});

	it('has no Cal.com page for viewers, who can’t post anywhere', async () => {
		const w = await calcomWorld();
		const viewer = await w.person('Vi', 'viewer');
		expect(await statusOrRedirect(() => load(settingsEvent(viewer)))).toBe(403);
		expect(await statusOrRedirect(() => saveSettings(viewer, { place: 'room', apiKey: 'k' }))).toBe(
			403
		);
	});

	it.each([
		{ off: { sessionSecret: false }, missing: 'sessionSecret', names: ['SESSION_SECRET'] },
		{ off: { calls: false }, missing: 'calls', names: ['REALTIME_APP_ID'] },
		{
			off: { calls: false, sessionSecret: false },
			missing: 'both',
			names: ['REALTIME_APP_ID', 'SESSION_SECRET']
		}
	] as const)('names what is missing when it lacks $missing', async ({ off, missing, names }) => {
		const w = await calcomWorld(off);
		const data = await load(settingsEvent(w.admin));
		expect(data).toEqual({ available: false, missing });
		const shown = strings.settings.unavailable[missing];
		for (const name of names) expect(shown).toContain(name);
		if (missing !== 'both') {
			const other = missing === 'calls' ? 'SESSION_SECRET' : 'REALTIME_APP_ID';
			expect(shown, 'it should not name what the deployment has').not.toContain(other);
		}
	});

	it('says what happened when SESSION_SECRET changed under a saved connection', async () => {
		const w = await calcomWorld();
		const ada = await connect(w.admin, { place: w.projectId });
		useTestEnv({ ...w.env, SESSION_SECRET: 'a-new-session-secret' });

		await expect(
			deliver(ada.webhookUrl, 'BOOKING_CREATED', booking, ada.webhookSecret)
		).rejects.toThrow(/could not be decrypted with the current SESSION_SECRET/);
	});
});

describe('where a booking’s call happens', () => {
	it('starts the call in the project its owner chose, and the call shows the booking', async () => {
		const w = await calcomWorld();
		const { id } = await book(await connect(w.admin, { place: w.projectId }));
		const bo = await w.person('Bo', 'member');

		const callPath = String(await openLink(bo, id));

		expect(callPath).toMatch(/^\/calls\/\w+$/);
		const page = await callPage(bo, callPath);
		expect(page.place).toMatchObject({ kind: 'project', id: w.projectId });
		expect(page.booking?.title).toBe(booking.title);
		expect(page.booking?.attendees.map((a) => a.name)).toEqual(['Grace Hopper', 'Alan Turing']);
		expect(await openLink(w.admin, id), 'a second opener joins').toBe(callPath);
	});

	it('starts the call in its owner’s personal room when they chose it', async () => {
		const w = await calcomWorld();
		const bo = await w.person('Bo', 'member');
		const { id } = await book(await connect(bo, { place: 'room' }));

		const callPath = String(await openLink(w.admin, id));

		const page = await callPage(w.admin, callPath);
		expect(page.place).toMatchObject({ kind: 'room', id: bo.user.id });
		expect(page.booking?.title).toBe(booking.title);
	});

	it('follows the owner’s choice when they change it after the booking', async () => {
		const w = await calcomWorld();
		const { id } = await book(await connect(w.admin, { place: w.projectId }));
		await connect(w.admin, { place: 'room', apiKey: '' });

		const page = await callPage(w.admin, String(await openLink(w.admin, id)));

		expect(page.place).toMatchObject({ kind: 'room', id: w.admin.user.id });
	});

	it('starts nothing from a cancelled booking’s link', async () => {
		const w = await calcomWorld();
		const ada = await connect(w.admin, { place: w.projectId });
		const { id } = await book(ada);
		await deliver(ada.webhookUrl, 'BOOKING_CANCELLED', booking, ada.webhookSecret);

		const opened = await bookingLoad(pageEvent(w.admin, `/calls/booking/${id}`, { id }));

		expect(opened).toEqual({ title: booking.title, lobby: null });
		expect(w.sqlite.prepare('SELECT count(*) AS n FROM calls').get()?.n).toBe(0);
	});

	it('keeps a booking’s call from anyone who can’t see the chosen project', async () => {
		const w = await calcomWorld();
		const secret = await createProject(w.env, w.admin, {
			name: 'Sales',
			description: '',
			private: true
		});
		const { id } = await book(await connect(w.admin, { place: secret }));
		const outsider = await w.person('Cy', 'member');

		expect(await openLink(outsider, id)).toBe(404);
	});

	it('says so when the booking’s owner has disconnected Cal.com', async () => {
		const w = await calcomWorld();
		const { id } = await book(await connect(w.admin, { place: w.projectId }));
		await settingsActions.disconnect(settingsEvent(w.admin));

		const refused = await statusOrRedirect(() =>
			bookingLoad(pageEvent(w.admin, `/calls/booking/${id}`, { id }))
		);
		expect(refused).toBe(404);
	});
});

describe('the admin’s off switch', () => {
	async function turnOff(w: Awaited<ReturnType<typeof calcomWorld>>) {
		const url = new URL(`${origin}/settings/org`);
		const form = new FormData();
		form.set('name', 'Log Cabin');
		form.set('domainJoin', 'off');
		await orgActions.default({
			request: new Request(url, { method: 'POST', body: form }),
			locals: { user: w.admin.user, member: w.admin.member },
			url
		} as never);
	}

	it('stops every member’s webhook and hides the Cal.com page and its link', async () => {
		const w = await calcomWorld();
		const bo = await w.person('Bo', 'member');
		const ada = await connect(w.admin, { place: w.projectId });
		const bos = await connect(bo, { place: 'room' });
		const { id } = await book(bos);
		const callsIndex = async () =>
			((await callsIndexLoad(pageEvent(bo, '/calls', {}))) as { calcom: boolean }).calcom;
		expect(await callsIndex(), 'the calls page links to Cal.com while it is on').toBe(true);

		await turnOff(w);

		for (const who of [ada, bos]) {
			const answer = await deliver(who.webhookUrl, 'BOOKING_CREATED', booking, who.webhookSecret);
			expect(answer).toMatchObject({ status: 404, body: { message: strings.errors.off } });
		}
		expect(await statusOrRedirect(() => load(settingsEvent(bo)))).toBe(404);
		expect(await statusOrRedirect(() => saveSettings(bo, { place: 'room' }))).toBe(404);
		expect(await callsIndex()).toBe(false);
		expect(await openLink(bo, id), 'booking links stop too').toBe(404);
		const kept = w.sqlite.prepare('SELECT count(*) AS n FROM calcom_connections').get();
		expect(kept?.n, 'turning it off keeps everyone’s connection').toBe(2);
	});
});
