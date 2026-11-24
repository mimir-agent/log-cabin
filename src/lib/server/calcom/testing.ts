import { isHttpError, isRedirect } from '@sveltejs/kit';
import { vi } from 'vitest';
import type { SignedIn } from '../auth/session';
import { createProject } from '../posts/projects';
import { callsWorld } from '../calls/testing';
import { actions, load } from '../../../routes/settings/calcom/+page.server';
import { POST as webhook } from '../../../routes/integrations/calcom/webhook/[id]/+server';

// What the Cal.com tests share: an org with calls on, members who connect their own
// Cal.com accounts through the settings page, and Cal.com's deliveries to their webhooks.

export const origin = 'https://campfire.test';

export async function calcomWorld(
	options: { sessionSecret?: boolean; calls?: boolean; recording?: boolean } = {}
) {
	const w = await callsWorld({
		...(options.sessionSecret === false ? {} : { SESSION_SECRET: 'test-session-secret' }),
		...(options.recording && ({ AI: {}, APP_URL: origin } as Partial<Env>)),
		...(options.calls === false && { REALTIME_APP_ID: undefined, REALTIME_APP_TOKEN: undefined })
	});
	w.sqlite.exec("INSERT INTO org (id, name, created_at) VALUES (1, 'Log Cabin', 0)");
	const admin = await w.person('Ada', 'admin');
	const projectId = await createProject(w.env, admin, {
		name: 'Bookings',
		description: '',
		private: false
	});
	/** What was sent to Cal.com's API. */
	const calcomRequests = () => w.sfu.filter((r) => r.url.includes('/bookings/'));
	return { ...w, admin, projectId, calcomRequests };
}

export function settingsEvent(who: SignedIn, fields?: Record<string, string>) {
	const url = new URL(`${origin}/settings/calcom`);
	const form = new FormData();
	for (const [key, value] of Object.entries(fields ?? {})) form.set(key, value);
	return {
		request: new Request(url, { method: 'POST', body: form }),
		locals: { user: who.user, member: who.member },
		url
	} as never;
}

export type Connected = { projectId: string | null; webhookUrl: string; webhookSecret: string };

export async function connection(who: SignedIn): Promise<Connected | null> {
	const data = (await load(settingsEvent(who))) as { connection: Connected | null };
	return data.connection;
}

/** Connects through the settings page; place is 'room' or a project id. */
export async function connect(
	who: SignedIn,
	fields: { place: string; apiKey?: string }
): Promise<Connected> {
	const result = await actions.save(settingsEvent(who, { apiKey: 'cal_live_key', ...fields }));
	if (result && 'status' in result) {
		throw new Error(`connect: expected the save to succeed, got ${JSON.stringify(result)}`);
	}
	return (await connection(who))!;
}

export function saveSettings(who: SignedIn, fields: Record<string, string>) {
	return actions.save(settingsEvent(who, fields));
}

export async function hmacHex(secret: string, body: string) {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
	return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A booking as Cal.com's webhook payload carries it: 30 minutes from 17:00 on 11-20. */
export const booking = {
	uid: 'bk_123',
	title: 'Intro call between Ada and Grace',
	startTime: '2026-11-20T17:00:00Z',
	endTime: '2026-11-20T17:30:00Z',
	attendees: [
		{ name: 'Grace Hopper', email: 'grace@example.org', timeZone: 'UTC' },
		{ name: 'Alan Turing', email: 'alan@example.org', timeZone: 'UTC' }
	]
};

export type Delivered = {
	status: number;
	body: { id?: string; url?: string; message?: string };
};

/** Cal.com posting to a webhook URL, signed with signWith (null: unsigned). */
export async function deliver(
	webhookUrl: string,
	triggerEvent: string,
	payload: object,
	signWith: string | null
): Promise<Delivered> {
	const body = JSON.stringify({ triggerEvent, createdAt: '2026-11-18T13:00:00Z', payload });
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	if (signWith !== null) headers['x-cal-signature-256'] = await hmacHex(signWith, body);
	const url = new URL(webhookUrl);
	try {
		const response = await webhook({
			request: new Request(url, { method: 'POST', body, headers }),
			url,
			params: { id: url.pathname.split('/').pop()! }
		} as never);
		return { status: response.status, body: await response.json() };
	} catch (e) {
		if (isHttpError(e)) return { status: e.status, body: { ...e.body } };
		throw e;
	}
}

/** Delivers a new booking to this member's webhook, signed with their secret. */
export async function book(who: Connected, payload: object = booking) {
	const answer = await deliver(who.webhookUrl, 'BOOKING_CREATED', payload, who.webhookSecret);
	if (answer.status !== 201) {
		throw new Error(`book: expected 201, got ${answer.status} ${JSON.stringify(answer.body)}`);
	}
	return { id: answer.body.id!, url: answer.body.url! };
}

export function pageEvent(
	who: SignedIn | null,
	path: string,
	params: Record<string, string>,
	cookies: Record<string, string> = {}
) {
	return {
		params,
		locals: { user: who?.user ?? null, member: who?.member ?? null },
		url: new URL(origin + path),
		depends: () => {},
		cookies: { get: (name: string) => cookies[name] }
	} as never;
}

/** Where a load redirected to, or the HTTP error status it threw, or 'no redirect'. */
export async function statusOrRedirect(run: () => unknown) {
	try {
		await run();
		return 'no redirect';
	} catch (e) {
		if (isRedirect(e)) return e.location;
		if (isHttpError(e)) return e.status;
		throw e;
	}
}

/** Makes Cal.com's API answer every request with this response. */
export function calcomAnswers(response: () => Response) {
	vi.stubGlobal('fetch', async () => response());
}
