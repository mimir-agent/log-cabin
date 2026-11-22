import { getEnv } from '#lib/server/platform.js';
import { countAnonymousView, excerpt, loadPublicNote } from '#lib/server/notes/public.js';
import { thumbnailSizes } from '#lib/server/notes/thumbnails.js';
import { notes } from '#lib/strings/notes.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals, setHeaders }) => {
	const env = getEnv();
	const [note] = await Promise.all([
		loadPublicNote(env, params.token).catch((e: unknown) => {
			// A dead link stays dead: nothing may keep the 404 and serve it once it works again.
			setHeaders({ 'cache-control': 'no-store' });
			throw e;
		}),
		locals.user ? null : countAnonymousView(env, params.token)
	]);
	// An edit shows, and taking the note down 404s, within a minute. A member's page also holds
	// the root layout's data about them, so only a signed-out page may sit in a shared cache.
	setHeaders({
		'cache-control': `${locals.user ? 'private' : 'public'}, max-age=60`,
		...(note.org.indexable ? {} : { 'x-robots-tag': 'noindex' })
	});
	return {
		title: note.title || notes.editor.titlePlaceholder,
		body: note.body,
		authorName: note.authorName,
		updatedAt: note.updatedAt,
		orgName: note.org.name,
		indexable: note.org.indexable,
		url: url.href,
		filesUrl: `/p/notes/${params.token}/files/`,
		description: excerpt(note.bodyText),
		// The link preview, once one is drawn: crawlers need its absolute URL.
		ogImage:
			note.thumbnailVersion === null
				? null
				: { url: new URL(`/p/notes/${params.token}/og.png`, url).href, ...thumbnailSizes.og }
	};
};
