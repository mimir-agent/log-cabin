import type { Handle } from '@sveltejs/kit/hooks';
import { getEnv } from '#lib/server/platform.js';
import { readSession, sessionCookie } from '#lib/server/auth/session.js';
import { orgExists } from '#lib/server/setup.js';
import { touchLastSeen } from '#lib/server/people/seen.js';
import { themeHtmlAttribute, themePlaceholder } from '#lib/styles/theme.js';

// Once the org row exists it is never removed, so the answer is cached for the isolate's life.
let orgKnown = false;

function reachableBeforeSetup(path: string): boolean {
	return (
		path === '/setup' ||
		path.startsWith('/_app/') ||
		path.startsWith('/favicon') ||
		path === '/robots.txt'
	);
}

export const handle: Handle = async ({ event, resolve }) => {
	const env = getEnv();

	if (!orgKnown) orgKnown = await orgExists(env);
	if (!orgKnown && !reachableBeforeSetup(event.url.pathname)) {
		return new Response(null, { status: 303, headers: { location: '/setup' } });
	}

	const token = event.cookies.get(sessionCookie);
	const session = token ? await readSession(env, token) : null;
	if (session) await touchLastSeen(env, session.user.id, Date.now(), session.lastSeenAt);
	event.locals.user = session?.user ?? null;
	event.locals.member = session?.member ?? null;
	// A chosen theme is in <html> before the first paint, so the page never flashes the other one.
	const theme = themeHtmlAttribute(session?.user.theme ?? 'system');
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace(themePlaceholder, theme)
	});
};
