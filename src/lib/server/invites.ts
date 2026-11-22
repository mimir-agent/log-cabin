import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { db, schema } from './db';
import { roles, type Role } from './db/schema';
import { hashToken, randomToken, type SignedIn } from './auth/session';
import { sendEmail } from './email';
import { inviteMail } from './email/templates';
import { newId } from './id';
import { createMember, memberIdForEmail } from './members';
import { getOrg } from './org';
import { canAddPeople } from './posts/access';
import { listProjects } from './posts/projects';
import { isEmail } from './setup';
import { auth } from '../strings/auth';
import { invites as strings } from '../strings/invites';

export type Invite = typeof schema.invites.$inferSelect;

const day = 24 * 60 * 60 * 1000;
export const emailInviteDays = 7;
export const linkInviteDays = [1, 7, 30] as const;
export const maxEmailsPerInvite = 100;

/**
 * Stores a new invite with the projects accepting it joins, and returns it with the token for
 * its link; only the hash is kept.
 */
async function createInvite(
	env: Env,
	input: {
		email: string | null;
		role: Role;
		invitedBy: string;
		days: number;
		projectIds: string[];
	},
	now: number
): Promise<{ invite: Invite; token: string }> {
	const token = randomToken();
	const d = db(env);
	const invite = await d
		.insert(schema.invites)
		.values({
			id: newId(now),
			tokenHash: await hashToken(token),
			email: input.email,
			role: input.role,
			invitedBy: input.invitedBy,
			expiresAt: now + input.days * day,
			createdAt: now
		})
		.returning()
		.get();
	if (input.projectIds.length) {
		await d
			.insert(schema.inviteProjects)
			.values(input.projectIds.map((projectId) => ({ inviteId: invite.id, projectId })));
	}
	return { invite, token };
}

export function inviteUrl(origin: string, token: string): string {
	return `${origin}/invite/${token}`;
}

/** The open projects `who` may put on an invite: the ones they can add people to. */
export async function starterProjectChoices(env: Env, who: SignedIn) {
	const open = await listProjects(env, who, false);
	return open.filter((project) => canAddPeople(who, project)).map(({ id, name }) => ({ id, name }));
}

/** The starter projects asked for, if `who` may put every one of them on an invite. */
export async function checkStarterProjects(
	env: Env,
	who: SignedIn,
	projectIds: string[]
): Promise<{ ok: true; projectIds: string[] } | { ok: false; message: string }> {
	const allowed = new Set((await starterProjectChoices(env, who)).map((p) => p.id));
	const asked = [...new Set(projectIds)];
	if (asked.some((id) => !allowed.has(id))) {
		return { ok: false, message: strings.errors.projectNotAllowed };
	}
	return { ok: true, projectIds: asked };
}

/**
 * The addresses in pasted text or an uploaded file, lowercased, in order. Commas, semicolons,
 * quotes, angle brackets and whitespace separate them. A file is usually a spreadsheet export
 * with a header row and names beside the addresses, so from a file only entries with an @ count.
 */
