import { activeStatus, type Status } from '../../people/status';
import type { MemberRow } from '../members';
import { getObjectUrl } from '../storage';

/** What any page shows about a person: profile header, hover card, member list. */
export type PersonCard = {
	userId: string;
	name: string;
	username: string;
	avatarUrl: string | null;
	coverUrl: string | null;
	status: Status | null;
	timezone: string;
	lastSeenAt: number | null;
};

export function personCard(row: MemberRow, now = Date.now()): PersonCard {
	return {
		userId: row.userId,
		name: row.name,
		username: row.username,
		avatarUrl: row.avatarKey ? getObjectUrl(row.avatarKey) : null,
		coverUrl: row.coverKey ? getObjectUrl(row.coverKey) : null,
		status: activeStatus(row, now),
		timezone: row.timezone,
		lastSeenAt: row.lastSeenAt
	};
}
