import { describe, expect, it } from 'vitest';
import { createInviteLink } from '#lib/server/invites.js';
import { postsWorld, routeEvent } from '#lib/server/testing/posts-world.js';
import { load } from './+page.server';

type LoadEvent = Parameters<typeof load>[0];

const day = 86_400_000;

describe('/settings/invites', () => {
	it('lists the open invites and leaves out expired, accepted and revoked ones', async () => {
		const w = await postsWorld();
		const ida = await w.person('Ida', 'admin');
		const now = Date.now();
		const { id: memberId } = w.sqlite
			.prepare('SELECT id FROM members WHERE user_id = ?')
			.get(ida.user.id) as { id: string };
		const insert = w.sqlite.prepare(
			`INSERT INTO invites (id, token_hash, email, role, invited_by, expires_at, accepted_at, revoked_at, created_at)
			 VALUES (?, ?, ?, 'member', ?, ?, ?, ?, ?)`
		);
		const seed = (
			id: string,
			email: string | null,
			expiresAt: number,
			acceptedAt: number | null = null,
			revokedAt: number | null = null
		) => insert.run(id, `hash-${id}`, email, memberId, expiresAt, acceptedAt, revokedAt, now);
		seed('open', 'open@example.com', now + 3 * day);
		seed('expired', 'expired@example.com', now - day);
		seed('accepted', 'accepted@example.com', now + day, now);
		seed('revoked', 'revoked@example.com', now + day, null, now);
		await createInviteLink(w.env, {
			role: 'member',
			invitedBy: memberId,
			days: 7,
			projectIds: []
		});

		const data = (await load(routeEvent(ida, '/settings/invites', {}) as unknown as LoadEvent)) as {
			invites: { id: string; email: string | null }[];
		};

		expect(data.invites.map((invite) => invite.email).sort()).toEqual([null, 'open@example.com']);
	});
});
