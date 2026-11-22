import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Settings has no page of its own: the address opens the first tab, your profile.
export const load: PageServerLoad = () => redirect(307, '/settings/profile');
