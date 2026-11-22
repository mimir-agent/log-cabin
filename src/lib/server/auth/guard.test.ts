import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { Role } from '../db/schema';
import { requireMember } from './guard';

function event(role: Role | null, path = '/projects/1?tab=posts') {
	return {
		url: new URL(`https://campfire.test${path}`),
		locals: {
			user: role
				? {
						id: 'u1',
						name: 'Ada',
						username: 'ada',
						email: 'ada@example.com',
						avatarUrl: null,
						theme: 'system' as const
					}
				: null,
			member: role ? { id: 'm1', role } : null
		}
	};
}

function thrown(fn: () => unknown): unknown {
	try {
		fn();
	} catch (e) {
		return e;
	}
	throw new Error('expected requireMember to throw, it returned');
}

describe('requireMember', () => {
	it('sends a signed-out visitor to /login with the page to come back to', () => {
		const e = thrown(() => requireMember(event(null)));
		expect(isRedirect(e) && e.status === 303 && e.location).toBe(
			'/login?next=%2Fprojects%2F1%3Ftab%3Dposts'
		);
	});

	it('lets any member through by default, guests included', () => {
		expect(requireMember(event('guest')).member.role).toBe('guest');
	});

	it('answers 403 naming the role when the member is below it', () => {
		const e = thrown(() => requireMember(event('viewer'), 'member'));
		expect(isHttpError(e, 403) && e.body.message).toContain('member');
	});

	it('orders roles guest < viewer < member < admin', () => {
		expect(requireMember(event('admin'), 'member').member.role).toBe('admin');
		expect(requireMember(event('member'), 'viewer').member.role).toBe('member');
		expect(
			isHttpError(
				thrown(() => requireMember(event('member'), 'admin')),
				403
			)
		).toBe(true);
		expect(
			isHttpError(
				thrown(() => requireMember(event('guest'), 'viewer')),
				403
			)
		).toBe(true);
	});
});