export function emailsIn(text: string, from: 'paste' | 'file'): string[] {
	const entries = text
		.toLowerCase()
		.split(/[\s,;"'<>]+/)
		.filter(Boolean);
	return from === 'file' ? entries.filter((entry) => entry.includes('@')) : entries;
}

export type NotSent = { email: string; reason: keyof typeof strings.notSent };
export type BulkInviteOutcome =
	{ ok: true; sent: string[]; notSent: NotSent[] } | { ok: false; message: string };

/**
 * Invites each address with one role and the same starter projects, and emails each its link.
 * An entry that isn't an address, comes twice, belongs to a member or already has an open
 * invite gets nothing, and is reported with the reason. So is one whose mail fails, and its
 * invite is revoked.
 */
export async function inviteEmails(
	env: Env,
	input: {
		emails: string[];
		role: Role;
		projectIds: string[];
		invitedBy: { memberId: string; name: string };
		orgName: string;
		origin: string;
	},
	now = Date.now()
): Promise<BulkInviteOutcome> {
	const { emails } = input;
	if (emails.length === 0) return { ok: false, message: strings.errors.noEmails };
	if (emails.length > maxEmailsPerInvite) {
		return { ok: false, message: strings.errors.tooMany(emails.length, maxEmailsPerInvite) };
	}
	const { users, members } = schema;
	const memberEmails = new Set(
		(
			await db(env)
				.select({ email: users.email })
				.from(users)
				.innerJoin(members, eq(members.userId, users.id))
				.where(inArray(users.email, emails.filter(isEmail)))
		).map((row) => row.email)
	);
	const invitedEmails = new Set((await listOpenInvites(env, now)).map((invite) => invite.email));

	const seen = new Set<string>();
	const sent: string[] = [];
	const notSent: NotSent[] = [];
	for (const email of emails) {
		const reason = !isEmail(email)
			? 'invalid'
			: seen.has(email)
				? 'repeated'
				: memberEmails.has(email)
					? 'member'
					: invitedEmails.has(email)
						? 'invited'
						: null;
		seen.add(email);
		if (reason) {
			notSent.push({ email, reason });
			continue;
		}
		const { invite, token } = await createInvite(
			env,
			{
				email,
				role: input.role,
				invitedBy: input.invitedBy.memberId,
				days: emailInviteDays,
				projectIds: input.projectIds
			},
			now
		);
		try {
			await sendEmail(env, {
				to: email,
				...inviteMail(input.invitedBy.name, input.orgName, inviteUrl(input.origin, token))
			});
		} catch (cause) {
			// A rate limit or a full daily quota fails one mail, not the whole list. The invite
			// goes too, so inviting the address again isn't refused as already invited.
			console.error(`inviteEmails: the invite mail to ${email} failed; revoking its invite`, cause);
			await revokeInvite(env, invite.id, now);
			notSent.push({ email, reason: 'mailFailed' });
			continue;
		}
		sent.push(email);
	}
	return { ok: true, sent, notSent };
}

/**
 * The invite form, in settings and in onboarding: addresses typed in `emails` and in an
 * uploaded `file`, one `role`, and any number of starter `project`s.
 */
export async function inviteFromForm(
	env: Env,
	who: SignedIn,
	form: FormData,
	origin: string
): Promise<BulkInviteOutcome> {
	const role = roles.find((r) => r === form.get('role'));
	if (!role) return { ok: false, message: auth.invites.errors.roleInvalid };
	const starters = await checkStarterProjects(env, who, form.getAll('project').map(String));
	if (!starters.ok) return starters;
	const file = form.get('file');
	const emails = [
		...emailsIn(String(form.get('emails') ?? ''), 'paste'),
		...(file instanceof File ? emailsIn(await file.text(), 'file') : [])
	];
	return inviteEmails(env, {
		emails,
		role,
		projectIds: starters.projectIds,
		invitedBy: { memberId: who.member.id, name: who.user.name },
		orgName: (await getOrg(env)).name,
		origin
	});
}

/** A shareable invite link. The token is returned once and can't be recovered later. */
export async function createInviteLink(
	env: Env,
	input: { role: Role; invitedBy: string; days: number; projectIds: string[] },
	now = Date.now()
): Promise<string> {
	const { token } = await createInvite(env, { email: null, ...input }, now);
	return token;
}

/** The invite a token opens, if it is still open: not accepted, not revoked, not expired. */
export async function findOpenInvite(
	env: Env,
	token: string,
	now = Date.now()
): Promise<Invite | undefined> {
	const { invites } = schema;
	return db(env)
		.select()
		.from(invites)
		.where(
			and(
				eq(invites.tokenHash, await hashToken(token)),
				isNull(invites.acceptedAt),
				isNull(invites.revokedAt),
				gt(invites.expiresAt, now)
			)
		)
		.get();
}

/** The projects accepting an invite joins, by name. */
export function starterProjectsOf(env: Env, inviteId: string) {
	const { inviteProjects, projects } = schema;
	return db(env)
		.select({ id: projects.id, name: projects.name })
		.from(inviteProjects)
		.innerJoin(projects, eq(projects.id, inviteProjects.projectId))
		.where(eq(inviteProjects.inviteId, inviteId))
		.orderBy(projects.name);
}

/** The newest open invite addressed to `email`. */
export async function openInviteForEmail(
	env: Env,
	email: string,
	now = Date.now()
): Promise<Invite | undefined> {
	const { invites } = schema;
	return db(env)
		.select()
		.from(invites)
		.where(
			and(
				eq(invites.email, email),
				isNull(invites.acceptedAt),
				isNull(invites.revokedAt),
				gt(invites.expiresAt, now)
			)
		)
		.orderBy(desc(invites.createdAt))
		.get();
}

export function listOpenInvites(env: Env, now = Date.now()): Promise<Invite[]> {
	const { invites } = schema;
	return db(env)
		.select()
		.from(invites)
		.where(and(isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now)))
		.orderBy(desc(invites.createdAt))
		.all();
}

export async function revokeInvite(env: Env, id: string, now = Date.now()): Promise<void> {
	await db(env).update(schema.invites).set({ revokedAt: now }).where(eq(schema.invites.id, id));
}

/**
 * Someone with an invite link asks for an invite to their own email, which proves they own
 * it when they open it. The invite has the link's role and starter projects. An address that
 * already belongs to a member gets nothing.
 */
export async function requestInviteFromLink(
	env: Env,
	link: Invite,
	input: { email: string; orgName: string; origin: string; inviterName: string },
	now = Date.now()
): Promise<void> {
	if (await memberIdForEmail(env, input.email)) return;
	const projectIds = (await starterProjectsOf(env, link.id)).map((project) => project.id);
	const { token } = await createInvite(
		env,
		{
			email: input.email,
			role: link.role,
			invitedBy: link.invitedBy,
			days: emailInviteDays,
			projectIds
		},
		now
	);
	await sendEmail(env, {
		to: input.email,
		...inviteMail(input.inviterName, input.orgName, inviteUrl(input.origin, token))
	});
}

/**
 * Accepts an email invite: marks it used and makes them a member with the invite's role.
 * `existingUserId` is theirs when they were waiting on a join request (see `createMember`).
 * Returns the new user's id, or null when the invite was already used, revoked or expired.
 */
export async function acceptInvite(
	env: Env,
	invite: Invite & { email: string },
	name: string,
	existingUserId: string | null,
	now = Date.now()
): Promise<string | null> {
	const { invites } = schema;
	const claimed = await db(env)
		.update(invites)
		.set({ acceptedAt: now })
		.where(
			and(
				eq(invites.id, invite.id),
				isNull(invites.acceptedAt),
				isNull(invites.revokedAt),
				gt(invites.expiresAt, now)
			)
		)
		.returning({ id: invites.id })
		.get();
	if (!claimed) return null;
	const member = await createMember(
		env,
		{ email: invite.email, name, role: invite.role, existingUserId },
		now
	);
	await joinStarterProjects(env, member.userId, invite.id, now);
	return member.userId;
}

/**
 * Puts someone who joined through an invite in its starter projects. A guest sees only the
 * projects they belong to, so these are all a guest starts with.
 */
async function joinStarterProjects(
	env: Env,
	userId: string,
	inviteId: string,
	now: number
): Promise<void> {
	const starters = await starterProjectsOf(env, inviteId);
	if (starters.length === 0) return;
	await db(env)
		.insert(schema.projectMembers)
		.values(starters.map(({ id }) => ({ projectId: id, userId, createdAt: now })))
		.onConflictDoNothing();
}
