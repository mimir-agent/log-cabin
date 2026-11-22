import { roles, type Role } from './db/schema';
import { db, schema } from './db';
import { newId } from './id';
import { availableUsername, suggestUsername } from './people/usernames';
import { isEmail } from './setup';
import { core } from '../strings/core';

/** Dev sign-in exists only in a dev build, and only when DEV_LOGIN=1 is set. */
export function devLoginEnabled(isDev: boolean, devLoginVar: string | undefined): boolean {
	return isDev && devLoginVar === '1';
}

export type DevLoginInput = { email: string; name: string; role: Role };

export function validateDevLogin(form: {
	email?: string;
	name?: string;
	role?: string;
}): { ok: true; input: DevLoginInput } | { ok: false; message: string } {
	const { errors } = core.devLogin;
	const email = form.email?.trim().toLowerCase() ?? '';
	const name = form.name?.trim() ?? '';
	const role = roles.find((r) => r === form.role);
	if (!isEmail(email)) return { ok: false, message: errors.emailInvalid };
	if (!name) return { ok: false, message: errors.nameMissing };
	if (!role) return { ok: false, message: errors.roleInvalid };
	return { ok: true, input: { email, name, role } };
}

/** Creates or updates the user and member for an email, reactivating a deactivated member. */
export async function upsertDevMember(
	env: Env,
	input: DevLoginInput,
	now = Date.now()
): Promise<string> {
	const d = db(env);
	// Used only when this email has no user yet; an existing one keeps their username.
	const username = await availableUsername(env, suggestUsername(input.name), now);
	const user = await d
		.insert(schema.users)
		.values({ id: newId(now), email: input.email, name: input.name, username, createdAt: now })
		.onConflictDoUpdate({ target: schema.users.email, set: { name: input.name } })
		.returning({ id: schema.users.id })
		.get();
	await d
		.insert(schema.members)
		.values({ id: newId(now), userId: user.id, role: input.role, createdAt: now })
		.onConflictDoUpdate({
			target: schema.members.userId,
			set: { role: input.role, deactivatedAt: null }
		});
	return user.id;
}
