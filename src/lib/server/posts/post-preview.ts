// A link to a post, pasted in a message, shows as a card of the post (Campsite's post
// attachment in chat), checked against the reader: someone who can't read the post learns
// nothing of it, not even its title.
import { isHttpError } from '@sveltejs/kit';
import type { SignedIn } from '../auth/session';
import type { LinkPreview } from '../../link-preview';
import { loadPost } from './posts';

const postPath = /^\/posts\/([0-9A-Z]{26})$/;

/** The card for a link to one of this org's posts; null for any other link. */
export async function postPreview(
	env: Env,
	who: SignedIn,
	url: URL
): Promise<Extract<LinkPreview, { kind: 'post' | 'unavailable' }> | null> {
	const id = url.pathname.match(postPath)?.[1];
	if (!id) return null;
	try {
		const post = await loadPost(env, who, id);
		return {
			kind: 'post',
			id,
			title: post.title,
			project: post.project.name,
			author: post.authorName
		};
	} catch (e) {
		// Gone, or not this reader's to see: the same card either way.
		if (isHttpError(e) && (e.status === 404 || e.status === 403)) return { kind: 'unavailable' };
		throw e;
	}
}
