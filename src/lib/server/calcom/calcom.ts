// Cal.com bookings get a call in this app. Each member connects their own Cal.com account:
// Cal.com posts their bookings to their own webhook URL, signed with `x-cal-signature-256`,
// the hex HMAC-SHA256 of the raw body keyed with that member's webhook secret
// (https://cal.com/docs/developing/guides/automation/webhooks). With the member's API key,
// the booking's join link is written onto the Cal.com booking as its location
// (https://cal.com/docs/api-reference/v2/bookings/update-booking-location-for-an-existing-booking).
import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import type { BookingAttendee } from '../db/schema';
import { newId } from '../id';
import { randomToken, type SignedIn } from '../auth/session';
import { getOrg } from '../org';
import { listProjects } from '../posts/projects';
import { canWriteInProject } from '../posts/access';
import { startCall } from '../calls/calls';
import type { CallPlace } from '../calls/places';
import { callsEnabled } from '../calls/sfu';
import { calcom as strings } from '../../strings/calcom';

/** Cal.com's API; a self-hosted Cal.com sets CALCOM_API_URL to its own. */
const calcomApi = (env: Env) => env.CALCOM_API_URL ?? 'https://api.cal.com/v2';

/**
 * What the deployment lacks for Cal.com, or null when it has everything: calls, and the
 * secret its settings are sealed with.
 */
export function calcomMissing(env: Env): 'calls' | 'sessionSecret' | 'both' | null {
	const calls = callsEnabled(env);
	const secret = !!env.SESSION_SECRET;
	if (calls && secret) return null;
	if (!calls && !secret) return 'both';
	return calls ? 'sessionSecret' : 'calls';
}

export const calcomAvailable = (env: Env) => calcomMissing(env) === null;

/** Cal.com is on: the deployment has what it needs, and no admin has turned it off. */
export async function calcomOn(env: Env): Promise<boolean> {
	return calcomAvailable(env) && (await getOrg(env)).calcomEnabled;
}

export async function assertCalcomOn(env: Env) {
	if (!(await calcomOn(env))) error(404, strings.errors.off);
}

// Webhook secrets and API keys are stored encrypted with AES-GCM, under a key derived
// from SESSION_SECRET. Changing SESSION_SECRET makes them unreadable: reconnect Cal.com.
async function sealingKey(env: Env): Promise<CryptoKey> {
	if (!env.SESSION_SECRET) {
		throw new Error(
			'Cal.com settings: SESSION_SECRET is not set; expected the secret script/deploy generates'
		);
	}
	const encoder = new TextEncoder();
	const material = await crypto.subtle.importKey(
		'raw',
		encoder.encode(env.SESSION_SECRET),
		'HKDF',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: new Uint8Array(),
			info: encoder.encode('campfire calcom settings')
		},
		material,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

async function seal(env: Env, plain: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const sealed = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		await sealingKey(env),
		new TextEncoder().encode(plain)
	);
	return btoa(String.fromCharCode(...iv, ...new Uint8Array(sealed)));
}

async function unseal(env: Env, stored: string): Promise<string> {
	const bytes = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
	const plain = await crypto.subtle
		.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await sealingKey(env), bytes.slice(12))
		.catch((e: unknown) => {
			throw new Error(
				'Cal.com settings: a saved webhook secret or API key could not be decrypted with the current SESSION_SECRET; it was probably changed. Delete the calcom_connections rows and have everyone connect Cal.com again (see README, Cal.com)',
				{ cause: e }
			);
		});
	return new TextDecoder().decode(plain);
}

export type CalcomConnection = {
	userId: string;
	webhookId: string;
	webhookSecret: string;
	apiKey: string;
	/** Where the member's bookings' calls happen. */
	place: CallPlace;
};

/** Decrypts a connection row the caller has read, or null for no row. */
async function unsealConnection(
	env: Env,
	row: typeof schema.calcomConnections.$inferSelect | undefined
): Promise<CalcomConnection | null> {
	if (!row) return null;
	return {
		userId: row.userId,
		webhookId: row.webhookId,
		webhookSecret: await unseal(env, row.webhookSecret),
		apiKey: await unseal(env, row.apiKey),
		place: row.projectId ? { kind: 'project', id: row.projectId } : { kind: 'room', id: row.userId }
	};
}

/** A member's connection, decrypted, or null when they haven't connected Cal.com. */
export async function getConnection(env: Env, userId: string): Promise<CalcomConnection | null> {
	const { calcomConnections: c } = schema;
	return unsealConnection(env, await db(env).select().from(c).where(eq(c.userId, userId)).get());
}

/** The projects a member may send their bookings' calls to: the ones they can post in. */
export async function bookableProjects(env: Env, who: SignedIn) {
	const projects = await listProjects(env, who, false);
	return projects
		.filter((p) => canWriteInProject(who.member, { ...p, archivedAt: null }))
		.map(({ id, name }) => ({ id, name }));
}

