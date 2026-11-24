import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { SharePermission } from '../db/schema';
import type { SignedIn } from '../auth/session';
import { canSeeProjectById, loadProject } from '../posts/access';
import { calls as strings } from '../../strings/calls';
import type { LoadedCall } from './calls';

/** The channel a call was shared into after it started, and what its members may do. */
export async function callShare(env: Env, callId: string) {
	const { callShares: s } = schema;
	const row = await db(env)
		.select({ projectId: s.projectId, permission: s.permission })
		.from(s)
		.where(eq(s.callId, callId))
		.get();
	return row ?? null;
}

/** Whether the call was shared into a channel this person can see. */
export async function isSharedWith(
	env: Env,
	userId: string,
	member: { role: SignedIn['member']['role'] },
	callId: string
): Promise<boolean> {
	const share = await callShare(env, callId);
	return !!share && canSeeProjectById(env, member, userId, share.projectId);
}

/**
 * Whether this person may change the call: the person who started it, admins, and the members
 * of the channel it was shared into with edit permission.
 */
export async function canEditCall(
	env: Env,
	who: SignedIn,
	call: { id: string; startedBy: string }
): Promise<boolean> {
	if (call.startedBy === who.user.id || who.member.role === 'admin') return true;
	const share = await callShare(env, call.id);
	return (
		share?.permission === 'edit' &&
		(await canSeeProjectById(env, who.member, who.user.id, share.projectId))
	);
}

/** Shares the call into a channel, or changes the permission of the share it has. */
export async function shareCall(
	env: Env,
	who: SignedIn,
	call: LoadedCall,
	projectId: string,
	permission: SharePermission
) {
	if (!(await canEditCall(env, who, call))) error(403, strings.share.cannotShare);
	await loadProject(env, who, projectId);
	const { callShares } = schema;
	const values = { projectId, permission };
	await db(env)
		.insert(callShares)
		.values({ callId: call.id, ...values })
		.onConflictDoUpdate({ target: callShares.callId, set: values });
}

/** Takes the call out of its channel, so its members lose the access the share gave them. */
export async function unshareCall(env: Env, who: SignedIn, call: LoadedCall) {
	if (!(await canEditCall(env, who, call))) error(403, strings.share.cannotShare);
	await db(env).delete(schema.callShares).where(eq(schema.callShares.callId, call.id));
}
