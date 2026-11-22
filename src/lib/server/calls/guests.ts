import { and, eq, gt, lte } from 'drizzle-orm';
import { db, schema } from '../db';
import { hashToken, randomToken } from '../auth/session';
import { newId } from '../id';
import type { GuestCaller } from './calls';

// A guest pass lets one person without an account into one call, with camera and
// microphone only, between notBefore and expiresAt. The token is handed to the guest once
// and only its hash is stored, as with sign-in links. Cal.com bookings issue them for their
// outside attendees (calcom/guests.ts).

/**
 * The cookie that carries a guest's token. It is scoped to the call's own paths, so the
 * browser sends it to the call's guest page and its SFU route and nowhere else.
 */
export const guestPassCookie = 'campfire_guest';
export const guestCookiePath = (callId: string) => `/calls/${callId}`;

/** Issues a pass for the call. createdBy is the member the pass is issued on behalf of. */
export async function createGuestPass(
	env: Env,
	input: { callId: string; name: string; notBefore: number; expiresAt: number; createdBy: string },
	now = Date.now()
): Promise<{ passId: string; token: string }> {
	const name = input.name.trim();
	if (!name) throw new Error(`guest pass for call ${input.callId}: expected a name, got none`);
	if (input.notBefore >= input.expiresAt) {
		throw new Error(
			`guest pass for call ${input.callId}: expected notBefore before expiresAt, got ${input.notBefore} and ${input.expiresAt}`
		);
	}
	const token = randomToken();
	const passId = newId(now);
	await db(env)
		.insert(schema.callGuestPasses)
		.values({ id: passId, ...input, name, tokenHash: await hashToken(token), createdAt: now });
	return { passId, token };
}

/** The guest a token lets into this call right now, or null: unknown, another call's, or outside its window. */
export async function readGuestPass(
	env: Env,
	token: string,
	callId: string,
	now = Date.now()
): Promise<GuestCaller | null> {
	const { callGuestPasses: passes } = schema;
	const pass = await db(env)
		.select()
		.from(passes)
		.where(
			and(
				eq(passes.tokenHash, await hashToken(token)),
				eq(passes.callId, callId),
				lte(passes.notBefore, now),
				gt(passes.expiresAt, now)
			)
		)
		.get();
	return pass ? { guest: { passId: pass.id, callId: pass.callId, name: pass.name } } : null;
}