/**
 * Connects the member's Cal.com account, or changes their connection. The webhook URL and
 * secret are made on the first save and kept after that; an apiKey left undefined keeps
 * the stored key. projectId null sends calls to the member's personal room.
 */
export async function saveConnection(
	env: Env,
	who: SignedIn,
	input: { projectId: string | null; apiKey: string | undefined },
	now = Date.now()
): Promise<void> {
	const { calcomConnections: c } = schema;
	const current = await db(env).select().from(c).where(eq(c.userId, who.user.id)).get();
	const apiKey = input.apiKey === undefined ? current?.apiKey : await seal(env, input.apiKey);
	if (!apiKey) throw new Error('saveConnection: expected an API key when first connecting');
	const values = {
		userId: who.user.id,
		webhookId: current?.webhookId ?? randomToken(),
		webhookSecret: current?.webhookSecret ?? (await seal(env, randomToken())),
		apiKey,
		projectId: input.projectId,
		updatedAt: now
	};
	await db(env).insert(c).values(values).onConflictDoUpdate({ target: c.userId, set: values });
}

export async function disconnectCalcom(env: Env, userId: string): Promise<void> {
	const { calcomConnections: c } = schema;
	await db(env).delete(c).where(eq(c.userId, userId));
}

/** Where a member's Cal.com webhook is, under the deployment's own origin. */
export const webhookPath = (webhookId: string) => `/integrations/calcom/webhook/${webhookId}`;

async function signatureMatches(secret: string, body: string, signature: string): Promise<boolean> {
	if (!/^([0-9a-f]{2})+$/i.test(signature)) return false;
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['verify']
	);
	const bytes = Uint8Array.from(signature.match(/../g)!, (pair) => parseInt(pair, 16));
	return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(body));
}

type Booking = {
	uid: string;
	title: string;
	startsAt: number;
	endsAt: number;
	attendees: BookingAttendee[];
};

function parseBooking(payload: unknown): Booking {
	const p = (payload ?? {}) as Record<string, unknown>;
	const text = (field: string) => {
		if (typeof p[field] !== 'string' || !p[field]) {
			error(400, `Cal.com webhook: expected payload.${field} to be a non-empty string`);
		}
		return p[field] as string;
	};
	const time = (field: string) => {
		const ms = Date.parse(text(field));
		if (Number.isNaN(ms)) error(400, `Cal.com webhook: payload.${field} is not a date`);
		return ms;
	};
	if (!Array.isArray(p.attendees)) {
		error(400, 'Cal.com webhook: expected payload.attendees to be an array');
	}
	return {
		uid: text('uid'),
		title: text('title'),
		startsAt: time('startTime'),
		endsAt: time('endTime'),
		attendees: p.attendees.map((a: Record<string, unknown>) => ({
			name: String(a?.name ?? ''),
			email: String(a?.email ?? '')
		}))
	};
}

/**
 * Stores the booking once; Cal.com retries a delivery it thinks failed. A booking with
 * several hosts reaches each host's webhook, and stays with whoever's arrived first.
 */
async function saveBooking(env: Env, ownerId: string, booking: Booking, now: number) {
	const { calcomBookings: b } = schema;
	const [inserted] = await db(env)
		.insert(b)
		.values({ id: newId(now), ownerId, ...booking, createdAt: now })
		.onConflictDoNothing({ target: b.uid })
		.returning();
	if (inserted) return { booking: inserted, created: true };
	const existing = await db(env).select().from(b).where(eq(b.uid, booking.uid)).get();
	return { booking: existing!, created: false };
}

async function setBookingLocation(env: Env, apiKey: string, uid: string, link: string) {
	const response = await fetch(`${calcomApi(env)}/bookings/${encodeURIComponent(uid)}/location`, {
		method: 'PATCH',
		headers: {
			authorization: `Bearer ${apiKey}`,
			'cal-api-version': '2024-08-13',
			'content-type': 'application/json'
		},
		body: JSON.stringify({ location: { type: 'link', link } })
	});
	if (!response.ok) {
		throw new Error(
			`Cal.com: setting booking ${uid}'s location answered ${response.status}, expected 200: ${await response.text()}`
		);
	}
}

/** Where a booking's call is joined: the path, under the deployment's own origin. */
export const bookingCallPath = (id: string) => `/calls/booking/${id}`;

// The link written onto a Cal.com booking carries a signature over the booking's id, so
// the booking's outside attendees, who have no account, can use it to join as guests.
async function linkKey(env: Env): Promise<CryptoKey> {
	const material = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(env.SESSION_SECRET),
		'HKDF',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: new Uint8Array(),
			info: new TextEncoder().encode('campfire calcom guest link')
		},
		material,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

const linkMessage = (bookingId: string) => new TextEncoder().encode(`booking:${bookingId}`);

