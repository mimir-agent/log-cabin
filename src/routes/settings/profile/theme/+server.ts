import { getEnv } from '#lib/server/platform.js';
import { error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/auth/guard.js';
import { setTheme } from '#lib/server/people/theme.js';
import { isThemeChoice } from '#lib/styles/theme.js';
import { people } from '#lib/strings/people.js';
import type { RequestHandler } from './$types';

/** POST theme=system|light|dark: the Appearance control saves as soon as it changes. */
export const POST: RequestHandler = async (event) => {
	const { user } = requireMember(event);
	const theme = (await event.request.formData()).get('theme');
	if (!isThemeChoice(theme)) error(400, people.theme.errors.invalid);
	await setTheme(getEnv(), user.id, theme);
	return new Response(null, { status: 204 });
};
