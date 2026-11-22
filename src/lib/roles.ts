import type { Role } from './server/db/schema';

// Lowest to highest. Each role can do everything the roles before it can.
const order: Role[] = ['guest', 'viewer', 'member', 'admin'];

export function hasRole(role: Role, minRole: Role): boolean {
	return order.indexOf(role) >= order.indexOf(minRole);
}
