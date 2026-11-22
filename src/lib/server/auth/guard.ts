import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { hasRole } from '../../roles';
import type { Role } from '../db/schema';
import { core } from '../../strings/core';
import type { SignedIn } from './session';

/**
 * The signed-in member, or a redirect to sign-in when there is none, or a 403 when their
 * role is below minRole. The default lets guests through; what a guest may see inside a
 * project is the project's own check.
 */
export function requireMember(
	event: Pick<RequestEvent, 'locals' | 'url'>,
	minRole: Role = 'guest'
): SignedIn {
	const { user, member } = event.locals;
	if (!user || !member) {
		redirect(303, `/login?next=${encodeURIComponent(event.url.pathname + event.url.search)}`);
	}
	if (!hasRole(member.role, minRole)) error(403, core.errors.roleRequired(minRole));
	return { user, member };
}