/** The booking's link, signed, as Cal.com shows it to everyone on the booking. */
export async function bookingLink(env: Env, origin: string, bookingId: string): Promise<string> {
	const mac = await crypto.subtle.sign('HMAC', await linkKey(env), linkMessage(bookingId));
	const signature = btoa(String.fromCharCode(...new Uint8Array(mac)))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replace(/=+$/, '');
	return `${origin}${bookingCallPath(bookingId)}?guest=${signature}`;
}

/** Whether a link's signature is the one bookingLink made for this booking. */
export async function bookingLinkSigned(
	env: Env,
	bookingId: string,
	signature: string
): Promise<boolean> {
	if (!/^[\w-]{43}$/.test(signature)) return false;
	const bytes = Uint8Array.from(atob(signature.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
		c.charCodeAt(0)
	);
	return crypto.subtle.verify('HMAC', await linkKey(env), bytes, linkMessage(bookingId));
}

export async function loadBooking(env: Env, id: string) {
	const { calcomBookings: b } = schema;
	const booking = await db(env).select().from(b).where(eq(b.id, id)).get();
	if (!booking) error(404, strings.errors.bookingNotFound);
	return booking;
}

/** Where a booking's call happens: wherever its owner sends their bookings now. */
export async function bookingPlace(env: Env, booking: { ownerId: string }): Promise<CallPlace> {
	const connection = await getConnection(env, booking.ownerId);
	if (!connection) error(404, strings.errors.ownerDisconnected);
	return connection.place;
}

/** Marks the call as the booking's, unless it already carries a booking. */
export async function tagBookingCall(env: Env, callId: string, bookingId: string) {
	const { calls } = schema;
	await db(env)
		.update(calls)
		.set({ calcomBookingId: bookingId })
		.where(and(eq(calls.id, callId), isNull(calls.calcomBookingId)));
}

/**
 * Starts the booking's call in its owner's chosen place, or joins the one live there, and
 * marks the call as the booking's. A cancelled booking starts nothing.
 */
export async function openBookingCall(
	env: Env,
	who: SignedIn,
	bookingId: string,
	now = Date.now()
): Promise<{ callId: string } | { cancelled: { title: string } }> {
	await assertCalcomOn(env);
	const booking = await loadBooking(env, bookingId);
	if (booking.cancelledAt !== null) return { cancelled: { title: booking.title } };
	const callId = await startCall(env, who, await bookingPlace(env, booking), now);
	await tagBookingCall(env, callId, booking.id);
	return { callId };
}

/** What a call's page shows about the booking it was started from. */
export async function bookingOfCall(env: Env, call: { calcomBookingId: string | null }) {
	if (call.calcomBookingId === null) return null;
	const { title, attendees, startsAt, endsAt } = await loadBooking(env, call.calcomBookingId);
	return { title, attendees, startsAt, endsAt };
}

export type WebhookAnswer = { status: number; body: Record<string, unknown> };

/**
 * Takes one delivery to a member's webhook. A new or rescheduled booking gets its call link,
 * written back onto the Cal.com booking; a cancelled one is marked so.
 * Any other trigger is acknowledged and left alone, so Cal.com doesn't retry it.
 */
export async function receiveWebhook(
	env: Env,
	delivery: { webhookId: string; origin: string; body: string; signature: string | null },
	now = Date.now()
): Promise<WebhookAnswer> {
	await assertCalcomOn(env);
	const { calcomConnections: c, calcomBookings: b } = schema;
	const connection = await unsealConnection(
		env,
		await db(env).select().from(c).where(eq(c.webhookId, delivery.webhookId)).get()
	);
	if (!connection) error(404, strings.errors.notConnected);
	const { body, signature } = delivery;
	if (!signature || !(await signatureMatches(connection.webhookSecret, body, signature))) {
		error(401, strings.errors.badSignature);
	}
	const { triggerEvent, payload } = JSON.parse(body) as {
		triggerEvent?: string;
		payload?: unknown;
	};
	switch (triggerEvent) {
		case 'BOOKING_CREATED':
		case 'BOOKING_RESCHEDULED': {
			const saved = await saveBooking(env, connection.userId, parseBooking(payload), now);
			const url = await bookingLink(env, delivery.origin, saved.booking.id);
			// Another host's connection already wrote the link onto this booking.
			if (saved.booking.ownerId === connection.userId) {
				await setBookingLocation(env, connection.apiKey, saved.booking.uid, url);
			}
			return { status: saved.created ? 201 : 200, body: { id: saved.booking.id, url } };
		}
		case 'BOOKING_CANCELLED': {
			const { uid } = parseBooking(payload);
			await db(env)
				.update(b)
				.set({ cancelledAt: now })
				.where(and(eq(b.uid, uid), eq(b.ownerId, connection.userId)));
			return { status: 200, body: { cancelled: uid } };
		}
		default:
			return { status: 200, body: { ignored: triggerEvent ?? null } };
	}
}
