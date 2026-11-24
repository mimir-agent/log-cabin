import { and, asc, eq, isNull } from 'drizzle-orm';
import { db, schema } from './db';
import { domainJoinModes } from './db/schema';
import { auth } from '../strings/auth';
import { invites } from '../strings/invites';
import type { LegalOperator } from '../strings/legal';

export type Org = typeof schema.org.$inferSelect;

export async function getOrg(env: Env): Promise<Org> {
	const org = await db(env).select().from(schema.org).where(eq(schema.org.id, 1)).get();
	if (!org) throw new Error('getOrg: the org row (id 1) is missing; /setup has not run');
	return org;
}

export type Operator = { name: string | null; contact: string | null };

/** What an admin saved in settings, else the deployment's OPERATOR_NAME and LEGAL_CONTACT_EMAIL. */
export async function getOperator(env: Env): Promise<Operator> {
	const row = await db(env)
		.select({ name: schema.org.operatorName, contact: schema.org.operatorContact })
		.from(schema.org)
		.where(eq(schema.org.id, 1))
		.get();
	if (!row) throw new Error('getOperator: the org row (id 1) is missing; /setup has not run');
	return {
		name: row.name ?? (env.OPERATOR_NAME?.trim() || null),
		contact: row.contact ?? (env.LEGAL_CONTACT_EMAIL?.trim() || null)
	};
}

/** The names of the active admins: who the legal pages point to when no contact address is set. */
export async function adminNames(env: Env): Promise<string[]> {
	const rows = await db(env)
		.select({ name: schema.users.name })
		.from(schema.members)
		.innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
		.where(and(eq(schema.members.role, 'admin'), isNull(schema.members.deactivatedAt)))
		.orderBy(asc(schema.users.name));
	return rows.map((row) => row.name);
}

/** The privacy and terms pages' view of the operator: name and contact, and the admins to ask without one. */
export async function legalOperator(env: Env): Promise<LegalOperator> {
	const { name, contact } = await getOperator(env);
	return { name, contact, admins: contact ? [] : await adminNames(env) };
}

export async function updateOrg(
	env: Env,
	changes: Partial<
		Pick<
			Org,
			| 'name'
			| 'logoKey'
			| 'allowedEmailDomain'
			| 'domainJoin'
			| 'googleSignIn'
			| 'aiEnabled'
			| 'calcomEnabled'
			| 'publicPosts'
			| 'publicPostsIndexable'
			| 'customEmojiBy'
			| 'callRecording'
			| 'operatorName'
			| 'operatorContact'
		>
	>
): Promise<void> {
	await db(env).update(schema.org).set(changes).where(eq(schema.org.id, 1));
}

const domainPattern = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** An allowed self-join domain, lowercased; empty means none. */
export function parseDomain(value: string): { ok: true; domain: string | null } | { ok: false } {
	const domain = value.trim().toLowerCase();
	if (!domain) return { ok: true, domain: null };
	return domainPattern.test(domain) ? { ok: true, domain } : { ok: false };
}

/**
 * The email domain fields, in org settings and the first admin's onboarding: `domain`, and
 * `domainJoin` for what signing in with an address there does. Letting people join or ask
 * needs a domain.
 */
export function parseDomainSetting(
	form: FormData
):
	| { ok: true; changes: Pick<Org, 'allowedEmailDomain' | 'domainJoin'> }
	| { ok: false; message: string } {
	const domain = parseDomain(String(form.get('domain') ?? ''));
	if (!domain.ok) return { ok: false, message: auth.orgSettings.errors.domainInvalid };
	const domainJoin = domainJoinModes.find((mode) => mode === form.get('domainJoin'));
	if (!domainJoin) {
		throw new Error(
			`parseDomainSetting: expected domainJoin to be one of ${domainJoinModes.join(', ')}, got ${String(form.get('domainJoin'))}`
		);
	}
	if (domainJoin !== 'off' && !domain.domain) {
		return { ok: false, message: invites.domain.errors.domainMissing };
	}
	return { ok: true, changes: { allowedEmailDomain: domain.domain, domainJoin } };
}
