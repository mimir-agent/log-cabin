import { error } from '@sveltejs/kit';
import { db, schema } from './db';
import { newId } from './id';
import { availableUsername, suggestUsername } from './people/usernames';
import { core } from '../strings/core';

export type SetupInput = { orgName: string; adminName: string; email: string };

export type SetupValidation =
	{ ok: true; input: SetupInput } | { ok: false; status: 400 | 403; message: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
	return emailPattern.test(value);
}

/** Checks the setup form. When SETUP_TOKEN is set, the form's token must match it. */
export function validateSetupInput(
	form: { orgName?: string; adminName?: string; email?: string; token?: string },
	setupToken: string | undefined
): SetupValidation {
	const { errors } = core.setup;
	if (setupToken && form.token !== setupToken) {
		return { ok: false, status: 403, message: errors.tokenWrong };
	}
	const orgName = form.orgName?.trim() ?? '';
	const adminName = form.adminName?.trim() ?? '';
	const email = form.email?.trim().toLowerCase() ?? '';
	if (!orgName) return { ok: false, status: 400, message: errors.orgNameMissing };
	if (!adminName) return { ok: false, status: 400, message: errors.adminNameMissing };
	if (!isEmail(email)) return { ok: false, status: 400, message: errors.emailInvalid };
	return { ok: true, input: { orgName, adminName, email } };
}

export async function orgExists(env: Env): Promise<boolean> {
	return (await db(env).select({ id: schema.org.id }).from(schema.org).get()) !== undefined;
}

/** Setup runs once. After that /setup doesn't exist. */
export async function assertNoOrg(env: Env): Promise<void> {
	if (await orgExists(env)) error(404, core.errors.notFound);
}

/** Creates the org row and its first admin in one batch. Returns the admin's user id. */
export async function createOrgAndAdmin(
	env: Env,
	input: SetupInput,
	now = Date.now()
): Promise<string> {
	const d = db(env);
	const userId = newId(now);
	const username = await availableUsername(env, suggestUsername(input.adminName), now);
	await d.batch([
		d.insert(schema.org).values({ id: 1, name: input.orgName, createdAt: now }),
		d.insert(schema.users).values({
			id: userId,
			email: input.email,
			name: input.adminName,
			username,
			createdAt: now
		}),
		d.insert(schema.members).values({ id: newId(now), userId, role: 'admin', createdAt: now })
	]);
	return userId;
}
